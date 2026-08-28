// Client Intake — the agency's paper intake form as a screen.
//
// Answers land on the client's intake record rather than in a document, and
// the few that duplicate columns on the client record are written through
// (empty fields only; disagreements are raised, never overwritten).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { useViewAs } from '@/components/ViewAsProvider';
import { supabase } from '@/integrations/supabase/client';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import {
  ACCOMMODATION_OPTIONS,
  APARTMENT_TYPE_OPTIONS,
  BEDROOM_OPTIONS,
  EXPENSE_FIELDS,
  GENDER_OPTIONS,
  HOUSING_STATUS_OPTIONS,
  HOUSING_TYPE_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  NJ_COUNTIES,
  TRANSPORTATION_OPTIONS,
  VOUCHER_TYPE_OPTIONS,
  applyWriteThrough,
  emptyIntake,
  expensesTotal,
  loadIntake,
  markLifecycleIntakeComplete,
  saveIntake,
  writeThroughPlan,
  type HouseholdMemberDraft,
  type IntakeDraft,
  type WriteThroughField,
} from '@/lib/clientIntake';
import { DIGITS_ONLY_HINT, digitsOnly } from '@/lib/ids';
import {
  AreaField,
  ChoiceField,
  FieldRow,
  MoneyField,
  MultiChoiceField,
  Question,
  TextField,
  YesNo,
} from '@/components/intake/IntakeFields';

interface Props {
  clientId: string;
  clientFirstName: string;
  clientLastName: string;
  /** Refreshes the client record after a write-through or a completed intake. */
  onUpdate?: () => void;
}

type TextKey = {
  [K in keyof IntakeDraft]: IntakeDraft[K] extends string | null | undefined ? K : never;
}[keyof IntakeDraft];

type NumberKey = {
  [K in keyof IntakeDraft]: IntakeDraft[K] extends number | null | undefined ? K : never;
}[keyof IntakeDraft];

type BoolKey = {
  [K in keyof IntakeDraft]: IntakeDraft[K] extends boolean | null | undefined ? K : never;
}[keyof IntakeDraft];

type ListKey = 'accommodations' | 'counties_of_interest' | 'transportation_types' | 'voucher_types';

