// Staff activity: how each person on the team spends their time in the app.
//
// Superadmins only. Three sources, put side by side:
//  - staff_activity: every page visit and task, with the time spent actively
//    working on it (src/lib/staffActivity.ts records these);
//  - the audit log: every change a person saved, described in plain words
//    (src/lib/changeDescriptions.ts);
//  - the clients those point at, for names.
import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  Eye,
  FilePlus2,
  FileText,
  Pencil,
  Upload,
  User,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useIsSuperadmin } from '@/hooks/useIsSuperadmin';
import { visibleProfiles } from '@/lib/testAccounts';
import { AREA_LABEL } from '@/lib/staffActivity';
import {
  describeChange,
  formatDuration,
  loadChanges,
  type ChangeKind,
  type ChangeRow,
} from '@/lib/changeDescriptions';

type Range = 'today' | 'yesterday' | 'week' | 'month';

const RANGE_LABEL: Record<Range, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'Last 7 days',
  month: 'Last 30 days',
};

function rangeBounds(range: Range): { from: Date; to: Date } {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  const tomorrow = new Date(startOfToday.getTime() + day);
  if (range === 'today') return { from: startOfToday, to: tomorrow };
  if (range === 'yesterday') return { from: new Date(startOfToday.getTime() - day), to: startOfToday };
  if (range === 'week') return { from: new Date(startOfToday.getTime() - 6 * day), to: tomorrow };
  return { from: new Date(startOfToday.getTime() - 29 * day), to: tomorrow };
}

interface Visit {
  id: string;
  user_id: string;
  kind: 'page' | 'task';
  area: string;
  label: string;
  client_id: string | null;
  started_at: string;
  last_seen_at: string;
  active_seconds: number;
  outcome: 'completed' | 'draft' | 'closed' | null;
}

