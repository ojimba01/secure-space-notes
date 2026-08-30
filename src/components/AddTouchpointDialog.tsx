// The one place a touchpoint is recorded.
//
// Left: the Case Notes record that counts toward the 30-day cycle.
// Right: the NJHMIS progress note, staged internally so it can be keyed in or
// exported later. Nothing here is sent to NJHMIS.
//
// There used to be a second free-text note on the left as well. It asked staff
// to write the same visit twice, and nothing in the app ever read it back, so
// the progress note is now the single account of what happened and is stored
// on the contact record too.
import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { ClientPicker } from '@/components/ClientPicker';
import { useToast } from '@/hooks/use-toast';
import { useMyProfileId } from '@/hooks/useMyProfileId';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useViewAs } from '@/components/ViewAsProvider';
import { regenerateTouchpointsForClient } from '@/lib/touchpoints';
import { isSetupComplete } from '@/lib/workflow';
import {
  CONTACT_METHOD_OPTIONS, TOUCHPOINT_TYPES, contactMethodLabel, touchpointTypeLabel,
  isInPersonMethod, todayAgency,
  NJHMIS_SERVICE_TYPES, NJHMIS_LOCATIONS, NJHMIS_NOTE_TYPES, NJHMIS_DEFAULT_NOTE_TYPE,
  defaultNjhmisServiceType, defaultNjhmisLocation,
} from '@/lib/compliance';
import { format } from 'date-fns';
import { Check, ClipboardCopy } from 'lucide-react';

export interface TouchpointContext {
  clientId: string;
  clientName: string;
  levelOfNeed?: string | null;
  /** Prefilled and locked when opened from a client, reminder, or calendar event. */
  locked: boolean;
  /** The scheduled calendar event this touchpoint completes, if any. */
  calendarEventId?: string | null;
  date?: string;
  contactMethod?: string | null;
  touchpointType?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to let staff pick the client from their caseload. */
  context?: TouchpointContext | null;
  onSaved?: () => void;
}

interface PickerClient {
  id: string;
  first_name: string;
  last_name: string;
  level_of_need: string | null;
  /** Whose caseload this client sits on. Null when nobody is assigned. */
  assigned_employee_id: string | null;
  assigned_name: string | null;
}

const FieldLabel: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <div className="space-y-0.5">
    <Label className="text-xs font-medium">{children}</Label>
    {hint && <p className="text-[11px] text-muted-foreground leading-tight">{hint}</p>}
  </div>
);

const ReadOnlyValue: React.FC<{ value: string; hint?: string }> = ({ value, hint }) => (
  <div>
    <div className="h-9 flex items-center rounded-md border bg-muted/40 px-3 text-sm">{value}</div>
    {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
  </div>
);

/** Hours + minutes, stored as a single minute count. */
const DurationInput: React.FC<{
  minutes: number;
  onChange: (m: number) => void;
  idPrefix: string;
}> = ({ minutes, onChange, idPrefix }) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return (
    <div className="flex items-center gap-2">
      <Input
        id={`${idPrefix}-hours`}
        type="number"
        min={0}
        max={12}
        value={h}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0) * 60 + m)}
        className="h-9 w-16"
      />
      <span className="text-xs text-muted-foreground">hr</span>
      <Input
        id={`${idPrefix}-minutes`}
        type="number"
        min={0}
        max={59}
        step={5}
        value={m}
        onChange={(e) => {
          const raw = Math.max(0, Math.min(59, Number(e.target.value) || 0));
          onChange(h * 60 + raw);
        }}
        className="h-9 w-16"
      />
      <span className="text-xs text-muted-foreground">min</span>
    </div>
  );
};