const money = (value: number | null) =>
  value === null ? '—' : `$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

const SECTIONS = [
  { id: 'client-information', label: 'Client information' },
  { id: 'medical', label: 'Medical' },
  { id: 'income', label: 'Income and financial' },
  { id: 'housing-history', label: 'Housing history' },
  { id: 'expenses', label: 'Expenses and rental needs' },
  { id: 'additional', label: 'Additional information' },
  { id: 'preferences', label: 'Housing preferences' },
  { id: 'certification', label: 'Certification' },
];

export const ClientIntakeForm: React.FC<Props> = ({
  clientId,
  clientFirstName,
  clientLastName,
  onUpdate,
}) => {
  const { toast } = useToast();
  const profileId = useEffectiveProfileId();
  const { isViewingAs } = useViewAs();

  const [draft, setDraft] = useState<IntakeDraft>(emptyIntake);
  const [household, setHousehold] = useState<HouseholdMemberDraft[]>([]);
  const [status, setStatus] = useState<'draft' | 'complete'>('draft');
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSensitive, setShowSensitive] = useState(false);
  const [showSsn, setShowSsn] = useState(false);
  const [conflicts, setConflicts] = useState<WriteThroughField[]>([]);
  const [client, setClient] = useState<{
    date_of_birth: string | null;
    member_id: string | null;
    medicaid_id: string | null;
  }>({ date_of_birth: null, member_id: null, medicaid_id: null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ intake, household: members }, clientRow] = await Promise.all([
        loadIntake(clientId),
        supabase
          .from('clients')
          .select('date_of_birth, member_id, medicaid_id')
          .eq('id', clientId)
          .maybeSingle(),
      ]);

      if (clientRow.error) throw clientRow.error;
      if (clientRow.data) {
        setClient({
          date_of_birth: clientRow.data.date_of_birth,
          member_id: clientRow.data.member_id,
          medicaid_id: clientRow.data.medicaid_id,
        });
      }

      if (intake) {
        const {
          id: _id,
          client_id: _clientId,
          created_at: _createdAt,
          updated_at: _updatedAt,
          created_by: _createdBy,
          completed_at,
          completed_by: _completedBy,
          status: intakeStatus,
          ...rest
        } = intake;
        setDraft(rest);
        setStatus(intakeStatus === 'complete' ? 'complete' : 'draft');
        setCompletedAt(completed_at);
        setHousehold(
          members.map((m) => ({
            id: m.id,
            name: m.name,
            age: m.age === null ? '' : String(m.age),
            relationship: m.relationship ?? '',
          })),
        );
      } else {
        // A fresh intake starts from what the client record already knows, so
        // staff are not retyping a date of birth the app has.
        setDraft({
          ...emptyIntake(),
          birth_date: clientRow.data?.date_of_birth ?? null,
          mco_number: clientRow.data?.member_id ?? null,
          medicaid_number: clientRow.data?.medicaid_id ?? null,
        });
      }
    } catch (err: any) {
      toast({
        title: 'Could not load the intake',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const set = <K extends keyof IntakeDraft>(key: K, value: IntakeDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  /** Text input bound to a nullable text column; blank saves as null. */
  const text = (key: TextKey) => ({
    value: (draft[key] as string | null | undefined) ?? '',
    onChange: (v: string) => set(key, (v.trim() === '' ? null : v) as IntakeDraft[TextKey]),
  });

  const num = (key: NumberKey) => ({
    value: draft[key] === null || draft[key] === undefined ? '' : String(draft[key]),
    onChange: (v: string) => {
      const parsed = v.trim() === '' ? null : Number(v.replace(/[^0-9.-]/g, ''));
      set(key, (parsed === null || Number.isNaN(parsed) ? null : parsed) as IntakeDraft[NumberKey]);
    },
  });

  const bool = (key: BoolKey) => ({
    value: draft[key] as boolean | null | undefined,
    onChange: (v: boolean | null) => set(key, v as IntakeDraft[BoolKey]),
  });

  const list = (key: ListKey) => ({
    values: (draft[key] as string[] | undefined) ?? [],
    onChange: (v: string[]) => set(key, v as IntakeDraft[ListKey]),
  });

  const total = useMemo(() => expensesTotal(draft), [draft]);

  const guard = () => {
    if (isViewingAs) {
      toast({
        title: 'Preview only',
        description: 'Changes are not saved while viewing as an employee.',
      });
      return true;
    }
    return false;
  };

  const persist = async (complete: boolean) => {
    if (guard()) return;
    if (complete) {
      const missing: string[] = [];
      if (!draft.client_signature_name) missing.push('the client’s name');
      if (!draft.client_signed_date) missing.push('the client’s signature date');
      if (!draft.staff_signature_name) missing.push('the staff name');
      if (!draft.staff_signed_date) missing.push('the staff signature date');
      if (missing.length) {
        toast({
          title: 'The certification is not filled in',
          description: `Still needs ${missing.join(', ')}.`,
          variant: 'destructive',
        });
        return;
      }
    }

    setSaving(true);
    try {
      await saveIntake({ clientId, draft, household, profileId, complete });

      // Fill the client record's empty fields; raise the ones that disagree.
      const plan = writeThroughPlan(draft, client);
      if (plan.fill.length) {
        await applyWriteThrough(clientId, plan.fill);
        setClient((c) => {
          const next = { ...c };
          plan.fill.forEach((f) => {
            next[f.key === 'date_of_birth' ? 'date_of_birth' : f.key] = f.intakeValue;
          });
          return next;
        });
      }
      setConflicts(plan.conflicts);

      if (complete) {
        await markLifecycleIntakeComplete(clientId);
        setStatus('complete');
        setCompletedAt(new Date().toISOString());
      }

      toast({
        title: complete ? 'Intake completed' : 'Intake saved',
        description: complete
          ? 'The intake step is now marked complete, so the assessments are unlocked.'
          : plan.fill.length
            ? `Saved, and ${plan.fill.map((f) => f.label.toLowerCase()).join(' and ')} copied to the client record.`
            : 'Saved as a draft.',
      });
      onUpdate?.();
    } catch (err: any) {
      toast({
        title: 'Could not save the intake',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const resolveConflict = async (field: WriteThroughField, useIntake: boolean) => {
    if (useIntake) {
      try {
        await applyWriteThrough(clientId, [field]);
        setClient((c) => ({ ...c, [field.key]: field.intakeValue }));
        toast({ title: `${field.label} updated on the client record` });
        onUpdate?.();
      } catch (err: any) {
        toast({
          title: 'Could not update the client record',
          description: err.message,
          variant: 'destructive',
        });
        return;
      }
    }
    setConflicts((cs) => cs.filter((c) => c.key !== field.key));
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-muted-foreground">Loading the intake.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg">Client Intake</CardTitle>
              <p className="text-sm text-muted-foreground">
                {clientFirstName} {clientLastName}
                {status === 'complete' && completedAt
                  ? ` — completed ${new Date(completedAt).toLocaleDateString()}`
                  : ''}
              </p>
            </div>
            <Badge
              variant="secondary"
              className={status === 'complete' ? 'bg-green-100 text-green-800' : ''}
            >
              {status === 'complete' ? 'Complete' : 'Draft'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <Button
                key={s.id}
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              >
                {s.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            No field is required. The intake can be saved as a draft at any point. Completing it is a
            separate action at the bottom of this page, which also marks the intake step complete.
          </p>
        </CardContent>
      </Card>

      {conflicts.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-base text-amber-900">
              The intake disagrees with the client record
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {conflicts.map((f) => (
              <div key={f.key} className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-amber-900">
                  <span className="font-medium">{f.label}:</span> the record says{' '}
                  <span className="font-mono">{f.clientValue}</span>, the intake says{' '}
                  <span className="font-mono">{f.intakeValue}</span>.
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => resolveConflict(f, true)}>
                    Use the intake answer
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => resolveConflict(f, false)}>
                    Keep the record
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ---------------------------------------------- Client information */}
      <Card id="client-information">
        <CardHeader>
          <CardTitle className="text-base">Client information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Question label="Full name">
            <Input value={`${clientFirstName} ${clientLastName}`} disabled />
            <p className="text-xs text-muted-foreground">
              Held on the client record. Edit it there if it is wrong.
            </p>
          </Question>

          <Question label="Birth date and Social Security number">
            <FieldRow columns={2}>
              <TextField label="Birth date" type="date" {...text('birth_date')} />
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Social Security number</Label>
                <div className="flex gap-2">
                  <Input
                    type={showSsn ? 'text' : 'password'}
                    value={draft.ssn ?? ''}
                    onChange={(e) => set('ssn', e.target.value.trim() === '' ? null : e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowSsn((v) => !v)}
                    aria-label={showSsn ? 'Hide the Social Security number' : 'Show the Social Security number'}
                  >
                    {showSsn ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Hidden by default and never shown in any list.
                </p>
              </div>
            </FieldRow>
          </Question>

          <Question number={1} label="Gender and marital status">
            <div className="space-y-3">
              <ChoiceField
                options={GENDER_OPTIONS}
                value={draft.gender}
                onChange={(v) => set('gender', v)}
              />
              <ChoiceField
                options={MARITAL_STATUS_OPTIONS}
                value={draft.marital_status}
                onChange={(v) => set('marital_status', v)}
              />
              {draft.marital_status === 'Other' && (
                <TextField label="Other" {...text('marital_status_other')} />
              )}
            </div>
          </Question>

          <Question number={2} label="Emergency contact">
            <FieldRow>
              <TextField label="Name" {...text('emergency_contact_name')} />
              <TextField label="Relationship" {...text('emergency_contact_relationship')} />
              <TextField label="Phone" type="tel" {...text('emergency_contact_phone')} />
            </FieldRow>
          </Question>

          <Question number={3} label="Do you have a copy of your birth certificate in your possession?">
            <YesNo {...bool('has_birth_certificate')} />
          </Question>

          <Question number={4} label="Identification documents">
            <FieldRow columns={2}>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Valid ID card</Label>
                <YesNo {...bool('has_valid_id')} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Copy of Social Security card</Label>
                <YesNo {...bool('has_social_security_card')} />
              </div>
            </FieldRow>
          </Question>

          <Question
            number={5}
            label="MCO number and Medicaid number"
            hint={`These also live on the client record. Saving copies them across when the record has none. ${DIGITS_ONLY_HINT}`}
          >
            <FieldRow columns={2}>
              <TextField
                label="MCO #"
                value={draft.mco_number ?? ''}
                onChange={(v) => set('mco_number', digitsOnly(v) || null)}
              />
              <TextField
                label="Medicaid #"
                value={draft.medicaid_number ?? ''}
                onChange={(v) => set('medicaid_number', digitsOnly(v) || null)}
              />
            </FieldRow>
          </Question>

          <Question number={6} label="Place of birth">
            <FieldRow>
              <TextField label="City" {...text('birth_city')} />
              <TextField label="State" {...text('birth_state')} />
              <TextField label="Country" {...text('birth_country')} />
            </FieldRow>
          </Question>

          <Question number={7} label="Race">
            <TextField {...text('race')} />
          </Question>

          <Question number={8} label="U.S. citizen">
            <div className="space-y-3">
              <YesNo {...bool('us_citizen')} />
              {draft.us_citizen === false && <TextField label="Alien #" {...text('alien_number')} />}
            </div>
          </Question>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------- Medical */}
      <Card id="medical">
        <CardHeader>
          <CardTitle className="text-base">Medical information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Question number={9} label="Primary care physician">
            <FieldRow>
              <TextField label="Doctor's name" {...text('pcp_name')} />
              <TextField label="Phone" type="tel" {...text('pcp_phone')} />
              <TextField label="Practice name" {...text('pcp_practice')} />
            </FieldRow>
          </Question>

          <Question number={10} label="All medical diagnoses and chronic conditions">
            <AreaField {...text('medical_diagnoses')} />
          </Question>

          <Question number={11} label="Developmental disability">
            <div className="space-y-3">
              <YesNo {...bool('developmental_disability')} />
              {draft.developmental_disability && (
                <AreaField label="Please explain" rows={2} {...text('developmental_disability_detail')} />
              )}
            </div>
          </Question>

          <Question number={12} label="Physical condition">
            <div className="space-y-3">
              <YesNo {...bool('physical_condition')} />
              {draft.physical_condition && (
                <AreaField label="Please explain" rows={2} {...text('physical_condition_detail')} />
              )}
            </div>
          </Question>

          <Question number={13} label="Mental health condition">
            <YesNo {...bool('mental_health_condition')} />
          </Question>

          <Question number={14} label="Mental health provider or agency">
            <FieldRow columns={2}>
              <TextField label="Name" {...text('mental_health_provider')} />
              <TextField label="Phone" type="tel" {...text('mental_health_provider_phone')} />
            </FieldRow>
          </Question>

          <Question number={15} label="Schedule with the therapist or counsellor">
            <AreaField rows={2} {...text('therapy_schedule')} />
          </Question>

          <Question number={16} label="Psychiatrist">
            <FieldRow columns={2}>
              <TextField label="Name" {...text('psychiatrist_name')} />
              <TextField label="Phone" type="tel" {...text('psychiatrist_phone')} />
            </FieldRow>
          </Question>

          <Question number={17} label="All mental health diagnoses">
            <AreaField {...text('mental_health_diagnoses')} />
          </Question>
        </CardContent>
      </Card>

      {/* --------------------------------------------- Income and financial */}
      <Card id="income">
        <CardHeader>
          <CardTitle className="text-base">Income and financial information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Question number={18} label="Proof of earned, SSI or SSDI income">
            <div className="space-y-3">
              <YesNo {...bool('has_income_proof')} />
              <FieldRow columns={2}>
                <TextField label="Type of income" {...text('income_type')} />
                <MoneyField label="Monthly amount" {...num('income_monthly_amount')} />
              </FieldRow>
            </div>
          </Question>

          <Question number={19} label="Bank account">
            <div className="space-y-3">
              <YesNo {...bool('has_bank_account')} />
              {draft.has_bank_account && <TextField label="Name of bank" {...text('bank_name')} />}
            </div>
          </Question>

          <Question number={20} label="Applied for a housing voucher">
            <div className="space-y-3">
              <YesNo {...bool('applied_for_voucher')} />
              {draft.applied_for_voucher && <TextField label="Which county" {...text('voucher_county')} />}
            </div>
          </Question>

          <Question number={21} label="Currently employed">
            <div className="space-y-3">
              <YesNo {...bool('currently_employed')} />
              {draft.currently_employed && (
                <FieldRow>
                  <TextField label="Company name" {...text('employer_name')} />
                  <TextField label="Hours per week" {...num('hours_per_week')} />
                  <TextField label="Hourly wage or salary" {...text('wage')} />
                </FieldRow>
              )}
            </div>
          </Question>

          <Question number={22} label="Last hospitalization date">
            <TextField type="date" {...text('last_hospitalization_date')} />
          </Question>
        </CardContent>
      </Card>

      {/* ------------------------------------------------- Housing history */}
      <Card id="housing-history">
        <CardHeader>
          <CardTitle className="text-base">Housing history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Question number={23} label="Last address, with ZIP code">
            <AreaField rows={2} {...text('last_address')} />
          </Question>

          <Question number={24} label="How long did you live at the last address?">
            <TextField {...text('last_address_duration')} />
          </Question>

          <Question number={25} label="Present address">
            <AreaField rows={2} {...text('present_address')} />
          </Question>

          <Question number={26} label="Food stamps / SNAP or other benefits">
            <div className="space-y-3">
              <YesNo {...bool('receives_benefits')} />
              {draft.receives_benefits && (
                <FieldRow columns={2}>
                  <TextField label="Type of benefit" {...text('benefit_type')} />
                  <MoneyField label="Monthly amount" {...num('benefit_monthly_amount')} />
                </FieldRow>
              )}
            </div>
          </Question>

          <Question number={27} label="Current housing status">
            <div className="space-y-3">
              <ChoiceField
                options={HOUSING_STATUS_OPTIONS}
                value={draft.housing_status}
                onChange={(v) => set('housing_status', v)}
              />
              {draft.housing_status === 'Other' && (
                <TextField label="Other" {...text('housing_status_other')} />
              )}
            </div>
          </Question>

          <Question number={28} label="How is your health being impacted by your current living situation?">
            <AreaField {...text('health_impact')} />
          </Question>

          <Question number={29} label="How many months or years have you been homeless?">
            <TextField {...text('homeless_duration')} />
          </Question>

          <Question number={30} label="Reason for homelessness">
            <AreaField {...text('homelessness_cause')} />
          </Question>

          <Question
            number={31}
            label="Currently living outside, in a car, a public place, a train, a shelter or another location"
          >
            <div className="space-y-3">
              <YesNo {...bool('living_unsheltered')} />
              {draft.living_unsheltered && (
                <AreaField label="Please explain" rows={2} {...text('living_unsheltered_detail')} />
              )}
            </div>
          </Question>

          <Question
            number={32}
            label="History of eviction, criminal charges, probation or poor credit"
          >
            <div className="space-y-3">
              <YesNo {...bool('has_eviction_or_record')} />
              {draft.has_eviction_or_record && (
                <AreaField label="Please explain" rows={2} {...text('eviction_or_record_detail')} />
              )}
            </div>
          </Question>

          <Question number={33} label="Special accommodation needed">
            <div className="space-y-3">
              <YesNo {...bool('needs_accommodation')} />
              {draft.needs_accommodation && (
                <>
                  <MultiChoiceField options={ACCOMMODATION_OPTIONS} {...list('accommodations')} />
                  <TextField label="Other" {...text('accommodation_other')} />
                </>
              )}
            </div>
          </Question>
        </CardContent>
      </Card>

      {/* ------------------------------------ Expenses and rental needs */}
      <Card id="expenses">
        <CardHeader>
          <CardTitle className="text-base">Monthly expenses and rental needs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Question number={34} label="Monthly expenses" hint="The total adds itself up.">
            <div className="space-y-3">
              <FieldRow>
                {EXPENSE_FIELDS.map(({ key, label }) => (
                  <MoneyField key={key} label={label} {...num(key)} />
                ))}
              </FieldRow>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Total monthly expenses: </span>
                <span className="font-medium">{money(total)}</span>
              </div>
            </div>
          </Question>

          <Question number={35} label="Money available for rental application fees">
            <div className="space-y-3">
              <YesNo {...bool('has_application_fee_funds')} />
              {draft.has_application_fee_funds && (
                <MoneyField label="Amount available" {...num('application_fee_amount')} />
              )}
            </div>
          </Question>

          <Question number={36} label="How much do you plan to spend on monthly rent?">
            <MoneyField label="Per month" {...num('planned_monthly_rent')} />
          </Question>

          <Question number={37} label="Type of voucher sought or held">
            <div className="space-y-3">
              <MultiChoiceField options={VOUCHER_TYPE_OPTIONS} {...list('voucher_types')} />
              <TextField label="Other" {...text('voucher_type_other')} />
            </div>
          </Question>

          <Question number={38} label="Is the housing for the client alone?">
            <YesNo {...bool('housing_for_self_only')} />
          </Question>

          <Question number={39} label="Which counties are you interested in?">
            <div className="space-y-3">
              <MultiChoiceField
                options={NJ_COUNTIES}
                columns={4}
                {...list('counties_of_interest')}
              />
              <TextField label="Other (including out of state)" {...text('county_other')} />
            </div>
          </Question>
        </CardContent>
      </Card>

      {/* ------------------------------------------ Additional information */}
      <Card id="additional">
        <CardHeader>
          <CardTitle className="text-base">Additional client information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Sensitive questions (40–43)</p>
                <p className="text-xs text-muted-foreground">
                  HIV/AIDS status, substance use, domestic violence and pregnancy. The form itself
                  says these should be collected only when they are needed to determine services or
                  accommodations. They are never shown in any client list.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowSensitive((v) => !v)}>
                {showSensitive ? 'Hide' : 'Show'}
              </Button>
            </div>

            {showSensitive && (
              <div className="mt-4 space-y-4">
                <Question number={40} label="Do you have HIV/AIDS?">
                  <YesNo {...bool('hiv_aids')} />
                </Question>

                <Question number={41} label="Any current or past substance use?">
                  <div className="space-y-3">
                    <YesNo {...bool('substance_use')} />
                    {draft.substance_use && (
                      <AreaField label="Please explain" rows={2} {...text('substance_use_detail')} />
                    )}
                  </div>
                </Question>

                <Question number={42} label="Are you a victim of domestic violence?">
                  <YesNo {...bool('domestic_violence_victim')} />
                </Question>

                <Question number={43} label="Are you pregnant?">
                  <ChoiceField
                    options={['Yes', 'No', 'N/A']}
                    value={
                      draft.pregnant === 'yes'
                        ? 'Yes'
                        : draft.pregnant === 'no'
                          ? 'No'
                          : draft.pregnant === 'na'
                            ? 'N/A'
                            : null
                    }
                    onChange={(v) =>
                      set('pregnant', v === 'Yes' ? 'yes' : v === 'No' ? 'no' : v === 'N/A' ? 'na' : null)
                    }
                  />
                </Question>
              </div>
            )}
          </div>

          <Question number={44} label="Are you a veteran?">
            <YesNo {...bool('veteran')} />
          </Question>

          <Question number={45} label="Highest grade completed or college level">
            <TextField {...text('highest_grade')} />
          </Question>

          <Question number={46} label="Currently in school">
            <div className="space-y-3">
              <YesNo {...bool('in_school')} />
              {draft.in_school && <TextField label="School or programme" {...text('school_program')} />}
            </div>
          </Question>

          <Question number={47} label="Currently in vocational training or an apprenticeship">
            <div className="space-y-3">
              <YesNo {...bool('in_vocational_training')} />
              {draft.in_vocational_training && (
                <TextField label="Programme" {...text('vocational_program')} />
              )}
            </div>
          </Question>
        </CardContent>
      </Card>

      {/* --------------------------------------------- Housing preferences */}
      <Card id="preferences">
        <CardHeader>
          <CardTitle className="text-base">Housing preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Question number={48} label="Preferred type of housing">
            <div className="space-y-3">
              <ChoiceField
                options={HOUSING_TYPE_OPTIONS}
                value={draft.preferred_housing_type}
                onChange={(v) => set('preferred_housing_type', v)}
              />
              {draft.preferred_housing_type === 'Other' && (
                <TextField label="Other" {...text('preferred_housing_type_other')} />
              )}
            </div>
          </Question>

          <Question number={49} label="Access to transportation">
            <div className="space-y-3">
              <YesNo {...bool('has_transportation')} />
              {draft.has_transportation && (
                <>
                  <MultiChoiceField options={TRANSPORTATION_OPTIONS} columns={3} {...list('transportation_types')} />
                  <TextField label="Other" {...text('transportation_other')} />
                </>
              )}
            </div>
          </Question>

          <Question number={50} label="Preferred apartment type">
            <ChoiceField
              options={APARTMENT_TYPE_OPTIONS}
              value={draft.preferred_apartment_type}
              onChange={(v) => set('preferred_apartment_type', v)}
            />
          </Question>

          <Question number={51} label="How many bedrooms are needed?">
            <ChoiceField
              options={BEDROOM_OPTIONS}
              value={draft.bedrooms_needed}
              onChange={(v) => set('bedrooms_needed', v)}
            />
          </Question>

          <Question
            number={52}
            label="Children or family members who will be living with you"
            hint="Household members are recorded here only. They are not clients, and adding one does not create a record or a billing cycle."
          >
            <div className="space-y-3">
              <YesNo {...bool('has_household_members')} />
              {draft.has_household_members && (
                <div className="space-y-2">
                  {household.map((member, index) => (
                    <div key={index} className="flex flex-wrap items-end gap-2">
                      <TextField
                        label="Name"
                        className="min-w-[12rem] flex-1"
                        value={member.name}
                        onChange={(v) =>
                          setHousehold((rows) =>
                            rows.map((r, i) => (i === index ? { ...r, name: v } : r)),
                          )
                        }
                      />
                      <TextField
                        label="Age"
                        className="w-24"
                        value={member.age}
                        onChange={(v) =>
                          setHousehold((rows) =>
                            rows.map((r, i) => (i === index ? { ...r, age: v } : r)),
                          )
                        }
                      />
                      <TextField
                        label="Relationship"
                        className="min-w-[10rem] flex-1"
                        value={member.relationship}
                        onChange={(v) =>
                          setHousehold((rows) =>
                            rows.map((r, i) => (i === index ? { ...r, relationship: v } : r)),
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setHousehold((rows) => rows.filter((_, i) => i !== index))}
                        aria-label="Remove this household member"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setHousehold((rows) => [...rows, { name: '', age: '', relationship: '' }])
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add a household member
                  </Button>
                </div>
              )}
            </div>
          </Question>

          <Question number={53} label="Additional information or comments">
            <AreaField {...text('additional_comments')} />
          </Question>
        </CardContent>
      </Card>

      {/* --------------------------------------------------- Certification */}
      <Card id="certification">
        <CardHeader>
          <CardTitle className="text-base">Client certification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The client certifies that the information on this intake form is true and complete to the
            best of their knowledge, and understands that additional documentation may be requested to
            verify eligibility for housing and supportive services.
          </p>

          <FieldRow columns={2}>
            <TextField label="Client name" {...text('client_signature_name')} />
            <TextField label="Date signed" type="date" {...text('client_signed_date')} />
          </FieldRow>
          <FieldRow columns={2}>
            <TextField label="Staff name" {...text('staff_signature_name')} />
            <TextField label="Date signed" type="date" {...text('staff_signed_date')} />
          </FieldRow>

          <p className="text-xs text-muted-foreground">
            Typing a name records who signed the paper form and when. It is not an electronic
            signature — keep the signed copy in the client's files.
          </p>

          <AreaField label="Additional notes" {...text('additional_notes')} />

          <Separator />

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => persist(false)} disabled={saving}>
              {saving ? 'Saving…' : 'Save draft'}
            </Button>
            <Button onClick={() => persist(true)} disabled={saving}>
              {status === 'complete' ? 'Save and keep complete' : 'Complete the intake'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Completing marks the lifecycle’s intake step done, which unlocks the LoN and HSP.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientIntakeForm;