interface Staff {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface Change extends ChangeRow {
  kind: ChangeKind;
  text: string;
}

const staffName = (s: Staff | undefined) =>
  s ? `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || s.email || 'Unknown' : 'Unknown';

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

const OUTCOME_LABEL: Record<string, string> = {
  completed: 'Completed',
  draft: 'Saved as draft',
  closed: 'Closed without saving',
};

const OUTCOME_CLASS: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  draft: 'bg-amber-100 text-amber-900',
  closed: 'bg-muted text-muted-foreground',
};

const KIND_ICON: Record<ChangeKind, React.ReactNode> = {
  client: <Pencil className="h-4 w-4 text-blue-600" />,
  document: <Upload className="h-4 w-4 text-violet-600" />,
  form: <FilePlus2 className="h-4 w-4 text-green-600" />,
  touchpoint: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  billing: <DollarSign className="h-4 w-4 text-amber-600" />,
  calendar: <CalendarDays className="h-4 w-4 text-sky-600" />,
  staff: <Users className="h-4 w-4 text-slate-600" />,
  other: <Pencil className="h-4 w-4 text-slate-500" />,
};

/** Periods of use: activity with gaps of under half an hour between counts as one sitting. */
function timeInApp(visits: Visit[], changes: Change[]): { seconds: number; first: string | null; last: string | null } {
  const spans: [number, number][] = [
    ...visits.map((v): [number, number] => [Date.parse(v.started_at), Date.parse(v.last_seen_at)]),
    ...changes.map((c): [number, number] => [Date.parse(c.created_at), Date.parse(c.created_at)]),
  ].sort((a, b) => a[0] - b[0]);
  if (!spans.length) return { seconds: 0, first: null, last: null };
  const GAP = 30 * 60_000;
  let total = 0;
  let [start, end] = spans[0];
  for (const [s, e] of spans.slice(1)) {
    if (s - end > GAP) {
      total += end - start;
      start = s;
      end = e;
    } else {
      end = Math.max(end, e);
    }
  }
  total += end - start;
  const last = Math.max(...spans.map((s) => s[1]));
  return {
    seconds: total / 1000,
    first: new Date(spans[0][0]).toISOString(),
    last: new Date(last).toISOString(),
  };
}

function summarize(visits: Visit[], changes: Change[]) {
  const pages = visits.filter((v) => v.kind === 'page');
  const tasks = visits.filter((v) => v.kind === 'task');
  const count = (kind: ChangeKind, starts: string) =>
    changes.filter((c) => c.kind === kind && c.text.startsWith(starts)).length;
  return {
    active: pages.reduce((sum, v) => sum + v.active_seconds, 0),
    inApp: timeInApp(visits, changes),
    formsCompleted: count('form', 'Completed'),
    uploads: count('document', 'Uploaded'),
    touchpoints: count('touchpoint', 'Logged'),
    edits: changes.length,
    tasks,
  };
}

const Tile: React.FC<{ icon: React.ReactNode; label: string; value: string; hint?: string }> = ({
  icon,
  label,
  value,
  hint,
}) => (
  <Card className="p-4">
    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      {icon}
      {label}
    </div>
    <div className="mt-1 text-2xl font-semibold">{value}</div>
    {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
  </Card>
);

export default function StaffActivity() {
  const navigate = useNavigate();
  const { isSuperadmin, loading: roleLoading } = useIsSuperadmin();
  const [range, setRange] = useState<Range>('today');
  const [staff, setStaff] = useState<Staff[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'changes' | 'pages' | 'tasks'>('all');

  useEffect(() => {
    if (!isSuperadmin) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setProblem(null);
      const { from, to } = rangeBounds(range);
      const [people, activity, changed] = await Promise.all([
        supabase.from('profiles').select('id, user_id, first_name, last_name, email'),
        // Newer than the generated types.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from as any)('staff_activity')
          .select('id, user_id, kind, area, label, client_id, started_at, last_seen_at, active_seconds, outcome')
          .gte('started_at', from.toISOString())
          .lt('started_at', to.toISOString())
          .order('started_at', { ascending: false })
          .limit(5000),
        loadChanges(from, to),
      ]);
      if (cancelled) return;

      if (activity.error || changed.error) {
        setProblem(
          'Activity could not be loaded. If this page is new, the database update for it may not have been applied yet.',
        );
      }
      const described: Change[] = [];
      for (const row of changed.rows) {
        const d = describeChange(row);
        if (d) described.push({ ...row, ...d });
      }
      const visitRows = ((activity.data ?? []) as Visit[]).filter(
        // A page glanced at for a few seconds on the way somewhere else is noise.
        (v) => v.kind === 'task' || v.active_seconds >= 10,
      );

      setStaff(visibleProfiles((people.data ?? []) as Staff[]).filter((p) => !!p.user_id));
      setVisits(visitRows);
      setChanges(described);

      const ids = [
        ...new Set(
          [...visitRows.map((v) => v.client_id), ...described.map((c) => c.client_id)].filter(
            (id): id is string => !!id,
          ),
        ),
      ];
      const names: Record<string, string> = {};
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase
          .from('clients')
          .select('id, first_name, last_name')
          .in('id', ids.slice(i, i + 200));
        for (const c of data ?? []) names[c.id] = `${c.first_name} ${c.last_name}`.trim();
      }
      if (cancelled) return;
      setClientNames(names);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [range, isSuperadmin]);

  const byUser = useMemo(() => {
    const map = new Map<string, { visits: Visit[]; changes: Change[] }>();
    for (const s of staff) map.set(s.user_id, { visits: [], changes: [] });
    for (const v of visits) map.get(v.user_id)?.visits.push(v);
    for (const c of changes) map.get(c.user_id)?.changes.push(c);
    return map;
  }, [staff, visits, changes]);

  const team = useMemo(
    () =>
      staff
        .map((s) => {
          const own = byUser.get(s.user_id) ?? { visits: [], changes: [] };
          return { staff: s, ...summarize(own.visits, own.changes) };
        })
        .sort((a, b) => (b.inApp.last ?? '').localeCompare(a.inApp.last ?? '')),
    [staff, byUser],
  );

  if (roleLoading) return <div className="min-h-screen grid place-items-center">Loading…</div>;
  if (!isSuperadmin) return <Navigate to="/" replace />;

  const person = selected ? staff.find((s) => s.user_id === selected) : undefined;
  const clientLabel = (id: string | null) => (id ? clientNames[id] ?? 'A client' : null);

  const rangePicker = (
    <div className="flex w-fit flex-wrap rounded-lg border bg-white p-1">
      {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
        <Button key={r} size="sm" variant={range === r ? 'default' : 'ghost'} onClick={() => setRange(r)}>
          {RANGE_LABEL[r]}
        </Button>
      ))}
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1300px] space-y-5 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Back"
              onClick={() => (person ? setSelected(null) : navigate('/'))}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{person ? staffName(person) : 'Staff activity'}</h1>
              <p className="text-sm text-muted-foreground">
                {person
                  ? 'Pages visited, time spent, tasks and every change saved.'
                  : 'How your team spends their time in the app. Select a staff member to see their full activity.'}
              </p>
            </div>
          </div>
          {rangePicker}
        </div>

        {problem && (
          <Card className="border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{problem}</Card>
        )}

        {loading ? (
          <Card className="p-6 text-sm text-muted-foreground">Loading activity…</Card>
        ) : !person ? (
          <TeamTable team={team} onSelect={setSelected} />
        ) : (
          <PersonDetail
            visits={byUser.get(person.user_id)?.visits ?? []}
            changes={byUser.get(person.user_id)?.changes ?? []}
            clientLabel={clientLabel}
            filter={filter}
            setFilter={setFilter}
          />
        )}

        <p className="text-xs text-muted-foreground">
          Active time counts only while the app is open on screen and in use. After two minutes without
          mouse or keyboard input, time stops counting until the person returns.
        </p>
      </div>
    </main>
  );
}

const TeamTable: React.FC<{
  team: ({ staff: Staff } & ReturnType<typeof summarize>)[];
  onSelect: (userId: string) => void;
}> = ({ team, onSelect }) => (
  <Card className="overflow-x-auto">
    <table className="w-full min-w-[820px] text-sm">
      <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
        <tr>
          <th className="px-4 py-2 font-medium">Staff member</th>
          <th className="px-4 py-2 font-medium">Last active</th>
          <th className="px-4 py-2 font-medium">Active time</th>
          <th className="px-4 py-2 font-medium">Forms completed</th>
          <th className="px-4 py-2 font-medium">Documents uploaded</th>
          <th className="px-4 py-2 font-medium">Touchpoints logged</th>
          <th className="px-4 py-2 font-medium">Changes saved</th>
          <th className="px-4 py-2" />
        </tr>
      </thead>
      <tbody className="divide-y">
        {team.map((row) => (
          <tr
            key={row.staff.user_id}
            className="cursor-pointer hover:bg-muted/30"
            onClick={() => onSelect(row.staff.user_id)}
          >
            <td className="px-4 py-3 font-medium">{staffName(row.staff)}</td>
            <td className="px-4 py-3 text-muted-foreground">
              {row.inApp.last
                ? `${new Date(row.inApp.last).toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeOf(row.inApp.last)}`
                : 'No activity'}
            </td>
            <td className="px-4 py-3">{row.active ? formatDuration(row.active) : '—'}</td>
            <td className="px-4 py-3">{row.formsCompleted || '—'}</td>
            <td className="px-4 py-3">{row.uploads || '—'}</td>
            <td className="px-4 py-3">{row.touchpoints || '—'}</td>
            <td className="px-4 py-3">{row.edits || '—'}</td>
            <td className="px-4 py-3 text-right">
              <ChevronRight className="inline h-4 w-4 text-muted-foreground" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </Card>
);

const PersonDetail: React.FC<{
  visits: Visit[];
  changes: Change[];
  clientLabel: (id: string | null) => string | null;
  filter: 'all' | 'changes' | 'pages' | 'tasks';
  setFilter: (f: 'all' | 'changes' | 'pages' | 'tasks') => void;
}> = ({ visits, changes, clientLabel, filter, setFilter }) => {
  const summary = summarize(visits, changes);
  const pages = visits.filter((v) => v.kind === 'page');

  const byArea = useMemo(() => {
    const totals = new Map<string, number>();
    for (const v of pages) totals.set(v.area, (totals.get(v.area) ?? 0) + v.active_seconds);
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [pages]);

  const byClient = useMemo(() => {
    const totals = new Map<string, number>();
    for (const v of pages) {
      if (v.client_id) totals.set(v.client_id, (totals.get(v.client_id) ?? 0) + v.active_seconds);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [pages]);

  const maxArea = Math.max(1, ...byArea.map(([, s]) => s));
  const maxClient = Math.max(1, ...byClient.map(([, s]) => s));

  type Entry = { at: string; icon: React.ReactNode; text: string; client: string | null; extra?: React.ReactNode };
  const timeline: Entry[] = [];
  if (filter === 'all' || filter === 'changes') {
    for (const c of changes) {
      timeline.push({ at: c.created_at, icon: KIND_ICON[c.kind], text: c.text, client: clientLabel(c.client_id) });
    }
  }
  if (filter === 'all' || filter === 'pages') {
    for (const v of pages) {
      timeline.push({
        at: v.started_at,
        icon: <Eye className="h-4 w-4 text-muted-foreground" />,
        text: `Viewed ${v.label}`,
        client: clientLabel(v.client_id),
        extra: <span className="text-xs text-muted-foreground">{formatDuration(v.active_seconds)} active</span>,
      });
    }
  }
  if (filter === 'all' || filter === 'tasks') {
    for (const t of summary.tasks) {
      timeline.push({
        at: t.started_at,
        icon: <FileText className="h-4 w-4 text-muted-foreground" />,
        text: t.label,
        client: clientLabel(t.client_id),
        extra: (
          <span className="text-xs text-muted-foreground">
            {formatDuration(t.active_seconds)}
            {' · '}
            {t.outcome ? OUTCOME_LABEL[t.outcome] : 'In progress'}
          </span>
        ),
      });
    }
  }
  timeline.sort((a, b) => b.at.localeCompare(a.at));
  const days: [string, Entry[]][] = [];
  for (const e of timeline) {
    const day = dayOf(e.at);
    const last = days[days.length - 1];
    if (last && last[0] === day) last[1].push(e);
    else days.push([day, [e]]);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tile
          icon={<Clock className="h-4 w-4" />}
          label="Active time"
          value={summary.active ? formatDuration(summary.active) : '—'}
          hint="Working in the app"
        />
        <Tile
          icon={<Activity className="h-4 w-4" />}
          label="Time in the app"
          value={summary.inApp.seconds ? formatDuration(summary.inApp.seconds) : '—'}
          hint={
            summary.inApp.first
              ? `First seen ${timeOf(summary.inApp.first)}, last seen ${timeOf(summary.inApp.last!)}`
              : undefined
          }
        />
        <Tile icon={<FilePlus2 className="h-4 w-4" />} label="Forms completed" value={String(summary.formsCompleted)} />
        <Tile icon={<Upload className="h-4 w-4" />} label="Documents uploaded" value={String(summary.uploads)} />
        <Tile icon={<CheckCircle2 className="h-4 w-4" />} label="Touchpoints logged" value={String(summary.touchpoints)} />
        <Tile icon={<Pencil className="h-4 w-4" />} label="Changes saved" value={String(summary.edits)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Time by section</h2>
          {byArea.length === 0 ? (
            <p className="text-sm text-muted-foreground">No time recorded for this period.</p>
          ) : (
            <div className="space-y-2">
              {byArea.map(([area, seconds]) => (
                <div key={area} className="text-sm">
                  <div className="flex justify-between">
                    <span>{AREA_LABEL[area] ?? area}</span>
                    <span className="text-muted-foreground">{formatDuration(seconds)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${(seconds / maxArea) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Time by client</h2>
          {byClient.length === 0 ? (
            <p className="text-sm text-muted-foreground">No client records opened in this period.</p>
          ) : (
            <div className="space-y-2">
              {byClient.map(([id, seconds]) => (
                <div key={id} className="text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      {clientLabel(id)}
                    </span>
                    <span className="shrink-0 text-muted-foreground">{formatDuration(seconds)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-sky-500" style={{ width: `${(seconds / maxClient) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="overflow-x-auto">
        <div className="px-4 py-3">
          <h2 className="text-sm font-semibold">Tasks</h2>
          <p className="text-xs text-muted-foreground">Forms filled out, documents uploaded and touchpoints logged, with how long each took.</p>
        </div>
        {summary.tasks.length === 0 ? (
          <p className="border-t px-4 py-3 text-sm text-muted-foreground">No tasks in this period.</p>
        ) : (
          <table className="w-full min-w-[640px] border-t text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Task</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Started</th>
                <th className="px-4 py-2 font-medium">Time spent</th>
                <th className="px-4 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {summary.tasks.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2">{t.label}</td>
                  <td className="px-4 py-2">{clientLabel(t.client_id) ?? '—'}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(t.started_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}, {timeOf(t.started_at)}
                  </td>
                  <td className="px-4 py-2">{formatDuration(t.active_seconds)}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-md px-2 py-0.5 text-xs ${t.outcome ? OUTCOME_CLASS[t.outcome] : 'bg-sky-100 text-sky-800'}`}>
                      {t.outcome ? OUTCOME_LABEL[t.outcome] : 'In progress'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h2 className="text-sm font-semibold">Timeline</h2>
          <div className="flex rounded-lg border bg-white p-1">
            {(
              [
                ['all', 'All activity'],
                ['changes', 'Changes'],
                ['tasks', 'Tasks'],
                ['pages', 'Pages viewed'],
              ] as const
            ).map(([value, label]) => (
              <Button key={value} size="sm" variant={filter === value ? 'default' : 'ghost'} onClick={() => setFilter(value)}>
                {label}
              </Button>
            ))}
          </div>
        </div>
        {days.length === 0 ? (
          <p className="border-t px-4 py-3 text-sm text-muted-foreground">No activity in this period.</p>
        ) : (
          days.map(([day, entries]) => (
            <div key={day} className="border-t">
              <div className="bg-muted/30 px-4 py-1.5 text-xs font-medium text-muted-foreground">{day}</div>
              <div className="divide-y">
                {entries.map((e, i) => (
                  <div key={`${e.at}-${i}`} className="flex items-start gap-3 px-4 py-2 text-sm">
                    <span className="w-16 shrink-0 pt-0.5 text-xs text-muted-foreground">{timeOf(e.at)}</span>
                    <span className="pt-0.5">{e.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div>
                        {e.text}
                        {e.client && <span className="text-muted-foreground"> · {e.client}</span>}
                      </div>
                      {e.extra}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
};
