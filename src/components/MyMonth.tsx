import React, { useState } from 'react';
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
  ChevronRight, Phone, MapPin, MoveRight,

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
import { Modality, MODALITY_LABELS, todayAgency } from '@/lib/compliance';
import { format } from 'date-fns';

interface Props {
  onOpenClient: (clientId: string) => void;
}

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }> = ({ icon, label, value, hint }) => (
  <Card>
    <CardContent className="p-4 flex items-center gap-3">
      <div className="rounded-full bg-primary/10 p-2 text-primary">{icon}</div>
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

const modalityLabel = (m: Modality) => (m === 'in_person' ? 'Face-to-face / in-person' : 'Phone / text / video allowed');
const modalityIcon = (m: Modality) => (m === 'in_person' ? <MapPin className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />);

const statusBadge = (s: TpStatus) => {
  switch (s) {
    case 'completed': return <Badge className="bg-green-600 text-white hover:bg-green-600">Completed</Badge>;
    case 'overdue': return <Badge className="bg-red-600 text-white hover:bg-red-600">Overdue</Badge>;
    case 'missed': return <Badge className="bg-red-600 text-white hover:bg-red-600">Missed</Badge>;
    case 'moved': return <Badge variant="secondary">Moved</Badge>;
    default: return <Badge variant="outline">Scheduled</Badge>;
  }
};

export const MyMonth: React.FC<Props> = ({ onOpenClient }) => {
  const effectiveProfileId = useEffectiveProfileId();
  const myProfileId = useMyProfileId();
  const { guardWrite } = useViewAs();
  const { toast } = useToast();
  const data = useMyCompliance(effectiveProfileId);
  const today = todayAgency();

  // log dialog
  const [logTp, setLogTp] = useState<ScheduledTouchpoint | null>(null);
  const [logModality, setLogModality] = useState<Modality>('phone');
  const [logNotes, setLogNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // move dialog
  const [moveTp, setMoveTp] = useState<ScheduledTouchpoint | null>(null);
  const [moveDate, setMoveDate] = useState('');

  const openLog = (t: ScheduledTouchpoint) => {
    setLogTp(t);
    setLogModality(t.modality);
    setLogNotes('');
  };

  const submitLog = async () => {
    if (!logTp) return;
    if (guardWrite()) { setLogTp(null); return; }
    if (!myProfileId) { toast({ title: 'Could not identify your profile', variant: 'destructive' }); return; }
    setSaving(true);
    // link the scheduled event to the logged contact and mark complete
    await supabase.from('calendar_events').update({ status: 'completed', modality: logModality }).eq('id', logTp.id);
    const { error } = await supabase.from('client_contacts').insert({
      client_id: logTp.client_id,
      employee_id: myProfileId,
      contact_date: logTp.date,
      modality: logModality,
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

  // group this week's touchpoints by day
  const byDay: Record<string, ScheduledTouchpoint[]> = {};
  data.scheduledThisWeek.forEach((t) => { (byDay[t.date] ||= []).push(t); });
  const days = Object.keys(byDay).sort();

  const [filterModality, setFilterModality] = useState<string>('all');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const upcoming = data.upcoming.filter((t) => {
    if (filterModality !== 'all' && t.modality !== filterModality) return false;
    if (filterOverdue && t.status !== 'overdue') return false;
    return true;
  });

  const remainingCount = data.remainingThisWeek.length;

  const tpRow = (t: ScheduledTouchpoint) => (
    <div key={t.id} className="flex items-center justify-between rounded-md border p-3 gap-2">
      <div className="min-w-0">
        <div className="font-medium truncate">{t.client_name}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
          <span>{t.level_of_need || 'No level of need'}</span>
          <span>·</span>
          <span className="flex items-center gap-1">{modalityIcon(t.modality)} {modalityLabel(t.modality)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {statusBadge(t.status)}
        {t.status !== 'completed' && (
          <Button size="sm" variant="outline" onClick={() => openLog(t)}>Log</Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => openMove(t)} title="Move"><MoveRight className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" onClick={() => onOpenClient(t.client_id)} title="Open client"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Touchpoints</h1>
        <p className="text-muted-foreground">Your auto-scheduled client touchpoints for the current 30-day billing windows.</p>
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

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={<CalendarClock className="h-5 w-5" />} label="Scheduled this week" value={data.scheduledThisWeek.length}
          hint="Auto-scheduled touchpoints assigned to you for this week (Mon–Sun)." />
        <Stat icon={<CheckCircle2 className="h-5 w-5" />} label="Completed this week" value={data.completedThisWeek}
          hint="Touchpoints you have logged this week." />
        <Stat icon={<ClipboardList className="h-5 w-5" />} label="Remaining this week" value={remainingCount}
          hint="Scheduled touchpoints this week that have not been logged yet." />
        <Stat icon={<Settings2 className="h-5 w-5" />} label="Missing setup" value={data.missingSetupClients.length}
          hint="Active clients missing a start date or level of need — they can't be scheduled yet." />
      </div>

      {/* Section 1: This week's touchpoints */}
      <Card>
        <CardHeader><CardTitle className="text-lg">This week’s touchpoints</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {days.length === 0 ? (
            <p className="text-sm text-muted-foreground">No touchpoints scheduled this week.</p>
          ) : days.map((d) => (
            <div key={d} className="space-y-2">
              <div className="text-sm font-semibold text-muted-foreground">{format(new Date(`${d}T12:00:00`), 'EEEE, MMM d')}</div>
              {byDay[d].map(tpRow)}
            </div>
          ))}
        </CardContent>
      </Card>

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

      {/* Section 3: Overdue / audit risk */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-red-600">Overdue / audit risk</CardTitle>
          <p className="text-sm text-muted-foreground">Clients whose current 30-day billing window is at risk.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.overdueClients.length === 0 ? (
            <p className="text-sm text-muted-foreground">No clients at audit risk right now.</p>
          ) : data.overdueClients.map((c) => (
            <button key={c.id} onClick={() => onOpenClient(c.id)}
              className="w-full text-left flex items-center justify-between rounded-md border border-red-200 bg-red-50 p-3 hover:bg-red-100">
              <div>
                <div className="font-medium">{c.client_name} <span className="text-xs text-muted-foreground">({c.level_of_need})</span></div>
                <ul className="text-xs text-red-700 list-disc pl-4">
                  {c.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
                <div className="text-[11px] text-muted-foreground mt-1">
                  Window {format(new Date(`${c.windowStart}T12:00:00`), 'MMM d')} – {format(new Date(`${c.windowEnd}T12:00:00`), 'MMM d')}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Section 4: Upcoming */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Upcoming touchpoints</CardTitle>
          <p className="text-sm text-muted-foreground">Scheduled touchpoints over the next 30 days.</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Select value={filterModality} onValueChange={setFilterModality}>
              <SelectTrigger className="w-48 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modalities</SelectItem>
                <SelectItem value="in_person">Face-to-face only</SelectItem>
                <SelectItem value="phone">Phone / virtual</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant={filterOverdue ? 'default' : 'outline'} onClick={() => setFilterOverdue((v) => !v)}>
              Overdue only
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming touchpoints match your filters.</p>
          ) : upcoming.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-md border p-3 gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{t.client_name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  {modalityIcon(t.modality)} {modalityLabel(t.modality)}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">{format(new Date(`${t.date}T12:00:00`), 'EEE, MMM d')}</span>
                {statusBadge(t.status)}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Log dialog */}
      <Dialog open={!!logTp} onOpenChange={(o) => !o && setLogTp(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log touchpoint — {logTp?.client_name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">Scheduled for {logTp && format(new Date(`${logTp.date}T12:00:00`), 'EEEE, MMM d')}. Suggested: {logTp ? modalityLabel(logTp.modality) : ''}.</div>
            <div className="space-y-2">
              <Label>Modality</Label>
              <Select value={logModality} onValueChange={(v) => setLogModality(v as Modality)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="virtual">Virtual</SelectItem>
                  <SelectItem value="in_person">In-person</SelectItem>
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
