// Billing → Workbook: the agency's Google Sheet, in the app, over live data.
//
// Full screen and spreadsheet-shaped on purpose: tabs along the bottom, a
// frozen name column, columns and rows that can be dragged, resized and
// removed, a filter row, and one search across everything. Unlike the sheet,
// every cell is the client record itself — typing here changes the record,
// and anything the app works out (end dates, billing and payment status) is
// calculated rather than typed.
//
// How it is arranged (tab names, column order and widths, hidden columns, row
// order and heights) is shared by the whole team, as the Google Sheet was.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import {
  Check,
  Columns3,
  Download,
  ExternalLink,
  Filter,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CloseCaseDialog } from '@/components/CloseCaseDialog';
import {
  resyncDerivedSchedules,
  syncAuthorizationsFromLegacyColumns,
  touchesAuthorizationData,
} from '@/lib/authorizations';
import { formatMoney, MCO_OPTIONS, type BillingCycle } from '@/lib/billing';
import {
  COLUMNS,
  GROUP_LABEL,
  KIND_TIP,
  LAPSE_BUFFER_DAYS,
  lapsedRows,
  shown,
  TRACKER_COLUMNS,
  trackerRows,
  WB_SELECT,
  type Column,
  type Extra,
  type Group,
  type Kind,
  type WbClient,
} from './columns';

type Sheet = 'master' | 'pending' | 'approved' | 'closed' | 'tracker' | 'second';

const SHEETS: { key: Sheet; label: string }[] = [
  { key: 'master', label: 'Master' },
  { key: 'pending', label: 'Pending approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'closed', label: 'Closed' },
  { key: 'tracker', label: 'Billing tracker' },
  { key: 'second', label: '2nd authorization' },
];

const KIND_BAR: Record<Kind, string> = {
  manual: 'bg-primary',
  drop: 'bg-green-600',
  auto: 'bg-slate-400',
  docs: 'bg-orange-400',
};

// ---- layout, shared by the whole team ------------------------------------
//
// One arrangement for everybody, like the Google Sheet had: tab names, column
// order, widths and hidden columns, row order and heights. It is kept in the
// billing_workbook_layout table, read when the Workbook opens (and again when
// the window comes back into focus), and written a moment after each change.
// The browser keeps a copy only so the Workbook opens in the right shape
// before the saved one arrives.

interface Layout {
  sheetNames: Partial<Record<Sheet, string>>;
  colOrder: string[];
  colWidths: Record<string, number>;
  removed: string[];
  groups: Group[];
  rowOrder: string[];
  rowHeights: Record<string, number>;
}

const LAYOUT_KEY = 'billingWorkbookLayout:v1';
const LAYOUT_ROW = 'team';
const ALL_GROUPS = Object.keys(GROUP_LABEL) as Group[];

const DEFAULT_LAYOUT: Layout = {
  sheetNames: {},
  colOrder: COLUMNS.map((c) => c.key),
  colWidths: {},
  removed: [],
  groups: ALL_GROUPS,
  rowOrder: [],
  rowHeights: {},
};

/** A saved layout, made safe for the columns the app has now. */
function normalize(saved: Partial<Layout> | null | undefined): Layout {
  if (!saved || typeof saved !== 'object') return DEFAULT_LAYOUT;
  // Columns added since the layout was saved go on the end.
  const known = (saved.colOrder ?? []).filter((k) => COLUMNS.some((c) => c.key === k));
  const colOrder = [...known, ...COLUMNS.map((c) => c.key).filter((k) => !known.includes(k))];
  return { ...DEFAULT_LAYOUT, ...saved, colOrder };
}

function cachedLayout(): Layout {
  try {
    return normalize(JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null'));
  } catch {
    return DEFAULT_LAYOUT;
  }
}

// Newer than the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const layoutTable = () => (supabase.from as any)('billing_workbook_layout');

async function fetchTeamLayout(): Promise<Partial<Layout> | null> {
  const { data } = await layoutTable().select('layout').eq('id', LAYOUT_ROW).maybeSingle();
  const layout = data?.layout as Partial<Layout> | undefined;
  return layout && Object.keys(layout).length ? layout : null;
}

let pendingSave: number | undefined;
function saveLayout(layout: Layout) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // Storage refused (private window); the team copy is what matters.
  }
  window.clearTimeout(pendingSave);
  pendingSave = window.setTimeout(() => {
    void layoutTable()
      .upsert({ id: LAYOUT_ROW, layout, updated_at: new Date().toISOString() })
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) toast.error('Could not save the layout for the team', { description: error.message });
      });
  }, 600);
}

// ---- one editable cell -------------------------------------------------