export const AddTouchpointDialog: React.FC<Props> = ({ open, onOpenChange, context, onSaved }) => {
  const { toast } = useToast();
  const { guardWrite } = useViewAs();
  const myProfileId = useMyProfileId();
  const { isAdmin } = useIsAdmin();
  const today = todayAgency();

  const [caseloadClients, setCaseloadClients] = useState<PickerClient[]>([]);
  const [saving, setSaving] = useState(false);

  // --- Case Notes touchpoint details -----------------------------------
  const [clientId, setClientId] = useState('');
  const [date, setDate] = useState(today);
  const [contactMethod, setContactMethod] = useState('in_person');
  const [touchpointType, setTouchpointType] = useState('general_checkin');
  const [durationMinutes, setDurationMinutes] = useState(30);

  // --- Progress Note Data Entry Settings -------------------------------
  const [serviceType, setServiceType] = useState(NJHMIS_SERVICE_TYPES[0]);
  const [location, setLocation] = useState(NJHMIS_LOCATIONS[0]);
  const [njDuration, setNjDuration] = useState(30);
  const [njDurationTouched, setNjDurationTouched] = useState(false);
  const [faceToFace, setFaceToFace] = useState<'yes' | 'no'>('yes');
  const [faceToFaceTouched, setFaceToFaceTouched] = useState(false);
  const [noteType, setNoteType] = useState(NJHMIS_DEFAULT_NOTE_TYPE);
  const [progressNote, setProgressNote] = useState('');
  const [copied, setCopied] = useState(false);
  /**
   * Who had the contact with the client. Normally the person filling this in,
   * but a supervisor entering a visit a case manager made must not have it
   * recorded against themselves -- that would misattribute care. When these
   * differ the row also stores entered_by, so the record shows both.
   */
  const [contactBy, setContactBy] = useState<string | null>(null);

  const selectedClient = useMemo(() => {
    if (context?.locked) {
      return { id: context.clientId, name: context.clientName, levelOfNeed: context.levelOfNeed ?? null };
    }
    const c = caseloadClients.find((x) => x.id === clientId);
    return c ? { id: c.id, name: `${c.first_name} ${c.last_name}`, levelOfNeed: c.level_of_need } : null;
  }, [context, caseloadClients, clientId]);

  // Reset every time the modal opens so a previous entry never leaks through.
  useEffect(() => {
    if (!open) return;
    const startDate = context?.date ?? today;
    const startMethod = context?.contactMethod ?? 'in_person';
    setClientId(context?.clientId ?? '');
    setDate(startDate);
    setContactMethod(startMethod);
    setTouchpointType(context?.touchpointType ?? 'general_checkin');
    setDurationMinutes(30);
    setServiceType(defaultNjhmisServiceType(context?.levelOfNeed));
    setLocation(defaultNjhmisLocation(startMethod));
    setNjDuration(30);
    setNjDurationTouched(false);
    setFaceToFace(isInPersonMethod(startMethod) ? 'yes' : 'no');
    setFaceToFaceTouched(false);
    setNoteType(NJHMIS_DEFAULT_NOTE_TYPE);
    setProgressNote('');
    setCopied(false);
    setContactBy(null);
  }, [open, context, today]);

  /**
   * NJHMIS is keyed in by hand elsewhere, so the note almost always has to be
   * retyped or re-selected out of this box. Copying it is the whole job.
   */
  const copyProgressNote = async () => {
    const text = progressNote.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused by the browser; say so rather than
      // showing a "Copied" that did not happen.
      toast({
        title: 'Could not copy',
        description: 'Select the note text and copy it manually.',
        variant: 'destructive',
      });
    }
  };

  // Client picker for the standalone "Add touchpoint" button.
  useEffect(() => {
    if (!open || context?.locked || !myProfileId) return;
    // Staff see only their own caseload. An admin can record a touchpoint for
    // any case manager's client -- entering a visit somebody else made is a
    // real supervisory job -- so the filter is dropped for them.
    let query = supabase
      .from('clients')
      .select('id, first_name, last_name, level_of_need, hsp_submitted, auth_150_number, auth_180_number, auth_30_start, auth_150_start, hsp_150_date, assigned_employee_id')
      .eq('status', 'active')
      // Deliberately no .eq('hsp_submitted', true). A 150-day or 180-day
      // authorization number proves the plan was submitted even when the flag
      // was never ticked, and a database filter cannot see that. isSetupComplete
      // below is the single place that decides.
      .order('first_name');
    if (!isAdmin) query = query.eq('assigned_employee_id', myProfileId);

    query.then(async ({ data }) => {
        // Staff only work setup-complete clients, and this is the one place
        // that decides what that means.
        const setupDone = (data ?? []).filter((c) => isSetupComplete(c));

        // Names for the "contact made by" default, so the picker can say
        // whose client this is rather than showing a bare id.
        const staffIds = [...new Set(setupDone.map((c) => c.assigned_employee_id).filter(Boolean))];
        const names = new Map<string, string>();
        if (staffIds.length) {
          const { data: profs } = await supabase
            .from('profiles').select('id, first_name, last_name').in('id', staffIds as string[]);
          for (const pr of profs ?? []) names.set(pr.id, `${pr.first_name ?? ''} ${pr.last_name ?? ''}`.trim());
        }

        const ready = setupDone.map((c) => ({
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
          level_of_need: c.level_of_need,
          assigned_employee_id: c.assigned_employee_id ?? null,
          assigned_name: c.assigned_employee_id ? names.get(c.assigned_employee_id) ?? null : null,
        }));
        setCaseloadClients(ready);
      });
  }, [open, context?.locked, myProfileId, isAdmin]);

  // Contact method drives the NJHMIS answers until staff overrides them.
  useEffect(() => {
    if (!faceToFaceTouched) setFaceToFace(isInPersonMethod(contactMethod) ? 'yes' : 'no');
    setLocation((prev) => {
      const auto = defaultNjhmisLocation(contactMethod);
      // Only re-derive when the current value is still an auto-picked one.
      return prev === 'Consumer Residence' || prev === 'Telehealth' ? auto : prev;
    });
  }, [contactMethod, faceToFaceTouched]);

  // Duration syncs across until staff sets the NJHMIS one deliberately.
  useEffect(() => {
    if (!njDurationTouched) setNjDuration(durationMinutes);
  }, [durationMinutes, njDurationTouched]);

  // Service type follows the client's tier when the client changes.
  const selectedLevelOfNeed = selectedClient?.levelOfNeed ?? null;
  useEffect(() => {
    setServiceType(defaultNjhmisServiceType(selectedLevelOfNeed));
  }, [selectedLevelOfNeed]);


  // Default to the client's own case manager, so an admin recording someone
  // else's visit attributes it correctly without having to think about it.
  const assignedTo = useMemo(() => {
    if (context?.locked) return null;
    return caseloadClients.find((c) => c.id === clientId) ?? null;
  }, [caseloadClients, clientId, context?.locked]);

  useEffect(() => {
    setContactBy(assignedTo?.assigned_employee_id ?? myProfileId ?? null);
  }, [assignedTo, myProfileId]);

  /** True when this is being filed on somebody else's behalf. */
  const onBehalfOf =
    contactBy && myProfileId && contactBy !== myProfileId ? assignedTo?.assigned_name ?? null : null;

  const canSave = !!selectedClient && !!date && !saving;

  const handleSave = async () => {
    if (!selectedClient) return;
    if (guardWrite()) { onOpenChange(false); return; }
    if (!myProfileId) {
      toast({ title: 'Could not identify your profile', variant: 'destructive' });
      return;
    }
    setSaving(true);

    // 1. The Case Notes touchpoint record — this is what the cycle counts.
    const { data: contact, error } = await supabase
      .from('client_contacts')
      .insert({
        client_id: selectedClient.id,
        employee_id: contactBy ?? myProfileId,
        entered_by: contactBy && contactBy !== myProfileId ? myProfileId : null,
        contact_date: date,
        modality: contactMethod,
        touchpoint_type: touchpointType,
        duration_minutes: durationMinutes,
        notes: progressNote.trim() || null,
        calendar_event_id: context?.calendarEventId ?? null,
      })
      .select('id')
      .maybeSingle();

    if (error) {
      setSaving(false);
      toast({ title: 'Could not save the touchpoint', description: error.message, variant: 'destructive' });
      return;
    }

    // 2. The internal NJHMIS-ready entry. Staged only — never submitted.
    const { error: njError } = await supabase.from('njhmis_progress_notes').insert({
      client_id: selectedClient.id,
      contact_id: contact?.id ?? null,
      employee_id: contactBy ?? myProfileId,
      entered_by: contactBy && contactBy !== myProfileId ? myProfileId : null,
      service_type: serviceType,
      location,
      note_date: date,
      duration_minutes: njDuration,
      face_to_face: faceToFace === 'yes',
      contact_method: contactMethod,
      note_type: noteType,
      note_text: progressNote || null,
      entry_status: 'ready',
    });

    // 3. Close out the scheduled touchpoint this completes, keeping the staff's
    //    own scheduling. Regeneration below preserves manual moves.
    if (context?.calendarEventId) {
      await supabase
        .from('calendar_events')
        .update({ status: 'completed', modality: contactMethod, touchpoint_type: touchpointType })
        .eq('id', context.calendarEventId);
    }

    await regenerateTouchpointsForClient(selectedClient.id).catch(() => {});
    setSaving(false);

    if (njError) {
      toast({
        title: 'Touchpoint saved, progress note not staged',
        description: njError.message,
        variant: 'destructive',
      });
    } else {
      toast({ title: 'Touchpoint saved', description: 'An NJHMIS-ready progress note is staged for entry.' });
    }
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add touchpoint</DialogTitle>
          <DialogDescription>
            Records the contact and stages a matching NJHMIS progress note. Nothing is sent to NJHMIS.
          </DialogDescription>
        </DialogHeader>

        {/* Two equal columns left the details side as a tall, mostly empty box
            once the duplicate note was removed. It is now the narrower of the
            two and only as tall as its own content, so the progress note gets
            the room it actually needs. */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
          {/* ---------------- Section 1 ---------------- */}
          <section className="space-y-3 rounded-lg border p-4 lg:col-span-2">
            <h3 className="text-sm font-semibold">Case Notes touchpoint details</h3>

            <div className="space-y-1.5">
              <FieldLabel>Client</FieldLabel>
              {context?.locked ? (
                <ReadOnlyValue value={context.clientName} />
              ) : (
                <ClientPicker
                  clients={caseloadClients}
                  value={clientId || null}
                  onChange={setClientId}
                  className="h-9 w-full"
                  // Whose caseload it is, so an admin picking from the whole
                  // agency can tell the difference, and can type it too.
                  noteFor={(c) =>
                    isAdmin &&
                    (c as typeof caseloadClients[number]).assigned_employee_id !== myProfileId
                      ? (c as typeof caseloadClients[number]).assigned_name ?? null
                      : null
                  }
                />
              )}
            </div>

            {/* Filing on someone else's behalf is stated plainly rather than
                left to be inferred from who happens to be signed in. */}
            {onBehalfOf && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 space-y-1.5">
                <p className="text-xs">
                  This is <strong>{onBehalfOf}</strong>&rsquo;s client. The contact will be
                  recorded as theirs, noting that you entered it.
                </p>
                <button
                  type="button"
                  className="text-[11px] underline text-muted-foreground hover:text-foreground"
                  onClick={() => setContactBy(myProfileId ?? null)}
                >
                  No — I made this contact myself
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <FieldLabel hint="The date the contact happened.">Touchpoint date</FieldLabel>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Contact method</FieldLabel>
                <Select value={contactMethod} onValueChange={setContactMethod}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTACT_METHOD_OPTIONS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Touchpoint type</FieldLabel>
              <Select value={touchpointType} onValueChange={setTouchpointType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TOUCHPOINT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Duration</FieldLabel>
              <DurationInput minutes={durationMinutes} onChange={setDurationMinutes} idPrefix="tp" />
            </div>

          </section>

          {/* ---------------- Section 2 ---------------- */}
          <section className="space-y-3 rounded-lg border p-4 bg-muted/20 lg:col-span-3">
            <div>
              <h3 className="text-sm font-semibold">Progress Note Data Entry Settings</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Prepares an internal NJHMIS-ready record for later entry or export.
              </p>
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Consumer</FieldLabel>
              <ReadOnlyValue value={selectedClient?.name ?? 'Select a client'} />
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Service Type</FieldLabel>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NJHMIS_SERVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Location</FieldLabel>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NJHMIS_LOCATIONS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <FieldLabel>Date</FieldLabel>
                <ReadOnlyValue
                  value={date ? format(new Date(`${date}T12:00:00`), 'MMM d, yyyy') : '—'}
                  hint="Synced from Touchpoint date."
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Duration</FieldLabel>
                <DurationInput
                  minutes={njDuration}
                  onChange={(m) => { setNjDurationTouched(true); setNjDuration(m); }}
                  idPrefix="nj"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <FieldLabel>Face-to-Face?</FieldLabel>
                <RadioGroup
                  value={faceToFace}
                  onValueChange={(v) => { setFaceToFaceTouched(true); setFaceToFace(v as 'yes' | 'no'); }}
                  className="flex items-center gap-4 h-9"
                >
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="yes" id="f2f-yes" className="h-3.5 w-3.5" />
                    <Label htmlFor="f2f-yes" className="text-xs font-normal">Yes</Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="no" id="f2f-no" className="h-3.5 w-3.5" />
                    <Label htmlFor="f2f-no" className="text-xs font-normal">No</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Contact Method</FieldLabel>
                <ReadOnlyValue
                  value={contactMethodLabel(contactMethod)}
                  hint="Synced from Contact method."
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Progress Note Type Selection</FieldLabel>
              <RadioGroup
                value={noteType}
                onValueChange={setNoteType}
                className="grid grid-cols-2 gap-x-3 gap-y-1"
              >
                {NJHMIS_NOTE_TYPES.map((t) => (
                  <div key={t} className="flex items-center gap-1.5">
                    <RadioGroupItem value={t} id={`nt-${t}`} className="h-3.5 w-3.5 shrink-0" />
                    <Label htmlFor={`nt-${t}`} className="text-xs font-normal leading-tight">{t}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Progress note</FieldLabel>
              <Textarea
                value={progressNote}
                onChange={(e) => setProgressNote(e.target.value)}
                rows={5}
                className="text-sm"
                placeholder="CM contacted the client to follow up on housing status. The client reported that housing was stable at this time and did not report immediate concerns. CM will continue to provide support as needed."
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  Third person. &ldquo;CM&rdquo; is fine for case manager.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 text-[11px]"
                  disabled={!progressNote.trim()}
                  onClick={copyProgressNote}
                >
                  {copied ? (
                    <><Check className="mr-1 h-3 w-3" /> Copied</>
                  ) : (
                    <><ClipboardCopy className="mr-1 h-3 w-3" /> Copy note</>
                  )}
                </Button>
              </div>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving ? 'Saving…' : 'Save touchpoint'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
