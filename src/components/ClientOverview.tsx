// The client record: the same rows to read and to edit.
//
// Editing used to swap this section for a differently-shaped form, so the page
// you were reading was replaced by a page you were typing in and every field
// moved. Now the row stays exactly where it is and its value becomes the
// control for that value — a box for a name, a date picker for a date, a list
// for a county. Nothing reflows, so nothing has to be found twice.
import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useViewAs } from '@/components/ViewAsProvider';
import { VisitAvailabilitySection } from '@/components/VisitAvailability';
import { formatDay } from '@/lib/dates';
import { MCO_OPTIONS, addDays, hspDueDateFor } from '@/lib/billing';
import { NJ_COUNTIES } from '@/lib/clientIntake';
import { saveClientEdit, type ClientEditValues } from '@/lib/saveClientEdit';
import {
  editAuthorizationDates,
  editAuthorizationNumbers,
} from '@/lib/clientAuthorizationDates';

const REASON_CLOSED_OPTIONS = [
  'Housed', 'Moved', 'Lost Contact', 'Deceased',
  'Transferred to Other Agency', 'Medicaid Expired', 'Other',
] as const;

export interface OverviewClient {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  address?: string;
  member_id?: string;
  insurance?: string;
  mco_housing_manager?: string | null;
  level_of_need?: string;
  lon_score?: number | null;
  county?: string;
  status: string;
  intake_date: string;
  date_of_birth?: string;
  iat_date?: string | null;
  auth_30_start?: string | null;
  auth_30_end?: string | null;
  auth_150_start?: string | null;
  auth_150_end?: string | null;
  auth_180_start?: string | null;
  auth_180_end?: string | null;
  hsp_150_date?: string | null;
  hsp_180_date?: string | null;
  auth_30_number?: string | null;
  auth_150_number?: string | null;
  auth_180_number?: string | null;
  closed_date?: string | null;
  reason_closed?: string | null;
  notes?: string;
}

/**
 * One field: its name directly above its value.
 *
 * This was a two-column table — label on the left, value somewhere off to the
 * right, a rule under each pair. Reading it meant tracking across a gap to
 * find which value belonged to which label, and eight of them stacked read as
 * a spreadsheet rather than a record. Sitting the label on top removes the
 * journey, and lets three fields share a row instead of one.
 */
const Row: React.FC<{
  label: string;
  children?: React.ReactNode;
  hint?: string;
  /** Addresses and notes need the room; a phone number does not. */
  wide?: boolean;
}> = ({ label, children, hint, wide }) => (
  <div className={wide ? 'sm:col-span-2 lg:col-span-3' : ''}>
    <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </dt>
    <dd className="mt-0.5 min-w-0 text-sm font-medium">
      {children || <span className="font-normal text-muted-foreground/40">—</span>}
      {hint && <p className="mt-0.5 text-xs font-normal text-muted-foreground">{hint}</p>}
    </dd>
  </div>
);

const Block: React.FC<{ title: string; children: React.ReactNode; wide?: boolean }> = ({
  title, children, wide = false,
}) => (
  <Card className={wide ? 'lg:col-span-2' : ''}>
    <CardContent className="pt-5">
      {/* The heading carries a rule so a block reads as one thing; the fields
          inside it do not need one each. */}
      <h3 className="mb-3 border-b pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <dl
        className={`grid gap-x-6 gap-y-4 sm:grid-cols-2 ${wide ? 'lg:grid-cols-3' : ''}`}
      >
        {children}
      </dl>
    </CardContent>
  </Card>
);

/** An end date is worked out from its start; it is shown, never typed. */
const Derived: React.FC<{ start?: string | null; days: number }> = ({ start, days }) =>
  start ? (
    <span>
      {formatDay(addDays(start, days - 1))}{' '}
      <span className="text-xs text-muted-foreground">(from the start date)</span>
    </span>
  ) : null;

type Values = ClientEditValues;