const Cell: React.FC<{
  col: Column;
  value: string;
  onSave: (v: string) => void;
}> = ({ col, value, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const tone = col.kind === 'auto' ? 'text-muted-foreground' : '';

  if (col.kind === 'auto' || (!col.field && col.key !== 'name')) {
    return <div className={`min-h-[32px] truncate px-2 py-1.5 ${tone}`} title={shown(col, value)}>{shown(col, value)}</div>;
  }

  if (col.kind === 'drop') {
    const options = col.options ?? [];
    return (
      <select
        className="h-full w-full cursor-pointer bg-transparent px-1.5 py-1.5 outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
        value={value}
        onChange={(e) => onSave(e.target.value)}
        aria-label={col.label}
      >
        <option value="">—</option>
        {value && !options.includes(value) && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={`block min-h-[32px] w-full cursor-text truncate px-2 py-1.5 text-left hover:ring-1 hover:ring-inset hover:ring-primary/40 ${tone}`}
        title={`${shown(col, value) || ''}${value ? '\n' : ''}${KIND_TIP[col.kind]}`}
        onClick={() => setEditing(true)}
      >
        {shown(col, value)}
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };
  return (
    <input
      autoFocus
      type={col.type === 'date' ? 'date' : 'text'}
      className="h-full w-full bg-white px-2 py-1 outline-none ring-2 ring-inset ring-primary"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(value);
          setEditing(false);
        }
      }}
    />
  );
};

// ---- the workbook ------------------------------------------------------

interface Props {
  cycles: BillingCycle[];
  onClose: () => void;
  /** Billing's own lists need reloading after an edit here. */
  onChanged: () => void;
}

