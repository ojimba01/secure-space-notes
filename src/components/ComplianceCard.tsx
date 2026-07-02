import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Plus, Phone, Video, MapPin, Trash2 } from 'lucide-react';
import { InfoHint } from '@/components/InfoHint';
import { useComplianceTooltips } from '@/hooks/useComplianceTooltips';
import { useMyProfileId } from '@/hooks/useMyProfileId';
import { useViewAs } from '@/components/ViewAsProvider';
import {
  Modality, MODALITY_LABELS, SUPPORT_ACTIVITIES, ComplianceStatus,
  requirementsForTier, computeProgress, deriveStatus, generatePlanDates,
  firstOfMonth, todayAgency, daysBetween, ENFORCEMENT_START, ContactRow,
  hasValidTier, currentBillingWindow, contactsInWindow, windowProgress,
  windowStatus, suggestTouchpointType, toDate,
} from '@/lib/compliance';
import { regenerateTouchpointsForClient } from '@/lib/touchpoints';

interface Props {
  clientId: string;
  clientName: string;
  levelOfNeed?: string | null;
  hspStartDate?: string | null;
  assignedEmployeeId?: string | null;
  clientCreatedAt?: string | null;
  onChanged?: () => void;
}

const statusChip = (status: ComplianceStatus) => {
  switch (status) {
    case 'complete':
      return <Badge className="bg-green-600 hover:bg-green-600 text-white">Complete</Badge>;
    case 'behind':
    case 'incomplete_escalated':
      return <Badge className="bg-red-600 hover:bg-red-600 text-white">Needs attention</Badge>;
    default:
      return <Badge variant="secondary">On track</Badge>;
  }
};

const modalityIcon = (m: Modality) =>
  m === 'phone' ? <Phone className="h-3.5 w-3.5" /> : m === 'virtual' ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />;