const initialValues = (c: OverviewClient): Values => ({
  first_name: c.first_name ?? '',
  last_name: c.last_name ?? '',
  email: c.email ?? '',
  phone: c.phone ?? '',
  address: c.address ?? '',
  member_id: c.member_id ?? '',
  insurance: c.insurance ?? '',
  level_of_need: c.level_of_need ?? '',
  lon_score: c.lon_score === null || c.lon_score === undefined ? '' : String(c.lon_score),
  county: c.county ?? '',
  mco_housing_manager: c.mco_housing_manager ?? '',
  date_of_birth: c.date_of_birth ?? '',
  intake_date: c.intake_date ?? '',
  ...editAuthorizationDates(c),
  ...editAuthorizationNumbers(c),
  closed_date: c.closed_date ?? '',
  reason_closed: c.reason_closed ?? '',
  status: (c.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
  notes: c.notes ?? '',
});

export const ClientOverview: React.FC<{
  client: OverviewClient;
  editing?: boolean;
  onDone?: () => void;
  onSaved?: () => void | Promise<void>;
  caseManagerName?: string | null;
  showCaseManager?: boolean;
}> = ({ client, editing = false, onDone, onSaved, caseManagerName, showCaseManager }) => {
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();
  const { guardWrite } = useViewAs();
  const [v, setV] = useState<Values>(() => initialValues(client));
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Opening the editor starts from what is on the record now, not from
  // whatever was typed and abandoned last time.
  useEffect(() => {
    if (editing) setV(initialValues(client));
  }, [editing, client]);

  const set = (k: keyof Values) => (value: string) => setV((p) => ({ ...p, [k]: value }));

  const isUnited = (v.insurance ?? '').toLowerCase().includes('united');
  const readUnited = (client.insurance ?? '').toLowerCase().includes('united');

  // The 180-day date cannot be set before the 150-day period is due, and the
  // 150-day before the initial 30 is. The same rule the old form enforced.
  const today = new Date().toISOString().slice(0, 10);
  const iatDue = v.iat_date ? hspDueDateFor(v.iat_date) : null;
  const hsp150Due = v.hsp_150_date ? addDays(v.hsp_150_date, 149) : null;
  const lock150 = !iatDue || today < iatDue;
  const lock180 = !hsp150Due || today < hsp150Due;

  const save = async () => {
    if (guardWrite()) return onDone?.();
    setSaving(true);
    try {
      await saveClientEdit(client, v, retrying);
      setRetrying(false);
      toast({ title: 'Client updated' });
      await onSaved?.();
      onDone?.();
    } catch (e) {
      setRetrying(true);
      toast({
        title: 'Could not update the client',
        description: `${e instanceof Error ? e.message : String(e)} Your changes may already be saved. Press Update again to retry.`,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  /** A value, or the control that edits it, in the same place either way. */
  const text = (k: keyof Values, shown: React.ReactNode, disabled = false) =>
    editing ? (
      <Input
        value={(v[k] as string) ?? ''}
        onChange={(e) => set(k)(e.target.value)}
        disabled={disabled}
        className="h-8"
      />
    ) : (
      shown
    );

  const date = (k: keyof Values, disabled = false) =>
    editing ? (
      <Input
        type="date"
        value={(v[k] as string) ?? ''}
        onChange={(e) => set(k)(e.target.value)}
        disabled={disabled}
        className="h-8"
      />
    ) : (
      (v[k] as string) && formatDay(v[k] as string)
    );

  const choice = (k: keyof Values, options: readonly string[], shown: React.ReactNode) =>
    editing ? (
      <Select value={(v[k] as string) || ''} onValueChange={set(k)}>
        <SelectTrigger className="h-8">
          <SelectValue placeholder="Not set" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      shown
    );

  return (
    <div className="space-y-4">
      {editing && (
        <div className="sticky top-0 z-10 flex flex-wrap justify-end gap-2 border-b bg-background pb-3">
          <Button variant="outline" onClick={onDone} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Updating…' : 'Update client'}
          </Button>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Block title="Contact">
          <Row label="First name" hint={editing && !isAdmin ? 'Only admins can edit names' : undefined}>
            {text('first_name', client.first_name, !isAdmin)}
          </Row>
          <Row label="Last name">{text('last_name', client.last_name, !isAdmin)}</Row>
          <Row label="Member ID">{text('member_id', client.member_id)}</Row>
          <Row label="Date of birth">{date('date_of_birth')}</Row>
          <Row label="Email">{text('email', client.email)}</Row>
          <Row label="Phone">{text('phone', client.phone)}</Row>
          <Row label="Address" wide>{text('address', client.address)}</Row>
          <Row label="County">{choice('county', NJ_COUNTIES, client.county)}</Row>
        </Block>

        <Block title="Case">
          <Row label="Status">
            {choice('status', ['active', 'inactive'],
              <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                {client.status}
              </Badge>)}
          </Row>
          <Row label="Intake date">{date('intake_date')}</Row>
          <Row label="Insurance">{choice('insurance', MCO_OPTIONS, client.insurance)}</Row>
          {(editing ? isUnited : readUnited) && (
            <Row label="MCO housing manager">
              {text('mco_housing_manager', client.mco_housing_manager)}
            </Row>
          )}
          <Row label="Level of need">
            {choice('level_of_need', ['Low Level', 'High Level'], client.level_of_need)}
          </Row>
          <Row label="LoN score">
            {text('lon_score', client.lon_score ?? null)}
          </Row>
          {showCaseManager && (
            // Reassignment is its own act, with its own history. A box here
            // would either lie or go around it.
            <Row label="Case manager" hint={editing ? 'Changed with Reassign' : undefined}>
              {caseManagerName || <span className="text-muted-foreground">Unassigned</span>}
            </Row>
          )}
        </Block>

        <Block title="Authorizations" wide>
          <Row label="30-day start">{date('iat_date')}</Row>
          <Row label="30-day end"><Derived start={v.iat_date} days={30} /></Row>
          <Row label="30-day auth #">{text('auth_30_number', client.auth_30_number)}</Row>

          <Row label="150-day start" hint={editing && lock150 ? 'Unlocks once the 30-day period is due' : undefined}>
            {date('hsp_150_date', lock150)}
          </Row>
          <Row label="150-day end"><Derived start={v.hsp_150_date} days={150} /></Row>
          <Row label="150-day auth #">{text('auth_150_number', client.auth_150_number)}</Row>

          <Row label="180-day start" hint={editing && lock180 ? 'Unlocks once the 150-day period is due' : undefined}>
            {date('hsp_180_date', lock180)}
          </Row>
          <Row label="180-day end"><Derived start={v.hsp_180_date} days={180} /></Row>
          <Row label="180-day auth #">{text('auth_180_number', client.auth_180_number)}</Row>
        </Block>

        {(editing || client.closed_date || client.reason_closed) && (
          <Block title="Closure">
            <Row label="Closed date">{date('closed_date')}</Row>
            <Row label="Reason closed">
              {choice('reason_closed', REASON_CLOSED_OPTIONS, client.reason_closed)}
            </Row>
          </Block>
        )}

        {/* Reachable only from inside the old edit dialog until now, so it
            went where the dialog went. It is a repeating list rather than a
            field, which is why it sits under the rows and not among them. */}
        {editing && (
          <Card className="lg:col-span-2">
            <CardContent className="pt-5">
              <h3 className="mb-3 border-b pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Visit availability
              </h3>
              <VisitAvailabilitySection clientId={client.id} />
            </CardContent>
          </Card>
        )}

        {(editing || client.notes) && (
          <Card className="lg:col-span-2">
            <CardContent className="pt-5">
              <h3 className="mb-3 border-b pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Notes
              </h3>
              {editing ? (
                <Textarea
                  rows={3}
                  value={v.notes ?? ''}
                  onChange={(e) => set('notes')(e.target.value)}
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm">{client.notes}</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ClientOverview;
