// The client record, read-only, in the same blocks the edit form uses.
//
// It used to be ten values floating in a three-column grid with nothing
// anchoring them — a lot of white paper and no sense that any of it was a
// field. Each one is a row now: label in a fixed column, value beside it,
// a line between. It reads as a record because it is shaped like one.
//
// It shows everything the edit form edits, because the edit form now opens in
// this exact place. Anything here that is missing there is a field somebody
// would look for and never find.
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDay } from '@/lib/dates';

interface Client {
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
  hsp_150_date?: string | null;
  hsp_180_date?: string | null;
  auth_30_number?: string | null;
  auth_150_number?: string | null;
  auth_180_number?: string | null;
  closed_date?: string | null;
  reason_closed?: string | null;
  notes?: string;
}

/** An empty field still holds its place: a blank row says the record has a gap. */
const Row: React.FC<{ label: string; children?: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-[11rem_1fr] gap-4 border-b py-2 last:border-b-0">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className="text-sm">{children || <span className="text-muted-foreground/50">—</span>}</dd>
  </div>
);

const Block: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Card>
    <CardContent className="pt-5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <dl>{children}</dl>
    </CardContent>
  </Card>
);

export const ClientOverview: React.FC<{
  client: Client;
  /** Read-only: reassignment is its own act, with its own history. */
  caseManagerName?: string | null;
  showCaseManager?: boolean;
}> = ({ client, caseManagerName, showCaseManager }) => {
  const isUnited = (client.insurance ?? '').toLowerCase().includes('united');

  return (
    <div className="space-y-4">
      <Block title="Contact">
        <Row label="Full name">
          {`${client.first_name} ${client.last_name}`.trim()}
        </Row>
        <Row label="Member ID">{client.member_id}</Row>
        <Row label="Date of birth">
          {client.date_of_birth && formatDay(client.date_of_birth)}
        </Row>
        <Row label="Email">{client.email}</Row>
        <Row label="Phone">{client.phone}</Row>
        <Row label="Address">{client.address}</Row>
        <Row label="County">{client.county}</Row>
      </Block>

      <Block title="Case">
        <Row label="Status">
          <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
            {client.status}
          </Badge>
        </Row>
        <Row label="Intake date">{client.intake_date && formatDay(client.intake_date)}</Row>
        <Row label="Insurance">{client.insurance}</Row>
        {/* United is the only MCO that assigns one, so the row appears only
            when it can hold something. */}
        {isUnited && <Row label="MCO housing manager">{client.mco_housing_manager}</Row>}
        <Row label="Level of need">{client.level_of_need}</Row>
        <Row label="LoN score">
          {client.lon_score === null || client.lon_score === undefined ? null : client.lon_score}
        </Row>
        {showCaseManager && (
          <Row label="Case manager">
            {caseManagerName || <span className="text-muted-foreground">Unassigned</span>}
          </Row>
        )}
      </Block>

      <Block title="Authorizations">
        <Row label="IAT / 30-day start">{client.iat_date && formatDay(client.iat_date)}</Row>
        <Row label="30-day number">{client.auth_30_number}</Row>
        <Row label="HSP 150-day start">
          {client.hsp_150_date && formatDay(client.hsp_150_date)}
        </Row>
        <Row label="150-day number">{client.auth_150_number}</Row>
        <Row label="HSP 180-day start">
          {client.hsp_180_date && formatDay(client.hsp_180_date)}
        </Row>
        <Row label="180-day number">{client.auth_180_number}</Row>
      </Block>

      {/* Two permanently empty rows on every open case is what this block
          would be, so it waits until there is something to say. */}
      {(client.closed_date || client.reason_closed) && (
        <Block title="Closure">
          <Row label="Closed date">{client.closed_date && formatDay(client.closed_date)}</Row>
          <Row label="Reason closed">{client.reason_closed}</Row>
        </Block>
      )}

      {client.notes && (
        <Block title="Notes">
          <p className="whitespace-pre-wrap py-1 text-sm">{client.notes}</p>
        </Block>
      )}
    </div>
  );
};

export default ClientOverview;
