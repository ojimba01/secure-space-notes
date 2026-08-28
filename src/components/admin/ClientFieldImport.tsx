// Fill client records from the agency's own manifest.
//
// The workbook's `CLIENT FIELDS from docs` tab holds one row per client
// folder, carrying what the agency read out of that client's paperwork. Two
// of those columns are things the app has never held at all: not one of its
// 176 clients has a Medicaid ID or a diagnosis code, while the documents have
// 186 and 134 of them.
//
// Nothing is written until the whole plan has been looked at. The list below
// is the point of this screen: a value read off a scan is only as good as the
// scan, and the person who can judge that is the one reading it.
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UploadCloud, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  parseClientFields,
  planClientFieldImport,
  applyClientFieldImport,
  type ImportPlan,
  type ClientPlan,
} from '@/lib/clientFieldImport';

const MATCHED_BY_LABEL: Record<string, string> = {
  medicaid_id: 'Medicaid ID',
  member_id: 'Member ID',
  name: 'Name',
};

/** How many clients to list before offering the rest. */
const PREVIEW = 25;

const ChangeRow: React.FC<{ plan: ClientPlan }> = ({ plan }) => (
  <div className="rounded-md border p-3 space-y-1.5">
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium">{plan.recordName ?? plan.documentName}</span>
      {plan.matchedBy && (
        <Badge variant="secondary" className="font-normal">
          matched on {MATCHED_BY_LABEL[plan.matchedBy] ?? plan.matchedBy}
        </Badge>
      )}
    </div>
    <ul className="text-sm space-y-0.5">
      {plan.changes.map((c) => (
        <li key={c.column} className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-muted-foreground">{c.label}</span>
          {c.kind === 'override' ? (
            <>
              <span className="line-through text-muted-foreground">{c.from || 'empty'}</span>
              <span aria-hidden>→</span>
              <span className="font-medium">{c.to}</span>
              <Badge variant="secondary" className="bg-amber-100 text-amber-900 font-normal">
                replaces what is there
              </Badge>
            </>
          ) : (
            <>
              <span className="font-medium">{c.to}</span>
              <span className="text-xs text-muted-foreground">(was empty)</span>
            </>
          )}
        </li>
      ))}
    </ul>
  </div>
);

