import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Plus, Phone, Video, MapPin, Trash2 } from 'lucide-react';
import { InfoHint } from '@/components/InfoHint';
import { useComplianceTooltips } from '@/hooks/useComplianceTooltips';
import { useMyProfileId } from '@/hooks/useMyProfileId';
import { useViewAs } from '@/components/ViewAsProvider';
import {
  requirementsForTier, computeProgress, deriveStatus, generatePlanDates,
  firstOfMonth, todayAgency, daysBetween, ENFORCEMENT_START, ContactRow,
  currentBillingWindow, contactsInWindow, windowProgress,
  windowStatus, suggestTouchpointType,
} from '@/lib/compliance';
import { regenerateTouchpointsForClient } from '@/lib/touchpoints';
import { AddTouchpointDialog } from '@/components/AddTouchpointDialog';
import { TouchpointCycles } from '@/components/TouchpointCycles';

interface Props {
  clientId: string;
  clientName: string;
  levelOfNeed?: string | null;
  hspStartDate?: string | null;
  assignedEmployeeId?: string | null;
  clientCreatedAt?: string | null;
  onChanged?: () => void;
}


const modalityIcon = (m: Modality) =>
  m === 'phone' ? <Phone className="h-3.5 w-3.5" /> : m === 'virtual' ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />;

export const ComplianceCard: React.FC<Props> = ({
  clientId, clientName, levelOfNeed, hspStartDate, assignedEmployeeId, clientCreatedAt, onChanged,
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
  // A start date and nothing else. The level of need sets the billing rate, not
  // what is owed: every client owes one in-person visit per 30-day cycle.
  const setupComplete = !!hspStartDate;
  const window = setupComplete ? currentBillingWindow(hspStartDate!, today) : null;

  const isNewClientFirstWeek =
    !!clientCreatedAt &&
    daysBetween(ENFORCEMENT_START, clientCreatedAt.slice(0, 10)) >= 0 &&
    daysBetween(clientCreatedAt.slice(0, 10), today) >= 0 &&
    daysBetween(clientCreatedAt.slice(0, 10), today) < 7;

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

    const contactsFrom = window && window.start < month ? window.start : month;
    const { data: cts } = await supabase
      .from('client_contacts')
      .select('id, contact_date, modality')
      .eq('client_id', clientId)
      .gte('contact_date', contactsFrom)
      .order('contact_date', { ascending: true });
    setContacts((cts as ContactRow[]) ?? []);
    setLoading(false);
  }, [clientId, month, tier, assignedEmployeeId, isNewClientFirstWeek, req.requiredContacts, req.requiredInPerson, req.requiredActivities, today, window?.start]);

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
      const { data: ev } = await supabase
        .from('calendar_events')
        .select('id, is_auto_generated, event_type')
        .eq('id', full.calendar_event_id)
        .maybeSingle();
      // A scheduled touchpoint goes back to "scheduled" — removing the record
      // of a contact must not also remove the obligation to make it. Only an
      // event this card created for an ad-hoc contact is deleted.
      if (ev?.event_type === 'touch_point' && ev.is_auto_generated) {
        await supabase.from('calendar_events').update({ status: 'scheduled' }).eq('id', ev.id);
      } else if (ev) {
        await supabase.from('calendar_events').delete().eq('id', ev.id);
      }
    }
    await supabase.from('client_contacts').delete().eq('id', c.id);
    await load();
    onChanged?.();
  };

  const winContacts = window ? contactsInWindow(contacts, window) : [];
  const winProg = window ? windowProgress(req, winContacts) : null;
  const winStatus = window ? windowStatus(req, window, winContacts, today) : 'missing_setup';
  const fmtShort = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });


  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="space-y-0">
          {/* The month is the part that moves, so it is the part that is
              coloured — otherwise the whole title reads as one fixed heading
              and nobody notices which month they are looking at.

              The status chip that sat here said the same thing as the badge
              inside Monthly requirements, a few lines below it. */}
          <CardTitle className="text-lg">
            Monthly Touchpoints —{' '}
            <span className="text-primary">
              {new Date(month + 'T12:00:00Z').toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* touchpoint requirements — current 30-day billing window */}
          <div className="rounded-md border p-3 space-y-2 bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Monthly requirements</div>
              {!setupComplete ? (
                <Badge className="bg-amber-500 text-white hover:bg-amber-500">Missing setup</Badge>
              ) : winStatus === 'complete' ? (
                <Badge className="bg-green-600 text-white hover:bg-green-600">Completed</Badge>
              ) : winStatus === 'overdue' ? (
                <Badge className="bg-red-600 text-white hover:bg-red-600">Overdue</Badge>
              ) : (
                <Badge variant="secondary">On track</Badge>
              )}
            </div>
            {!setupComplete ? (
              <p className="text-xs text-muted-foreground">
                Add an authorization start date to enable automatic scheduling.
              </p>
            ) : (
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Current 30-day cycle: <span className="font-medium text-foreground">{fmtShort(window!.start)} – {fmtShort(window!.end)}</span></div>
                <div>Required: <span className="font-medium text-foreground">1 in-person visit</span></div>
                <div>Done: <span className="font-medium text-foreground">{winProg!.inPersonSpaced > 0 ? 'yes' : 'not yet'}</span></div>
                <p className="pt-1">
                  One in-person visit per 30-day cycle. Phone calls, emails and
                  video are worth logging and appear on the calendar and in the
                  case log, but only the visit is required.
                </p>
              </div>
            )}
          </div>

          <TouchpointCycles clientId={clientId} />

          {/* contacts progress */}
          <div className="space-y-2">

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

            <Button size="sm" variant="outline" onClick={() => setLogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add touchpoint
            </Button>

            <AddTouchpointDialog
              open={logOpen}
              onOpenChange={setLogOpen}
              context={{
                clientId,
                clientName,
                levelOfNeed,
                locked: true,
                date: today,
                contactMethod: winProg && winProg.remainingInPerson > 0 ? 'in_person' : 'phone',
              }}
              onSaved={async () => {
                await regenerateTouchpointsForClient(clientId).catch(() => {});
                await load();
                onChanged?.();
              }}
            />
          </div>

        </CardContent>
      </Card>
    </TooltipProvider>
  );
};
