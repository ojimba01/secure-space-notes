import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Settings2,
  ChevronRight, MoveRight, Plus,
} from 'lucide-react';
import { InfoHint } from '@/components/InfoHint';
import {
  useMyCompliance, ScheduledTouchpoint, TpStatus,
} from '@/hooks/useMyCompliance';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { useMyProfileId } from '@/hooks/useMyProfileId';
import { useViewAs } from '@/components/ViewAsProvider';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  todayAgency, MODALITY_OPTIONS, TOUCHPOINT_TYPES,
} from '@/lib/compliance';
import { format } from 'date-fns';

interface Props {
  onOpenClient: (clientId: string) => void;
}

type KpiKey = 'overdue' | 'scheduled' | 'completed' | 'remaining' | 'missing';

const Stat: React.FC<{
  icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string;
  active?: boolean; onClick?: () => void; tone?: 'danger' | 'default';
}> = ({ icon, label, value, hint, active, onClick, tone = 'default' }) => (
  <Card
    onClick={onClick}
    className={`cursor-pointer transition-colors ${active ? 'ring-2 ring-primary' : ''} ${tone === 'danger' ? 'border-red-200' : ''} hover:bg-muted/40`}
  >
    <CardContent className="p-4 flex items-center gap-3">
      <div className={`rounded-full p-2 ${tone === 'danger' ? 'bg-red-100 text-red-600' : 'bg-primary/10 text-primary'}`}>{icon}</div>
      <div>
        <div className="text-2xl font-bold leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          {label}
          {hint && <InfoHint text={hint} />}
        </div>
      </div>
    </CardContent>
  </Card>
);

const statusBadge = (s: TpStatus) => {
  switch (s) {
    case 'completed': return <Badge className="bg-green-600 text-white hover:bg-green-600">Completed</Badge>;
    case 'overdue': return <Badge className="bg-red-600 text-white hover:bg-red-600">Overdue</Badge>;
    case 'missed': return <Badge className="bg-red-600 text-white hover:bg-red-600">Missed</Badge>;
    case 'moved': return <Badge variant="secondary">Moved</Badge>;
    default: return <Badge variant="outline">Scheduled</Badge>;
  }
};

const lonBadge = (lon: string | null) =>
  lon ? <Badge variant="outline" className="text-[11px]">{lon}</Badge> : <Badge variant="secondary" className="text-[11px]">No level of need</Badge>;

