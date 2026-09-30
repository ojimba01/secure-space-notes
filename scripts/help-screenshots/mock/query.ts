// An in-memory stand-in for the Supabase query builder, enough for the app to
// render every screen the Help guide photographs. Only for screenshots: it
// understands the filters, ordering and related-table selects the app uses and
// quietly ignores anything else.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Row = Record<string, any>;
export type Tables = Record<string, Row[]>;

/** Which table a `<something>_id` column points at. */
const FK_TABLE: Record<string, string> = {
  client_id: 'clients',
  employee_id: 'profiles',
  assigned_employee_id: 'profiles',
  sent_by: 'profiles',
  from_employee_id: 'profiles',
  to_employee_id: 'profiles',
  reassigned_by: 'profiles',
  profile_id: 'profiles',
  created_by: 'profiles',
  signed_by: 'profiles',
};

interface Embed {
  alias: string;
  target: string;
  hint?: string;
  inner: boolean;
  columns: string;
}

/** Split on commas that are not inside brackets. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseSelect(sel: string): { cols: string[] | '*'; embeds: Embed[] } {
  const parts = splitTop(sel.replace(/\s+/g, ' '));
  const cols: string[] = [];
  const embeds: Embed[] = [];
  let star = false;
  for (const p of parts) {
    const m = p.match(/^(?:([\w]+):)?\s*([\w]+)(?:!([\w]+))?\s*\((.*)\)$/s);
    if (m) {
      const [, alias, target, hint, columns] = m;
      embeds.push({
        alias: alias ?? target,
        target,
        hint: hint && hint !== 'inner' ? hint : undefined,
        inner: hint === 'inner',
        columns,
      });
    } else if (p === '*') star = true;
    else cols.push(p.split(':').pop()!.split('::')[0].trim());
  }
  return { cols: star || !cols.length ? '*' : cols, embeds };
}

function resolveEmbed(db: Tables, base: string, row: Row, e: Embed): any {
  // alias:client_id (cols)  -> the column names the foreign key.
  if (e.target in row && FK_TABLE[e.target]) {
    const t = FK_TABLE[e.target];
    return project(db, t, (db[t] ?? []).find((r) => r.id === row[e.target]) ?? null, e.columns);
  }
  const table = e.target;
  // profiles!client_contacts_employee_id_fkey(...)
  if (e.hint) {
    const col = e.hint.replace(`${base}_`, '').replace(/_fkey$/, '');
    return project(db, table, (db[table] ?? []).find((r) => r.id === row[col]) ?? null, e.columns);
  }
  const singular = table.replace(/s$/, '');
  if (`${singular}_id` in row) {
    return project(db, table, (db[table] ?? []).find((r) => r.id === row[`${singular}_id`]) ?? null, e.columns);
  }
  const back = `${base.replace(/s$/, '')}_id`;
  return (db[table] ?? []).filter((r) => r[back] === row.id).map((r) => project(db, table, r, e.columns));
}

function project(db: Tables, table: string, row: Row | null, sel: string): Row | null {
  if (!row) return null;
  const { cols, embeds } = parseSelect(sel);
  const out: Row = cols === '*' ? { ...row } : Object.fromEntries(cols.map((c) => [c, row[c] ?? null]));
  for (const e of embeds) out[e.alias] = resolveEmbed(db, table, row, e);
  return out;
}

const cmp = (a: any, b: any) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : a < b ? -1 : a > b ? 1 : 0);

let idSeq = 1000;
export const newId = () => `00000000-0000-4000-8000-${String(++idSeq).padStart(12, '0')}`;

export function makeFrom(db: Tables, log: (msg: string) => void) {
  return (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const orders: [string, boolean][] = [];
    let limit: number | null = null;
    let range: [number, number] | null = null;
    let selectStr = '*';
    let mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    let payload: any = null;
    let single: 'one' | 'maybe' | null = null;
    let head = false;
    let count = false;
    let returning = false;

    const field = (r: Row, col: string) => (col.includes('.') ? undefined : r[col]);

    const run = () => {
      const rows = (db[table] ??= []);
      if (mode === 'insert' || mode === 'upsert') {
        const list = (Array.isArray(payload) ? payload : [payload]).map((p: Row) => ({
          id: p.id ?? newId(),
          created_at: new Date().toISOString(),
          ...p,
        }));
        for (const r of list) {
          const at = rows.findIndex((x) => x.id === r.id);
          if (at >= 0) rows[at] = { ...rows[at], ...r };
          else rows.push(r);
        }
        log(`${mode.toUpperCase()} ${table}`);
        return list;
      }
      let hit = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') {
        hit.forEach((r) => Object.assign(r, payload));
        log(`UPDATE ${table} ${JSON.stringify(payload)}`);
        return returning ? hit : [];
      }
      if (mode === 'delete') {
        db[table] = rows.filter((r) => !hit.includes(r));
        log(`DELETE ${table}`);
        return [];
      }
      for (const [col, asc] of [...orders].reverse()) hit = [...hit].sort((a, b) => (asc ? 1 : -1) * cmp(a[col], b[col]));
      const total = hit.length;
      if (range) hit = hit.slice(range[0], range[1] + 1);
      if (limit != null) hit = hit.slice(0, limit);
      const { embeds } = parseSelect(selectStr);
      const inner = embeds.filter((e) => e.inner);
      let out = hit.map((r) => project(db, table, r, selectStr)!);
      if (inner.length) out = out.filter((r) => inner.every((e) => r[e.alias]));
      return Object.assign(out, { total });
    };

    const result = () => {
      const data = run() as Row[] & { total?: number };
      if (single) {
        const first = data[0] ?? null;
        if (single === 'one' && !first) return { data: null, error: { message: 'No rows' }, count: null };
        return { data: first, error: null, count: null };
      }
      return { data: head ? null : [...data], error: null, count: count ? data.total ?? data.length : null };
    };

    const q: any = {
      select(sel = '*', opts?: { count?: string; head?: boolean }) {
        if (mode !== 'select') returning = true;
        selectStr = sel;
        head = !!opts?.head;
        count = !!opts?.count;
        return q;
      },
      insert(p: any) { mode = 'insert'; payload = p; return q; },
      upsert(p: any) { mode = 'upsert'; payload = p; return q; },
      update(p: any) { mode = 'update'; payload = p; return q; },
      delete() { mode = 'delete'; return q; },
      eq(c: string, v: any) { filters.push((r) => field(r, c) === undefined && c.includes('.') ? true : r[c] === v); return q; },
      neq(c: string, v: any) { filters.push((r) => c.includes('.') || r[c] !== v); return q; },
      in(c: string, vs: any[]) { filters.push((r) => c.includes('.') || vs.includes(r[c])); return q; },
      is(c: string, v: any) { filters.push((r) => c.includes('.') || (v === null ? r[c] == null : r[c] === v)); return q; },
      not(c: string, op: string, v: any) {
        filters.push((r) => (op === 'is' && v === null ? r[c] != null : op === 'in' ? true : r[c] !== v));
        return q;
      },
      gt(c: string, v: any) { filters.push((r) => r[c] > v); return q; },
      gte(c: string, v: any) { filters.push((r) => r[c] >= v); return q; },
      lt(c: string, v: any) { filters.push((r) => r[c] < v); return q; },
      lte(c: string, v: any) { filters.push((r) => r[c] <= v); return q; },
      ilike(c: string, v: string) {
        const re = new RegExp(`^${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i');
        filters.push((r) => re.test(String(r[c] ?? '')));
        return q;
      },
      like(c: string, v: string) { return q.ilike(c, v); },
      // or('status.eq.closed,workflow_stage.eq.closed'): simple eq / is / in / lt / gt only.
      or(expr: string) {
        const conds = splitTop(expr).map((part) => {
          const m = part.match(/^([\w]+)\.(eq|neq|is|in|lt|lte|gt|gte|ilike)\.(.*)$/);
          if (!m) return () => true;
          const [, col, op, raw] = m;
          const val = raw === 'null' ? null : raw === 'true' ? true : raw === 'false' ? false : raw;
          return (r: Row) => {
            const v = r[col];
            if (op === 'eq') return String(v) === String(val);
            if (op === 'neq') return String(v) !== String(val);
            if (op === 'is') return val === null ? v == null : v === val;
            if (op === 'in') return raw.replace(/[()]/g, '').split(',').includes(String(v));
            if (op === 'lt') return v != null && v < val;
            if (op === 'lte') return v != null && v <= val;
            if (op === 'gt') return v != null && v > val;
            if (op === 'gte') return v != null && v >= val;
            return true;
          };
        });
        filters.push((r) => conds.some((c) => c(r)));
        return q;
      },
      filter() { return q; },
      match(o: Row) { Object.entries(o).forEach(([k, v]) => filters.push((r) => r[k] === v)); return q; },
      contains() { return q; },
      textSearch() { return q; },
      order(c: string, o?: { ascending?: boolean }) { if (!c.includes('.')) orders.push([c, o?.ascending !== false]); return q; },
      limit(n: number) { limit = n; return q; },
      range(a: number, b: number) { range = [a, b]; return q; },
      single() { single = 'one'; return q; },
      maybeSingle() { single = 'maybe'; return q; },
      abortSignal() { return q; },
      then(res: any, rej: any) { return Promise.resolve().then(result).then(res, rej); },
    };
    return q;
  };
}