export const BillingWorkbook: React.FC<Props> = ({ cycles, onClose, onChanged }) => {
  const [clients, setClients] = useState<WbClient[] | null>(null);
  const [secondAuthIds, setSecondAuthIds] = useState<Set<string>>(new Set());
  const [lastContact, setLastContact] = useState<Map<string, string>>(new Map());
  const [layout, setLayoutState] = useState<Layout>(cachedLayout);
  const [sheet, setSheet] = useState<Sheet>('master');
  const [renaming, setRenaming] = useState<Sheet | null>(null);
  const [query, setQuery] = useState('');
  const [mco, setMco] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<WbClient | null>(null);
  const [closing, setClosing] = useState<WbClient | null>(null);
  const dragCol = useRef<string | null>(null);
  const dragRow = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const setLayout = (update: (l: Layout) => Layout) =>
    setLayoutState((l) => {
      const next = update(l);
      saveLayout(next);
      return next;
    });

  const load = useCallback(async () => {
    const [c, auths, contacts] = await Promise.all([
      supabase.from('clients').select(WB_SELECT).is('deleted_at', null),
      supabase.from('client_authorizations').select('client_id, authorization_type, sequence_number'),
      supabase.from('client_contacts').select('client_id, contact_date').order('contact_date', { ascending: false }).limit(20000),
    ]);
    if (c.error) {
      toast.error('Could not load the workbook', { description: c.error.message });
      setClients([]);
      return;
    }
    setClients((c.data ?? []) as unknown as WbClient[]);
    setSecondAuthIds(
      new Set(
        (auths.data ?? [])
          .filter((a) => a.authorization_type === 'initial_30' && (a.sequence_number ?? 1) > 1)
          .map((a) => a.client_id),
      ),
    );
    const last = new Map<string, string>();
    for (const r of contacts.data ?? []) if (!last.has(r.client_id)) last.set(r.client_id, r.contact_date);
    setLastContact(last);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The team's layout: on opening, and whenever the window regains focus, so
  // a change somebody else made shows up without reopening.
  useEffect(() => {
    const pull = async () => {
      const team = await fetchTeamLayout();
      if (team) {
        const next = normalize(team);
        setLayoutState(next);
        try {
          localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
        } catch {
          // Cache only.
        }
      } else if (localStorage.getItem(LAYOUT_KEY)) {
        // Nothing shared yet: the first arrangement made becomes the team's.
        saveLayout(cachedLayout());
      }
    };
    void pull();
    window.addEventListener('focus', pull);
    return () => window.removeEventListener('focus', pull);
  }, []);

  // Escape leaves full screen, unless something inside is being edited.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === 'Escape' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName) && !deleting && !closing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, deleting, closing]);

  const cyclesByClient = useMemo(() => {
    const map = new Map<string, BillingCycle[]>();
    for (const y of cycles) {
      if (y.is_active === false) continue;
      (map.get(y.client_id) ?? map.set(y.client_id, []).get(y.client_id)!).push(y);
    }
    return map;
  }, [cycles]);

  const extraOf = useCallback(
    (c: WbClient): Extra => ({ cycles: cyclesByClient.get(c.id) ?? [], secondAuth: secondAuthIds.has(c.id) }),
    [cyclesByClient, secondAuthIds],
  );

  const columns = useMemo(
    () =>
      layout.colOrder
        .map((k) => COLUMNS.find((c) => c.key === k)!)
        .filter((c) => c && (c.key === 'name' || (!layout.removed.includes(c.key) && layout.groups.includes(c.group)))),
    [layout],
  );

  const sheetName = (s: Sheet) => layout.sheetNames[s] || SHEETS.find((x) => x.key === s)!.label;

  const ordered = useMemo(() => {
    if (!clients) return [];
    const byName = [...clients].sort((a, b) =>
      `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`),
    );
    const pos = new Map(layout.rowOrder.map((id, i) => [id, i]));
    return byName.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
  }, [clients, layout.rowOrder]);

  const textOf = (c: WbClient) => COLUMNS.map((col) => shown(col, col.value(c, extraOf(c)))).join(' ').toLowerCase();

  const rows = useMemo(() => {
    let list = ordered;
    if (sheet === 'pending') list = list.filter((c) => c.status === 'active' && c.approval_status !== 'Approved');
    if (sheet === 'approved') list = list.filter((c) => c.status === 'active' && c.approval_status === 'Approved');
    if (sheet === 'closed') list = list.filter((c) => c.status === 'closed');
    if (mco) list = list.filter((c) => c.insurance === mco);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((c) => textOf(c).includes(q));
    for (const [key, f] of Object.entries(filters)) {
      if (!f.trim()) continue;
      const col = COLUMNS.find((c) => c.key === key);
      if (!col) continue;
      list = list.filter((c) => shown(col, col.value(c, extraOf(c))).toLowerCase().includes(f.trim().toLowerCase()));
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered, sheet, mco, query, filters, extraOf]);

  const lapsed = useMemo(() => (clients ? lapsedRows(clients, lastContact) : []), [clients, lastContact]);
  const onSecond = useMemo(() => (clients ?? []).filter((c) => secondAuthIds.has(c.id)), [clients, secondAuthIds]);
  const tracker = useMemo(() => (clients ? trackerRows(clients, cyclesByClient) : []), [clients, cyclesByClient]);

  // ---- saving --------------------------------------------------------

  const save = async (client: WbClient, col: Column, raw: string) => {
    const patch: Partial<WbClient> = {};
    if (col.key === 'name') {
      const parts = raw.trim().split(/\s+/);
      if (parts.length < 2) {
        toast.error('Enter a first and a last name');
        return;
      }
      patch.last_name = parts.pop()!;
      patch.first_name = parts.join(' ');
    } else if (col.field) {
      (patch as Record<string, unknown>)[col.field] = raw.trim() === '' ? null : raw.trim();
    } else {
      return;
    }
    setSaving(true);
    setClients((list) => list?.map((c) => (c.id === client.id ? { ...c, ...patch } : c)) ?? list);
    try {
      const { error } = await supabase.from('clients').update(patch as never).eq('id', client.id);
      if (error) throw error;
      // The same follow-up as the other billing screens: authorizations and
      // cycles are rebuilt from the dates, so everything else stays in step.
      if (touchesAuthorizationData(patch)) await syncAuthorizationsFromLegacyColumns(client.id);
      if (touchesAuthorizationData(patch) || 'level_of_need' in patch) await resyncDerivedSchedules(client.id);
      if (touchesAuthorizationData(patch) || 'level_of_need' in patch || 'insurance' in patch) onChanged();
      toast.success('Saved to the client record');
    } catch (e) {
      toast.error('Could not save the change', { description: e instanceof Error ? e.message : String(e) });
      void load();
    } finally {
      setSaving(false);
    }
  };

  const addClient = async () => {
    const { data, error } = await supabase
      .from('clients')
      .insert({ first_name: 'New', last_name: 'client', status: 'active' } as never)
      .select(WB_SELECT)
      .single();
    if (error) {
      toast.error('Could not add a client', { description: error.message });
      return;
    }
    const row = data as unknown as WbClient;
    setClients((list) => [row, ...(list ?? [])]);
    setLayout((l) => ({ ...l, rowOrder: [row.id, ...l.rowOrder.filter((id) => id !== row.id)] }));
    setSheet('master');
    toast.success('Client added at the top. Select the name to enter it.');
    onChanged();
  };

  const deleteClient = async (client: WbClient) => {
    setDeleting(null);
    const { error } = await supabase.from('clients').update({ deleted_at: new Date().toISOString() } as never).eq('id', client.id);
    if (error) {
      toast.error('Could not delete the client', { description: error.message });
      return;
    }
    setClients((list) => list?.filter((c) => c.id !== client.id) ?? list);
    onChanged();
    toast.success(`${client.first_name} ${client.last_name} deleted`, {
      description: 'They can be restored for 30 days.',
      action: {
        label: 'Undo',
        onClick: async () => {
          await supabase.from('clients').update({ deleted_at: null } as never).eq('id', client.id);
          await load();
          onChanged();
        },
      },
    });
  };

  // ---- columns and rows: move, resize, remove ------------------------

  const moveColumn = (from: string, to: string) =>
    setLayout((l) => {
      if (from === to || from === 'name' || to === 'name') return l;
      const order = l.colOrder.filter((k) => k !== from);
      order.splice(order.indexOf(to), 0, from);
      return { ...l, colOrder: order };
    });

  const moveRow = (from: string, to: string) =>
    setLayout((l) => {
      if (from === to) return l;
      const order = ordered.map((c) => c.id).filter((id) => id !== from);
      order.splice(order.indexOf(to), 0, from);
      return { ...l, rowOrder: order };
    });

  const removeColumn = (col: Column) => {
    setLayout((l) => ({ ...l, removed: [...l.removed, col.key] }));
    toast(`Column removed: ${col.label}`, {
      description: 'Restore it from Columns. The data is not deleted.',
      action: { label: 'Undo', onClick: () => setLayout((l) => ({ ...l, removed: l.removed.filter((k) => k !== col.key) })) },
    });
  };

  const startResize = (e: React.PointerEvent, kind: 'col' | 'row', key: string, size: number) => {
    e.preventDefault();
    e.stopPropagation();
    const start = kind === 'col' ? e.clientX : e.clientY;
    const move = (ev: PointerEvent) => {
      const next = Math.round(size + (kind === 'col' ? ev.clientX : ev.clientY) - start);
      setLayoutState((l) =>
        kind === 'col'
          ? { ...l, colWidths: { ...l.colWidths, [key]: Math.max(60, next) } }
          : { ...l, rowHeights: { ...l.rowHeights, [key]: Math.max(30, next) } },
      );
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setLayoutState((l) => {
        saveLayout(l);
        return l;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const widthOf = (col: Column) => layout.colWidths[col.key] ?? col.width ?? 140;

  // ---- export --------------------------------------------------------

  const download = () => {
    if (!clients) return;
    const book = XLSX.utils.book_new();
    const masterRows = (list: WbClient[]) =>
      list.map((c) => Object.fromEntries(columns.map((col) => [col.label, shown(col, col.value(c, extraOf(c)))])));
    const add = (name: string, data: Record<string, unknown>[]) =>
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(data), name.slice(0, 31));
    add(sheetName('master'), masterRows(ordered));
    add(sheetName('pending'), masterRows(ordered.filter((c) => c.status === 'active' && c.approval_status !== 'Approved')));
    add(sheetName('approved'), masterRows(ordered.filter((c) => c.status === 'active' && c.approval_status === 'Approved')));
    add(sheetName('closed'), masterRows(ordered.filter((c) => c.status === 'closed')));
    add(
      sheetName('tracker'),
      tracker.map((r) => ({
        'Client Name': `${r.client.first_name} ${r.client.last_name}`,
        MCO: r.client.insurance ?? '',
        Level: r.level || 'None',
        Rate: r.rate,
        'Oldest cycle still filable (ends)': shown({ type: 'date' }, r.oldestEnd ?? ''),
        'FILE BY': shown({ type: 'date' }, r.fileBy ?? ''),
        'Days left': r.daysLeft ?? '',
        'Cycles still filable': r.filable,
        'Cycles past the window': r.past,
        'Claims on file': r.claims,
        'Last billed through': shown({ type: 'date' }, r.billedThrough ?? ''),
      })),
    );
    add(
      sheetName('second'),
      lapsed.map((r) => ({
        'Client Name': `${r.client.first_name} ${r.client.last_name}`,
        MCO: r.client.insurance ?? '',
        'Last authorization': `${r.last} · ${shown({ type: 'date' }, r.lastStart)} – ${shown({ type: 'date' }, r.ended)}`,
        Ended: shown({ type: 'date' }, r.ended),
        'Days since': r.daysSince,
        'Last contact': shown({ type: 'date' }, r.lastContact ?? ''),
      })),
    );
    XLSX.writeFile(book, `Case tracker ${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ---- render --------------------------------------------------------

  const th = 'sticky top-0 z-10 border-b border-r bg-slate-100 px-2 py-1.5 text-left text-xs font-semibold text-slate-700';
  const td = 'border-b border-r p-0 align-middle';
  const us = (v: string | null) => shown({ type: 'date' }, v ?? '');

  const masterGrid = (
    <table className="border-separate border-spacing-0 text-sm" style={{ tableLayout: 'fixed', width: 'max-content' }}>
      <thead>
        <tr>
          <th className={`${th} sticky left-0 z-30 w-[48px] min-w-[48px] max-w-[48px] text-right`} />
          {columns.map((col) => {
            const w = widthOf(col);
            const isName = col.key === 'name';
            return (
              <th
                key={col.key}
                draggable={!isName}
                onDragStart={() => (dragCol.current = col.key)}
                onDragOver={(e) => {
                  if (dragCol.current && !isName) {
                    e.preventDefault();
                    setDragOver(`c:${col.key}`);
                  }
                }}
                onDrop={() => {
                  if (dragCol.current) moveColumn(dragCol.current, col.key);
                  dragCol.current = null;
                  setDragOver(null);
                }}
                onDragEnd={() => {
                  dragCol.current = null;
                  setDragOver(null);
                }}
                title={`${KIND_TIP[col.kind]}${isName ? '' : '\nDrag to move.'}`}
                className={`${th} relative ${isName ? 'sticky left-12 z-20' : 'cursor-grab'} ${dragOver === `c:${col.key}` ? 'shadow-[inset_3px_0_0_hsl(var(--primary))]' : ''}`}
                style={{ width: w, minWidth: w, maxWidth: w }}
              >
                <span className="block truncate pr-4">{col.label}</span>
                <span className={`mt-1 block h-[3px] rounded ${KIND_BAR[col.kind]}`} />
                {editMode && !isName && (
                  <button
                    className="absolute right-2 top-1.5 grid h-5 w-5 place-items-center rounded border border-red-300 bg-red-50 text-red-700"
                    title="Remove column"
                    aria-label={`Remove column ${col.label}`}
                    onClick={() => removeColumn(col)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
                <span
                  className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-primary/40"
                  onPointerDown={(e) => startResize(e, 'col', col.key, w)}
                  title="Drag to resize"
                />
              </th>
            );
          })}
        </tr>
        {showFilters && (
          <tr>
            <th className={`${th} sticky left-0 top-[42px] z-30 bg-white`} />
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${th} top-[42px] bg-white font-normal ${col.key === 'name' ? 'sticky left-12 z-20' : ''}`}
              >
                <input
                  className="w-full rounded border px-1.5 py-0.5 text-xs"
                  placeholder="Filter"
                  aria-label={`Filter ${col.label}`}
                  value={filters[col.key] ?? ''}
                  onChange={(e) => setFilters((f) => ({ ...f, [col.key]: e.target.value }))}
                />
              </th>
            ))}
          </tr>
        )}
      </thead>
      <tbody>
        {rows.map((c, i) => {
          const x = extraOf(c);
          const h = layout.rowHeights[c.id];
          return (
            <tr
              key={c.id}
              style={h ? { height: h } : undefined}
              onDragOver={(e) => {
                if (dragRow.current) {
                  e.preventDefault();
                  setDragOver(`r:${c.id}`);
                }
              }}
              onDrop={() => {
                if (dragRow.current) moveRow(dragRow.current, c.id);
                dragRow.current = null;
                setDragOver(null);
              }}
              className={dragOver === `r:${c.id}` ? '[&>td]:shadow-[inset_0_3px_0_hsl(var(--primary))]' : 'hover:bg-sky-50/40'}
            >
              <td
                className={`${td} sticky left-0 z-10 w-[48px] min-w-[48px] max-w-[48px] bg-slate-100 text-right text-xs text-muted-foreground`}
                draggable={!editMode}
                onDragStart={() => (dragRow.current = c.id)}
                onDragEnd={() => {
                  dragRow.current = null;
                  setDragOver(null);
                }}
                title={editMode ? 'Delete this client' : 'Drag to move this row'}
              >
                <div className="relative flex h-full items-center justify-end gap-0.5 px-1.5">
                  {editMode ? (
                    <button
                      className="grid h-5 w-5 place-items-center rounded border border-red-300 bg-red-50 text-red-700"
                      aria-label={`Delete ${c.first_name} ${c.last_name}`}
                      onClick={() => setDeleting(c)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  ) : (
                    <>
                      <GripVertical className="h-3 w-3 cursor-grab opacity-40" />
                      {i + 1}
                    </>
                  )}
                  <span
                    className="absolute -bottom-1 left-0 right-0 z-10 h-2 cursor-row-resize hover:bg-primary/40"
                    onPointerDown={(e) => startResize(e, 'row', c.id, (e.currentTarget.closest('tr') as HTMLElement).getBoundingClientRect().height)}
                    title="Drag to resize"
                  />
                </div>
              </td>
              {columns.map((col) => {
                const w = widthOf(col);
                const isName = col.key === 'name';
                return (
                  <td
                    key={col.key}
                    className={`${td} ${isName ? 'sticky left-12 z-10 bg-white font-semibold' : col.kind === 'auto' ? 'bg-slate-50' : col.kind === 'docs' ? 'bg-orange-50/70' : ''}`}
                    style={{ width: w, minWidth: w, maxWidth: w }}
                  >
                    <Cell col={col} value={col.value(c, x)} onSave={(v) => void save(c, col, v)} />
                  </td>
                );
              })}
            </tr>
          );
        })}
        {rows.length === 0 && (
          <tr>
            <td className="p-4 text-sm text-muted-foreground" colSpan={columns.length + 1}>
              No clients match.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );

  const trackerGrid = (
    <table className="border-separate border-spacing-0 text-sm">
      <thead>
        <tr>
          <th className={`${th} sticky left-0 z-30 w-[48px] min-w-[48px] max-w-[48px]`} />
          {TRACKER_COLUMNS.map((h, i) => (
            <th key={h} className={`${th} ${i === 0 ? 'sticky left-12 z-20 min-w-[180px]' : 'min-w-[120px]'}`} title={KIND_TIP[i === 0 ? 'manual' : 'auto']}>
              {h}
              <span className={`mt-1 block h-[3px] rounded ${i === 0 ? KIND_BAR.manual : KIND_BAR.auto}`} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tracker
          .filter((r) => (!mco || r.client.insurance === mco) && (!query.trim() || `${r.client.first_name} ${r.client.last_name}`.toLowerCase().includes(query.trim().toLowerCase())))
          .map((r, i) => (
            <tr key={r.client.id}>
              <td className={`${td} sticky left-0 z-10 w-[48px] min-w-[48px] max-w-[48px] bg-slate-100 px-2 py-1.5 text-right text-xs text-muted-foreground`}>{i + 1}</td>
              <td className={`${td} sticky left-12 z-10 bg-white px-2 py-1.5 font-semibold`}>{r.client.first_name} {r.client.last_name}</td>
              <td className={`${td} bg-slate-50 px-2 py-1.5`}>{r.client.insurance ?? ''}</td>
              <td className={`${td} bg-slate-50 px-2 py-1.5`}>
                {r.level || <span className="rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-900">None</span>}
              </td>
              <td className={`${td} bg-slate-50 px-2 py-1.5 tabular-nums`}>{formatMoney(r.rate)}</td>
              <td className={`${td} bg-slate-50 px-2 py-1.5 tabular-nums`}>{us(r.oldestEnd)}</td>
              <td className={`${td} bg-slate-50 px-2 py-1.5 tabular-nums`}>{r.fileBy ? us(r.fileBy) : <span className="text-muted-foreground">No cycles to file</span>}</td>
              <td className={`${td} bg-slate-50 px-2 py-1.5 tabular-nums`}>
                {r.daysLeft != null && (
                  <span className={`rounded-full px-2 text-xs font-semibold ${r.daysLeft <= 7 ? 'bg-red-100 text-red-800' : r.daysLeft <= 30 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>
                    {r.daysLeft}
                  </span>
                )}
              </td>
              <td className={`${td} bg-slate-50 px-2 py-1.5 tabular-nums`}>{r.filable}</td>
              <td className={`${td} bg-slate-50 px-2 py-1.5 tabular-nums`}>{r.past}</td>
              <td className={`${td} bg-slate-50 px-2 py-1.5 tabular-nums`}>{r.claims}</td>
              <td className={`${td} bg-slate-50 px-2 py-1.5 tabular-nums`}>{us(r.billedThrough)}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );

  const openClient = (id: string) => window.open(`/?view=clients&client=${id}`, '_blank', 'noopener');

  const secondGrid = (
    <table className="border-separate border-spacing-0 text-sm">
      <thead>
        <tr>
          {['Client Name', 'MCO', 'Status', 'Last authorization', 'Ended', 'Days since', 'Last contact', ''].map((h, i) => (
            <th key={h || i} className={`${th} ${i === 0 ? 'sticky left-0 z-20 min-w-[180px]' : 'min-w-[120px]'}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lapsed
          .filter((r) => (!mco || r.client.insurance === mco) && (!query.trim() || `${r.client.first_name} ${r.client.last_name}`.toLowerCase().includes(query.trim().toLowerCase())))
          .map((r) => (
            <tr key={r.client.id}>
              <td className={`${td} sticky left-0 z-10 bg-white px-2 py-1.5 font-semibold`}>{r.client.first_name} {r.client.last_name}</td>
              <td className={`${td} px-2 py-1.5`}>{r.client.insurance ?? ''}</td>
              <td className={`${td} bg-slate-50 px-2 py-1.5`}><span className="rounded-full bg-red-100 px-2 text-xs font-semibold text-red-800">Lapsed</span></td>
              <td className={`${td} bg-slate-50 px-2 py-1.5`}>{r.last} · {us(r.lastStart)} – {us(r.ended)}</td>
              <td className={`${td} bg-slate-50 px-2 py-1.5 tabular-nums`}>{us(r.ended)}</td>
              <td className={`${td} bg-slate-50 px-2 py-1.5 tabular-nums`}>{r.daysSince}</td>
              <td className={`${td} bg-slate-50 px-2 py-1.5 tabular-nums`}>{us(r.lastContact) || 'None'}</td>
              <td className={`${td} whitespace-nowrap px-2 py-1`}>
                <Button size="sm" variant="outline" className="mr-1.5 h-7" onClick={() => openClient(r.client.id)}>
                  <ExternalLink className="mr-1 h-3.5 w-3.5" />
                  Open client
                </Button>
                <Button size="sm" variant="outline" className="h-7" onClick={() => setClosing(r.client)}>
                  Close case
                </Button>
              </td>
            </tr>
          ))}
        {onSecond.map((c) => (
          <tr key={`second-${c.id}`}>
            <td className={`${td} sticky left-0 z-10 bg-white px-2 py-1.5 font-semibold`}>{c.first_name} {c.last_name}</td>
            <td className={`${td} px-2 py-1.5`}>{c.insurance ?? ''}</td>
            <td className={`${td} bg-slate-50 px-2 py-1.5`}><span className="rounded-full bg-sky-100 px-2 text-xs font-semibold text-sky-800">On 2nd 30-day</span></td>
            <td className={`${td} bg-slate-50 px-2 py-1.5`}>30-day · {us(c.auth_30_start)}</td>
            <td className={`${td} bg-slate-50 px-2 py-1.5`} colSpan={3} />
            <td className={`${td} px-2 py-1`}>
              <Button size="sm" variant="outline" className="h-7" onClick={() => openClient(c.id)}>
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                Open client
              </Button>
            </td>
          </tr>
        ))}
        {lapsed.length === 0 && onSecond.length === 0 && (
          <tr>
            <td className="p-4 text-sm text-muted-foreground" colSpan={8}>No lapsed authorizations.</td>
          </tr>
        )}
      </tbody>
    </table>
  );

  const master = !['tracker', 'second'].includes(sheet);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white text-slate-900">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="mr-2 font-semibold">Workbook</div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-8 w-52 rounded-md border pl-8 pr-2 text-sm"
            placeholder="Search all columns"
            aria-label="Search all columns"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select className="h-8 rounded-md border px-2 text-sm" value={mco} onChange={(e) => setMco(e.target.value)} aria-label="Filter by MCO">
          <option value="">All MCOs</option>
          {MCO_OPTIONS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        {master && (
          <>
            <div className="relative">
              <Button size="sm" variant="outline" className="h-8" onClick={() => setColumnsOpen((v) => !v)} aria-expanded={columnsOpen}>
                <Columns3 className="mr-1.5 h-4 w-4" />
                Columns
              </Button>
              {columnsOpen && (
                <div className="absolute left-0 top-full z-40 mt-1 grid min-w-[240px] gap-1.5 rounded-lg border bg-white p-3 text-sm shadow-lg">
                  {ALL_GROUPS.map((g) => (
                    <label key={g} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={layout.groups.includes(g)}
                        onChange={(e) =>
                          setLayout((l) => ({ ...l, groups: e.target.checked ? [...l.groups, g] : l.groups.filter((x) => x !== g) }))
                        }
                      />
                      {GROUP_LABEL[g]}
                    </label>
                  ))}
                  {layout.removed.length > 0 && (
                    <div className="mt-1 border-t pt-2">
                      <div className="mb-1 text-xs text-muted-foreground">Removed columns</div>
                      {layout.removed.map((k) => (
                        <button
                          key={k}
                          className="block text-left text-primary hover:underline"
                          onClick={() => setLayout((l) => ({ ...l, removed: l.removed.filter((x) => x !== k) }))}
                        >
                          Restore {COLUMNS.find((c) => c.key === k)?.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    className="mt-1 border-t pt-2 text-left text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setLayout(() => ({ ...DEFAULT_LAYOUT, sheetNames: layout.sheetNames }));
                    }}
                  >
                    Reset column and row layout
                  </button>
                </div>
              )}
            </div>
            <Button
              size="sm"
              variant={showFilters ? 'default' : 'outline'}
              className="h-8"
              onClick={() => {
                if (showFilters) setFilters({});
                setShowFilters((v) => !v);
              }}
            >
              <Filter className="mr-1.5 h-4 w-4" />
              Filter
            </Button>
            <Button size="sm" variant={editMode ? 'default' : 'outline'} className="h-8" onClick={() => setEditMode((v) => !v)}>
              {editMode ? <Check className="mr-1.5 h-4 w-4" /> : <Pencil className="mr-1.5 h-4 w-4" />}
              {editMode ? 'Done editing' : 'Edit'}
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={() => void addClient()}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add client
            </Button>
          </>
        )}
        <Button size="sm" variant="outline" className="h-8" onClick={download} disabled={!clients}>
          <Download className="mr-1.5 h-4 w-4" />
          Download as Excel
        </Button>
        {saving && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Saving
          </span>
        )}
        <Button size="sm" className="ml-auto h-8" onClick={onClose} title="Back to Billing (Esc)">
          <X className="mr-1.5 h-4 w-4" />
          Exit
        </Button>
      </div>

      {sheet === 'tracker' && (
        <div className="border-b bg-sky-50 px-3 py-1.5 text-xs text-muted-foreground">
          <b className="text-foreground">Billing tracker</b> Sorted by filing deadline, soonest first. Calculated from the billing cycles; edit client details on the Master tab.
        </div>
      )}
      {sheet === 'second' && (
        <div className="border-b bg-sky-50 px-3 py-1.5 text-xs text-muted-foreground">
          <b className="text-foreground">2nd authorization</b> Open cases whose last authorization ended more than {LAPSE_BUFFER_DAYS} days ago with no new authorization and no contact since. A new 30-day authorization is needed before anything else can be billed.
        </div>
      )}

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-auto" onClick={() => columnsOpen && setColumnsOpen(false)}>
        {clients === null ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading the workbook…
          </div>
        ) : sheet === 'tracker' ? (
          trackerGrid
        ) : sheet === 'second' ? (
          secondGrid
        ) : (
          masterGrid
        )}
      </div>

      {/* Tabs, along the bottom like a spreadsheet. Double-click to rename. */}
      <div className="flex shrink-0 gap-0.5 overflow-x-auto border-t bg-slate-100 px-2" role="tablist" aria-label="Workbook tabs">
        {SHEETS.map((s) =>
          renaming === s.key ? (
            <input
              key={s.key}
              autoFocus
              className="my-1 w-40 rounded border border-primary px-2 text-sm"
              defaultValue={sheetName(s.key)}
              aria-label="Rename tab"
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => {
                const v = e.currentTarget.value.trim();
                setLayout((l) => ({ ...l, sheetNames: { ...l.sheetNames, [s.key]: v || undefined } }));
                setRenaming(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setRenaming(null);
              }}
            />
          ) : (
            <button
              key={s.key}
              role="tab"
              aria-selected={sheet === s.key}
              title="Double-click to rename"
              onClick={() => setSheet(s.key)}
              onDoubleClick={() => setRenaming(s.key)}
              className={`whitespace-nowrap border-t-2 px-3 py-2 text-sm ${sheet === s.key ? 'border-primary bg-white font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {sheetName(s.key)}
              {s.key === 'second' && lapsed.length > 0 && (
                <span className="ml-1.5 rounded-full bg-red-100 px-1.5 text-xs font-semibold text-red-800">{lapsed.length}</span>
              )}
            </button>
          ),
        )}
        <div className="ml-auto hidden items-center gap-3 px-2 text-xs text-muted-foreground md:flex">
          {(Object.keys(KIND_BAR) as Kind[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5" title={KIND_TIP[k]}>
              <i className={`inline-block h-1 w-3.5 rounded ${KIND_BAR[k]}`} />
              {k === 'manual' ? 'Manual' : k === 'drop' ? 'Dropdown' : k === 'auto' ? 'Calculated' : 'From documents'}
            </span>
          ))}
        </div>
      </div>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.first_name} {deleting?.last_name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes the client from the workbook, billing and the client list. They can be restored for 30 days.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Keep client</Button>
            <Button className="bg-red-600 text-white hover:bg-red-700" onClick={() => deleting && void deleteClient(deleting)}>
              Delete client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {closing && (
        <CloseCaseDialog
          open
          onOpenChange={(o) => {
            if (!o) setClosing(null);
          }}
          clientId={closing.id}
          clientName={`${closing.first_name} ${closing.last_name}`}
          onClosed={() => {
            setClosing(null);
            void load();
            onChanged();
          }}
        />
      )}
    </div>
  );
};