export const MyMonth: React.FC<Props> = ({ onOpenClient }) => {
  const effectiveProfileId = useEffectiveProfileId();
  const myProfileId = useMyProfileId();
  const { guardWrite } = useViewAs();
  const { toast } = useToast();
  const data = useMyCompliance(effectiveProfileId);
  const today = todayAgency();

  // log dialog
  const [logTp, setLogTp] = useState<ScheduledTouchpoint | null>(null);
  const [logModality, setLogModality] = useState<string>('phone');
  const [logType, setLogType] = useState<string>('general_checkin');
  const [logNotes, setLogNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // move dialog
  const [moveTp, setMoveTp] = useState<ScheduledTouchpoint | null>(null);
  const [moveDate, setMoveDate] = useState('');

  // add (ad-hoc) touchpoint dialog — log against any assigned client
  const [addOpen, setAddOpen] = useState(false);
  const [addClients, setAddClients] = useState<{ id: string; name: string }[]>([]);
  const [addClientId, setAddClientId] = useState('');
  const [addDate, setAddDate] = useState(today);
  const [addModality, setAddModality] = useState('phone');
  const [addType, setAddType] = useState('general_checkin');
  const [addNotes, setAddNotes] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  const openAdd = async () => {
    setAddClientId('');
    setAddDate(today);
    setAddModality('phone');
    setAddType('general_checkin');
    setAddNotes('');
    setAddOpen(true);
    if (effectiveProfileId) {
      const { data } = await supabase
        .from('clients')
        .select('id, first_name, last_name')
        .eq('assigned_employee_id', effectiveProfileId)
        .eq('status', 'active')
        .order('last_name');
      setAddClients((data ?? []).map((c: any) => ({ id: c.id, name: `${c.first_name} ${c.last_name}` })));
    }
  };

  const submitAdd = async () => {
    if (!addClientId) { toast({ title: 'Select a client', variant: 'destructive' }); return; }
    if (guardWrite()) { setAddOpen(false); return; }
    if (!myProfileId) { toast({ title: 'Could not identify your profile', variant: 'destructive' }); return; }
    setAddSaving(true);
    const { error } = await supabase.from('client_contacts').insert({
      client_id: addClientId,
      employee_id: myProfileId,
      contact_date: addDate,
      modality: addModality,
      touchpoint_type: addType,
      notes: addNotes || null,
    });
    setAddSaving(false);
    if (error) { toast({ title: 'Error logging touchpoint', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Touchpoint logged' });
    setAddOpen(false);
    data.refresh();
  };

  // KPI details drawer
  const [detail, setDetail] = useState<KpiKey | null>(null);

  const openLog = (t: ScheduledTouchpoint) => {
    setLogTp(t);
    setLogModality(t.modality === 'in_person' ? 'in_person' : 'phone');
    setLogType('general_checkin');
    setLogNotes('');
  };

  const submitLog = async () => {
    if (!logTp) return;
    if (guardWrite()) { setLogTp(null); return; }
    if (!myProfileId) { toast({ title: 'Could not identify your profile', variant: 'destructive' }); return; }
    setSaving(true);
    await supabase.from('calendar_events').update({
      status: 'completed', modality: logModality, touchpoint_type: logType,
    }).eq('id', logTp.id);
    const { error } = await supabase.from('client_contacts').insert({
      client_id: logTp.client_id,
      employee_id: myProfileId,
      contact_date: logTp.date,
      modality: logModality,
      touchpoint_type: logType,
      notes: logNotes || null,
      calendar_event_id: logTp.id,
    });
    setSaving(false);
    if (error) { toast({ title: 'Error logging touchpoint', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Touchpoint logged' });
    setLogTp(null);
    data.refresh();
  };

  const openMove = (t: ScheduledTouchpoint) => {
    setMoveTp(t);
    setMoveDate(t.date);
  };

  const submitMove = async () => {
    if (!moveTp || !moveDate) return;
    if (guardWrite()) { setMoveTp(null); return; }
    const iso = new Date(`${moveDate}T12:00:00`).toISOString();
    await supabase.from('calendar_events').update({
      start_time: iso, end_time: iso, is_manually_adjusted: true,
    }).eq('id', moveTp.id);
    toast({ title: 'Touchpoint moved', description: 'Your change will be kept when the schedule rebalances.' });
    setMoveTp(null);
    data.refresh();
  };

  const completedThisWeekList = useMemo(
    () => data.scheduledThisWeek.filter((t) => t.status === 'completed'),
    [data.scheduledThisWeek],
  );

  const remainingCount = data.remainingThisWeek.length;

  // Compact list row — no repeated modality guidance.
  const tpRow = (t: ScheduledTouchpoint, withActions = true) => (
    <div key={t.id} className="flex items-center justify-between rounded-md border p-3 gap-2">
      <div className="min-w-0">
        <div className="font-medium truncate">{t.client_name}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
          {lonBadge(t.level_of_need)}
          <span>{format(new Date(`${t.date}T12:00:00`), 'EEE, MMM d')}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {statusBadge(t.status)}
        {withActions && t.status !== 'completed' && (
          <Button size="sm" variant="outline" onClick={() => openLog(t)}>Log</Button>
        )}
        {withActions && (
          <Button size="sm" variant="ghost" onClick={() => openMove(t)} title="Move"><MoveRight className="h-4 w-4" /></Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onOpenClient(t.client_id)} title="Open client"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );

  const detailContent = () => {
    switch (detail) {
      case 'overdue':
        return data.overdueClients.length
          ? data.overdueClients.map((c) => (
            <button key={c.id} onClick={() => { setDetail(null); onOpenClient(c.id); }}
              className="w-full text-left flex items-center justify-between rounded-md border border-red-200 bg-red-50 p-3 hover:bg-red-100">
              <div>
                <div className="font-medium">{c.client_name} {lonBadge(c.level_of_need)}</div>
                <ul className="text-xs text-red-700 list-disc pl-4">{c.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))
          : <p className="text-sm text-muted-foreground">No clients at audit risk.</p>;
      case 'scheduled':
        return data.scheduledThisWeek.length
          ? data.scheduledThisWeek.map((t) => tpRow(t))
          : <p className="text-sm text-muted-foreground">Nothing scheduled this week.</p>;
      case 'completed':
        return completedThisWeekList.length
          ? completedThisWeekList.map((t) => tpRow(t, false))
          : <p className="text-sm text-muted-foreground">No touchpoints completed this week yet.</p>;
      case 'remaining':
        return data.remainingThisWeek.length
          ? data.remainingThisWeek.map((t) => tpRow(t))
          : <p className="text-sm text-muted-foreground">Nothing remaining this week.</p>;
      case 'missing':
        return data.missingSetupClients.length
          ? data.missingSetupClients.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 p-3">
              <div>
                <div className="font-medium">{c.client_name}</div>
                <div className="text-xs text-amber-700">
                  Missing: {[c.missingDate && 'HSP / authorization start date', c.missingLevelOfNeed && 'level of need'].filter(Boolean).join(' and ')}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => { setDetail(null); onOpenClient(c.id); }}>Update client</Button>
            </div>
          ))
          : <p className="text-sm text-muted-foreground">All active clients have complete setup.</p>;
      default:
        return null;
    }
  };

  const detailTitle: Record<KpiKey, string> = {
    overdue: 'Overdue / audit risk',
    scheduled: 'Scheduled this week',
    completed: 'Completed this week',
    remaining: 'Remaining this week',
    missing: 'Missing setup information',
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Touchpoints</h1>
          <p className="text-muted-foreground">Your work queue and audit-risk view for the current 30-day billing windows.</p>
        </div>
        <Button onClick={openAdd} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Add touchpoint
        </Button>
      </div>

      {/* reminders */}
      {(remainingCount > 0 || data.unscheduledInPerson > 0) && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Reminders</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5 space-y-0.5">
              {remainingCount > 0 && <li>You have {remainingCount} touchpoint{remainingCount === 1 ? '' : 's'} remaining this week.</li>}
              {data.unscheduledInPerson > 0 && <li>{data.unscheduledInPerson} required face-to-face touchpoint{data.unscheduledInPerson === 1 ? ' is' : 's are'} still open this week.</li>}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* KPIs — clickable */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat icon={<AlertTriangle className="h-5 w-5" />} label="Overdue / audit risk" value={data.overdueClients.length}
          tone="danger" onClick={() => setDetail('overdue')} active={detail === 'overdue'}
          hint="Clients whose current 30-day window is at risk of missing requirements." />
        <Stat icon={<CalendarClock className="h-5 w-5" />} label="Scheduled this week" value={data.scheduledThisWeek.length}
          onClick={() => setDetail('scheduled')} active={detail === 'scheduled'}
          hint="Auto-scheduled touchpoints assigned to you this week (Mon–Sun)." />
        <Stat icon={<CheckCircle2 className="h-5 w-5" />} label="Completed this week" value={data.completedThisWeek}
          onClick={() => setDetail('completed')} active={detail === 'completed'}
          hint="Touchpoints you have logged this week." />
        <Stat icon={<ClipboardList className="h-5 w-5" />} label="Remaining this week" value={remainingCount}
          onClick={() => setDetail('remaining')} active={detail === 'remaining'}
          hint="Scheduled touchpoints this week that have not been logged yet." />
        <Stat icon={<Settings2 className="h-5 w-5" />} label="Missing setup" value={data.missingSetupClients.length}
          onClick={() => setDetail('missing')} active={detail === 'missing'}
          hint="Active clients missing a start date or level of need — they can't be scheduled yet." />
      </div>

      {/* Section 1: Overdue / audit risk — hidden entirely when empty */}
      {data.overdueClients.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-red-600">Overdue / audit risk</CardTitle>
            <p className="text-sm text-muted-foreground">Clients whose current 30-day billing window is at risk.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.overdueClients.map((c) => (
              <button key={c.id} onClick={() => onOpenClient(c.id)}
                className="w-full text-left flex items-center justify-between rounded-md border border-red-200 bg-red-50 p-3 hover:bg-red-100">
                <div>
                  <div className="font-medium flex items-center gap-2">{c.client_name} {lonBadge(c.level_of_need)}</div>
                  <ul className="text-xs text-red-700 list-disc pl-4">
                    {c.reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Window {format(new Date(`${c.windowStart}T12:00:00`), 'MMM d')} – {format(new Date(`${c.windowEnd}T12:00:00`), 'MMM d')} · {c.contactDays} of {c.requiredContacts} completed
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Section 2: Missing setup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Missing setup information</CardTitle>
          <p className="text-sm text-muted-foreground">These clients cannot be scheduled until setup is complete.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.missingSetupClients.length === 0 ? (
            <p className="text-sm text-muted-foreground">All active clients have complete setup.</p>
          ) : data.missingSetupClients.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 p-3">
              <div>
                <div className="font-medium">{c.client_name}</div>
                <div className="text-xs text-amber-700">
                  Missing: {[c.missingDate && 'HSP / authorization start date', c.missingLevelOfNeed && 'level of need'].filter(Boolean).join(' and ')}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => onOpenClient(c.id)}>Update client</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Section 3: Upcoming scheduled touchpoints (next 30 days) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Upcoming scheduled touchpoints</CardTitle>
          <p className="text-sm text-muted-foreground">Scheduled touchpoints over the next 30 days. Full detail is on your calendar.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming touchpoints scheduled.</p>
          ) : data.upcoming.map((t) => tpRow(t))}
        </CardContent>
      </Card>

      {/* KPI details drawer */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{detail ? detailTitle[detail] : ''}</DialogTitle></DialogHeader>
          <div className="space-y-2">{detailContent()}</div>
        </DialogContent>
      </Dialog>

      {/* Log dialog */}
      <Dialog open={!!logTp} onOpenChange={(o) => !o && setLogTp(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log touchpoint — {logTp?.client_name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Scheduled for {logTp && format(new Date(`${logTp.date}T12:00:00`), 'EEEE, MMM d')}.
              {logTp?.modality === 'in_person' && ' Suggested: face-to-face / in-person.'}
            </div>
            <div className="space-y-2">
              <Label>Touchpoint type</Label>
              <Select value={logType} onValueChange={setLogType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TOUCHPOINT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Modality</Label>
              <Select value={logModality} onValueChange={setLogModality}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODALITY_OPTIONS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input value={logNotes} onChange={(e) => setLogNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submitLog} disabled={saving}>Save touchpoint</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move dialog */}
      <Dialog open={!!moveTp} onOpenChange={(o) => !o && setMoveTp(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Move touchpoint — {moveTp?.client_name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New date</Label>
              <Input type="date" value={moveDate} min={today} onChange={(e) => setMoveDate(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">Manual moves are preserved and won’t be overwritten when the schedule rebalances.</p>
          </div>
          <DialogFooter>
            <Button onClick={submitMove}>Save move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