export const ClientFieldImport: React.FC = () => {
  const { toast } = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [reading, setReading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);

  const read = async (file: File | null) => {
    if (!file) return;
    setReading(true);
    setPlan(null);
    setApplied(null);
    setShowAll(false);
    try {
      const { rows, sheetName } = await parseClientFields(file);
      if (rows.length === 0) {
        toast({
          title: 'No client rows found in that workbook',
          description:
            'This reads the "CLIENT FIELDS from docs" tab. The workbook uploaded has no tab by that name, or it is empty.',
          variant: 'destructive',
        });
        return;
      }
      const result = await planClientFieldImport(rows);
      setPlan({ ...result, sheetName });
      setFileName(file.name);
    } catch (e) {
      toast({
        title: 'That workbook could not be read',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setReading(false);
    }
  };

  const apply = async () => {
    if (!plan) return;
    setApplying(true);
    try {
      const result = await applyClientFieldImport(withChanges, fileName ?? 'manifest');
      setApplied(
        `${result.fieldsFilled} filled and ${result.fieldsOverridden} replaced across ${result.clientsChanged} clients.`,
      );
      toast({
        title: 'Client records updated',
        description: result.failed.length
          ? `${result.failed.length} could not be saved.`
          : 'Every change was saved.',
        variant: result.failed.length ? 'destructive' : undefined,
      });
      setPlan(null);
    } catch (e) {
      toast({
        title: 'The changes could not be saved',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  };

  const withChanges = (plan?.matched ?? []).filter((p) => p.changes.length > 0);
  const fills = withChanges.reduce((n, p) => n + p.changes.filter((c) => c.kind === 'fill').length, 0);
  const overrides = withChanges.reduce(
    (n, p) => n + p.changes.filter((c) => c.kind === 'override').length,
    0,
  );
  const shown = showAll ? withChanges : withChanges.slice(0, PREVIEW);
  const disagreeing = (plan?.matched ?? []).filter((p) => p.disagreements.length > 0);
  const disagreementCount = disagreeing.reduce((n, p) => n + p.disagreements.length, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5" /> Fill client records from the manifest
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Upload the document manifest. This reads its “CLIENT FIELDS from docs” tab and fills in
            what the client records are missing — date of birth, Medicaid ID, MCO member ID,
            diagnosis and address. Nothing is written until the list below has been looked at and
            the changes are applied.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="client-fields-file">Manifest workbook</Label>
            <Input
              id="client-fields-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={reading || applying}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = '';
                read(f);
              }}
            />
          </div>
          {reading && <p className="text-sm text-muted-foreground">Reading the workbook.</p>}
          {applied && <p className="text-sm">{applied}</p>}
        </CardContent>
      </Card>

      {plan && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {withChanges.length} client{withChanges.length === 1 ? '' : 's'} would change
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {plan.totalRows} rows read from “{plan.sheetName}”. {plan.matched.length} matched a
              client in the app, {plan.unmatched.length} matched none.{' '}
              <span className="font-medium">{fills}</span> empty field
              {fills === 1 ? '' : 's'} would be filled and{' '}
              <span className="font-medium">{overrides}</span> would be replaced.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {overrides > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
                <span>
                  {overrides} value{overrides === 1 ? '' : 's'} already on a client record would be
                  replaced by what the documents say. What each one replaces is kept, so a wrong
                  correction can be found afterwards.
                </span>
              </div>
            )}

            {disagreementCount > 0 && (
              <details className="rounded-md border p-3 text-sm">
                <summary className="cursor-pointer">
                  {disagreementCount} value{disagreementCount === 1 ? '' : 's'} in the documents
                  disagree with {disagreeing.length} client
                  {disagreeing.length === 1 ? '' : 's'}. Nothing is changed for these.
                </summary>
                <div className="pt-2 space-y-2">
                  <p className="text-muted-foreground">
                    The record already holds a value and it is different. A document does not
                    overrule somebody who typed one in, so these are listed rather than written.
                    Correct whichever is wrong on the client record.
                  </p>
                  {disagreeing.slice(0, 30).map((p) => (
                    <div key={p.clientId} className="rounded-md border p-2">
                      <div className="font-medium">{p.recordName ?? p.documentName}</div>
                      <ul className="text-sm">
                        {p.disagreements.map((d) => (
                          <li key={d.label} className="flex flex-wrap items-baseline gap-1.5">
                            <span className="text-muted-foreground">{d.label}</span>
                            <span>record says <span className="font-medium">{d.record}</span></span>
                            <span className="text-muted-foreground">·</span>
                            <span>documents say <span className="font-medium">{d.document}</span></span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {plan.unmatched.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {plan.unmatched.length} row{plan.unmatched.length === 1 ? '' : 's'} in the manifest
                match no client in the app. Nothing is created from them — a client is added by a
                person, not by a spreadsheet.
              </p>
            )}

            {withChanges.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Every matched client already holds what the documents say. There is nothing to
                write.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  {shown.map((p) => (
                    <ChangeRow key={p.clientId} plan={p} />
                  ))}
                </div>
                {withChanges.length > PREVIEW && (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setShowAll((v) => !v)}>
                    {showAll ? 'Show fewer' : `Show the remaining ${withChanges.length - PREVIEW}`}
                  </Button>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button onClick={apply} disabled={applying}>
                    {applying ? 'Saving' : `Apply to ${withChanges.length} client${withChanges.length === 1 ? '' : 's'}`}
                  </Button>
                  <Button variant="outline" onClick={() => setPlan(null)} disabled={applying}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