export const ComplianceCard: React.FC<Props> = ({
  clientId, clientName, levelOfNeed, assignedEmployeeId, clientCreatedAt, onChanged,
}) => {
  const { toast } = useToast();
  const { guardWrite } = useViewAs();
  const tooltips = useComplianceTooltips();
  const myProfileId = useMyProfileId();
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [complianceId, setComplianceId] = useState<string | null>(null);
  const [activities, setActivities] = useState<string[]>([]);
  const [summaryNote, setSummaryNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [logOpen, setLogOpen] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  const today = todayAgency();
  const month = firstOfMonth(today);
  const tier = levelOfNeed === 'High Level' ? 'High Level' : 'Low Level';
  const req = requirementsForTier(tier);
  const isHigh = tier === 'High Level';

  const isNewClientFirstWeek =
    !!clientCreatedAt &&
    daysBetween(ENFORCEMENT_START, clientCreatedAt.slice(0, 10)) >= 0 &&
    daysBetween(clientCreatedAt.slice(0, 10), today) >= 0 &&
    daysBetween(clientCreatedAt.slice(0, 10), today) < 7;

  // log dialog state
  const [logDate, setLogDate] = useState(today);
  const [logModality, setLogModality] = useState<Modality>('phone');
  const [logNotes, setLogNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    // ensure month compliance row exists
    let { data: row } = await supabase
      .from('client_month_compliance')
      .select('*')
      .eq('client_id', clientId)
      .eq('month', month)
      .maybeSingle();

    if (!row) {
      const planDates = generatePlanDates(tier, month, today > month ? today : undefined);
      const { data: inserted } = await supabase
        .from('client_month_compliance')
        .insert({
          client_id: clientId,
          employee_id: assignedEmployeeId ?? null,
          month,
          lon_tier: tier,
          required_contacts: req.requiredContacts,
          required_in_person: req.requiredInPerson,
          required_activities: req.requiredActivities,
          is_new_client: isNewClientFirstWeek,
          plan_dates: planDates as any,
        })
        .select('*')
        .maybeSingle();
      row = inserted ?? null;
    }

    if (row) {
      setComplianceId(row.id);
      setActivities(Array.isArray(row.activities_done) ? (row.activities_done as string[]) : []);
      setSummaryNote(row.summary_note ?? '');
    }

    const { data: cts } = await supabase
      .from('client_contacts')
      .select('id, contact_date, modality')
      .eq('client_id', clientId)
      .gte('contact_date', month)
      .order('contact_date', { ascending: true });
    setContacts((cts as ContactRow[]) ?? []);
    setLoading(false);
  }, [clientId, month, tier, assignedEmployeeId, isNewClientFirstWeek, req.requiredContacts, req.requiredInPerson, req.requiredActivities, today]);

  useEffect(() => { load(); }, [load]);

  const progress = computeProgress(req, contacts, activities, summaryNote);
  const status = deriveStatus(req, contacts, activities, summaryNote, today, isNewClientFirstWeek);

  // keep stored status in sync
  useEffect(() => {
    if (!complianceId || loading) return;
    const dbStatus = progress.isComplete ? 'complete' : status;
    supabase
      .from('client_month_compliance')
      .update({ status: dbStatus })
      .eq('id', complianceId);
  }, [complianceId, status, progress.isComplete, loading]);

  const handleLog = async () => {
    // Update local UI first so the change is visible (incl. view-as sandbox).
    const date = logDate;
    const modality = logModality;
    const notes = logNotes;
    setContacts((prev) =>
      [...prev, { id: `local-${crypto.randomUUID()}`, contact_date: date, modality }]
        .sort((a, b) => a.contact_date.localeCompare(b.contact_date)),
    );
    setLogOpen(false);
    setLogNotes('');
    setLogDate(today);
    setLogModality('phone');

    if (guardWrite()) return;
    if (!myProfileId) {
      toast({ title: 'Could not identify your profile', variant: 'destructive' });
      return;
    }
    // create calendar event
    const startIso = new Date(`${date}T12:00:00`).toISOString();
    const { data: ev } = await supabase
      .from('calendar_events')
      .insert({
        title: `${MODALITY_LABELS[modality]} contact — ${clientName}`,
        event_type: 'touchpoint',
        employee_id: myProfileId,
        client_id: clientId,
        start_time: startIso,
        end_time: startIso,
        description: notes || null,
      })
      .select('id')
      .maybeSingle();

    const { error } = await supabase.from('client_contacts').insert({
      client_id: clientId,
      employee_id: myProfileId,
      contact_date: date,
      modality,
      notes: notes || null,
      calendar_event_id: ev?.id ?? null,
    });
    if (error) {
      toast({ title: 'Error logging contact', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Contact logged' });
    await load();
    onChanged?.();
  };

  const deleteContact = async (c: ContactRow) => {
    // Local removal first (visible in view-as sandbox).
    setContacts((prev) => prev.filter((x) => x.id !== c.id));

    if (guardWrite()) return;
    const { data: full } = await supabase
      .from('client_contacts')
      .select('calendar_event_id')
      .eq('id', c.id)
      .maybeSingle();
    if (full?.calendar_event_id) {
      await supabase.from('calendar_events').delete().eq('id', full.calendar_event_id);
    }
    await supabase.from('client_contacts').delete().eq('id', c.id);
    await load();
    onChanged?.();
  };

  const toggleActivity = async (key: string, checked: boolean) => {
    // Local toggle first (visible in view-as sandbox).
    const next = checked ? [...new Set([...activities, key])] : activities.filter((a) => a !== key);
    setActivities(next);

    if (guardWrite()) return;
    if (complianceId) {
      await supabase.from('client_month_compliance').update({ activities_done: next as any }).eq('id', complianceId);
    }
  };

  const saveNote = async () => {
    // Note text is already reflected in local state (summaryNote).
    if (guardWrite()) return;
    if (!complianceId) return;
    setSavingNote(true);
    await supabase.from('client_month_compliance').update({ summary_note: summaryNote }).eq('id', complianceId);
    setSavingNote(false);
    toast({ title: 'Note saved' });
  };

  // Built-in fallback guidance so info buttons are never blank when DB tooltips are empty.
  const contactHintItems = isHigh
    ? ['Log **4 contacts** this month, including **2 in-person visits at least 7 days apart**. Also complete the required **support activities** in the checklist below.']
    : ['Log **2 contacts** this month. Phone, virtual, or in-person all count. Each must be on a different day.'];
  const modalityHint = 'How the contact happened: Phone, Virtual (video), or In-Person (face-to-face visit).';


  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">{new Date(month + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</CardTitle>
          {statusChip(status)}
        </CardHeader>
        <CardContent className="space-y-5">
          {/* contacts progress */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              Contacts completed: {progress.contactDays} of {req.requiredContacts}
              {req.requiredInPerson > 0 && (
                <span className="text-muted-foreground">
                  · In-person visits: {progress.inPersonSpaced} of {req.requiredInPerson}
                </span>
              )}
              <InfoHint text={tooltips.contact || undefined} items={!tooltips.contact ? contactHintItems : undefined} />
            </div>
            {isNewClientFirstWeek && (
              <p className="text-xs text-muted-foreground">New client — first week grace; contacts spaced ≥2 weeks apart.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {contacts.map((c) => (
                <Badge key={c.id} variant="outline" className="gap-1 group">
                  {modalityIcon(c.modality)}
                  {c.contact_date.slice(5)}
                  <button onClick={() => deleteContact(c)} className="ml-1 opacity-50 hover:opacity-100">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>

            <Dialog open={logOpen} onOpenChange={setLogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" /> Log contact</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Log a contact</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      Modality <InfoHint text={tooltips[logModality] || modalityHint} />
                    </Label>
                    <Select value={logModality} onValueChange={(v) => setLogModality(v as Modality)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="phone">Phone</SelectItem>
                        <SelectItem value="virtual">Virtual</SelectItem>
                        <SelectItem value="in_person">In-Person</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Note (optional)</Label>
                    <Textarea value={logNotes} onChange={(e) => setLogNotes(e.target.value)} rows={2} />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleLog}>Save contact</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* high-level: activities + note */}
          {isHigh && (
            <div className="space-y-3 border-t pt-4">
              <div className="text-sm font-medium">
                Support activities: {progress.activitiesDone} of {req.requiredActivities}
              </div>
              <div className="space-y-2">
                {SUPPORT_ACTIVITIES.map((a) => (
                  <div key={a.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`act-${a.key}`}
                      checked={activities.includes(a.key)}
                      onCheckedChange={(c) => toggleActivity(a.key, !!c)}
                    />
                    <Label htmlFor={`act-${a.key}`} className="text-sm font-normal flex items-center gap-1">
                      {a.label} <InfoHint text={tooltips[a.tooltipKey] || a.label} />
                    </Label>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Monthly summary note</Label>
                <Textarea
                  value={summaryNote}
                  onChange={(e) => setSummaryNote(e.target.value)}
                  rows={3}
                  placeholder="Summarize housing coordination, referrals, handoffs, and other support provided this month."
                />
                <Button size="sm" variant="outline" onClick={saveNote} disabled={savingNote}>Save note</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};
