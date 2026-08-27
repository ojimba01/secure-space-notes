import React, { useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, FileUp, FolderUp, Loader2, Upload } from 'lucide-react';
import { FORM_TYPES } from '@/lib/formSigning';
import {
  commitImport,
  expandFiles,
  fetchExistingHashes,
  fetchMatchClients,
  parseManifest,
  proposeMapping,
  type CommitResult,
  type Confidence,
  type ManifestRow,
  type MatchClient,
  type ProposedItem,
  type StagedFile,
} from '@/lib/bulkImport';

type Step = 'add' | 'review' | 'done';

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  conflict: 'Conflict',
};

const CONFIDENCE_CLASS: Record<Confidence, string> = {
  high: 'bg-green-100 text-green-800',
  medium: 'bg-amber-100 text-amber-900',
  low: 'bg-slate-100 text-slate-800',
  conflict: 'bg-red-100 text-red-800',
};

/** Per-row choices the reviewer can change before committing. */
interface RowState {
  clientId: string;
  formType: string;
  include: boolean;
  allowDuplicate: boolean;
}

/**
 * Admin/Superadmin bulk migration of historical client documents.
 * Files are staged in the browser, mapped deterministically, reviewed, and
 * only then written to secure storage and linked to clients.
 */
export const BulkDocumentImport: React.FC<{ onImported?: () => void }> = ({ onImported }) => {
  const { toast } = useToast();
  const profileId = useEffectiveProfileId();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('add');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [manifest, setManifest] = useState<ManifestRow[]>([]);
  const [manifestName, setManifestName] = useState<string | null>(null);
  const [clients, setClients] = useState<MatchClient[]>([]);
  const [items, setItems] = useState<ProposedItem[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [batchId, setBatchId] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

  const key = (item: ProposedItem) => `${item.file.path}::${item.file.hash}`;

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setBusy(true);
    setBusyLabel('Reading files...');
    try {
      const { staged: next, skipped: nextSkipped } = await expandFiles(Array.from(fileList));
      // Re-adding the same file twice in one session is a no-op.
      const seen = new Set(staged.map((f) => `${f.path}::${f.hash}`));
      const merged = [...staged, ...next.filter((f) => !seen.has(`${f.path}::${f.hash}`))];
      setStaged(merged);
      setSkipped((s) => [...s, ...nextSkipped]);
      if (!next.length && nextSkipped.length) {
        toast({
          title: 'Nothing was added',
          description: nextSkipped[0],
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({ title: 'Could not read the files', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const addManifest = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setBusyLabel('Reading the manifest...');
    try {
      const parsed = await parseManifest(file);
      setManifest(parsed);
      setManifestName(file.name);
      toast({
        title: 'Manifest loaded',
        description: `${parsed.length} row${parsed.length === 1 ? '' : 's'} with a source_file value.`,
      });
    } catch (err: any) {
      toast({
        title: 'Could not read the manifest',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  /** Stage 3+4: propose mappings for every file, then persist the batch. */
  const analyze = async () => {
    if (!profileId) return;
    setBusy(true);
    setBusyLabel('Matching files to clients...');
    try {
      const [clientList, hashes] = await Promise.all([fetchMatchClients(), fetchExistingHashes()]);
      setClients(clientList);

      const proposed: ProposedItem[] = [];
      for (const file of staged) {
        proposed.push(await proposeMapping(file, clientList, manifest, hashes));
      }

      const { data: batch, error: batchError } = await supabase
        .from('document_import_batches')
        .insert({
          created_by: profileId,
          status: 'in_review',
          manifest_filename: manifestName,
          total_files: proposed.length,
          review_count: proposed.filter((p) => p.confidence !== 'high').length,
          duplicate_count: proposed.filter((p) => p.duplicateOfFormId).length,
        })
        .select('id')
        .single();
      if (batchError) throw batchError;

      const { data: insertedItems, error: itemsError } = await supabase
        .from('document_import_items')
        .insert(
        proposed.map((p) => ({
          batch_id: batch.id,
          source_path: p.file.path,
          source_filename: p.file.name,
          file_hash: p.file.hash,
          file_size: p.file.size,
          proposed_client_id: p.proposedClientId,
          proposed_form_type: p.proposedFormType,
          proposed_mco: p.proposedMco,
          proposed_document_date: p.proposedDate,
          detected_member_id: p.detectedMemberId,
          confidence: p.confidence,
          issue_code: p.issue ? 'needs_review' : null,
          match_reason: p.matchReason,
          resolution_status: 'pending',
        })),
        )
        .select('id');
      if (itemsError) throw itemsError;

      // RETURNING preserves insertion order, so each proposal keeps the id of
      // its own row — needed because two folders can hold the same file.
      const withIds = proposed.map((p, i) => ({ ...p, itemId: insertedItems?.[i]?.id }));

      setBatchId(batch.id);
      setItems(withIds);
      setRows(
        Object.fromEntries(
          withIds.map((p) => [
            key(p),
            {
              clientId: p.proposedClientId ?? '',
              formType: p.proposedFormType ?? 'Other',
              // High-confidence rows are pre-selected so they can be bulk
              // accepted; everything weaker must be chosen deliberately.
              include: p.confidence === 'high' && !p.duplicateOfFormId,
              allowDuplicate: false,
            },
          ]),
        ),
      );
      setStep('review');
    } catch (err: any) {
      toast({
        title: 'Could not prepare the import',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const selected = useMemo(
    () =>
      items.filter((item) => {
        const row = rows[key(item)];
        return row?.include && row.clientId && item.confidence !== 'conflict';
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, rows],
  );

  const commit = async () => {
    if (!batchId || !profileId || !selected.length) return;
    setBusy(true);
    setBusyLabel('Importing...');
    try {
      const res = await commitImport(
        batchId,
        profileId,
        selected.map((item) => {
          const row = rows[key(item)];
          return {
            item,
            clientId: row.clientId,
            formType: row.formType,
            allowDuplicate: row.allowDuplicate,
          };
        }),
        (done, total) => setBusyLabel(`Importing ${done} of ${total}...`),
      );

      const { error: batchError } = await supabase
        .from('document_import_batches')
        .update({
          status: 'completed',
          imported_count: res.imported,
          duplicate_count: res.duplicates,
          failed_count: res.failed.length,
          review_count: items.length - res.imported - res.duplicates - res.failed.length,
        })
        .eq('id', batchId);
      if (batchError) {
        toast({
          title: 'Files imported, but the batch summary was not saved',
          description: batchError.message,
          variant: 'destructive',
        });
      }

      setResult(res);
      setStep('done');
      onImported?.();
      if (res.failed.length) {
        toast({
          title: `${res.failed.length} file${res.failed.length === 1 ? '' : 's'} failed to import`,
          description: res.failed[0].error,
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const reset = () => {
    setStep('add');
    setStaged([]);
    setSkipped([]);
    setManifest([]);
    setManifestName(null);
    setItems([]);
    setRows({});
    setBatchId(null);
    setResult(null);
  };

  const setRow = (item: ProposedItem, patch: Partial<RowState>) =>
    setRows((r) => ({ ...r, [key(item)]: { ...r[key(item)], ...patch } }));

  const clientLabel = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c ? `${c.last_name}, ${c.first_name}` : 'Select a client';
  };

  // ---------------------------------------------------------------- render

  if (step === 'done' && result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Import complete</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
            <Summary label="Imported" value={result.imported} />
            <Summary label="Skipped as duplicate" value={result.duplicates} />
            <Summary
              label="Left in review"
              value={items.length - result.imported - result.duplicates - result.failed.length}
            />
            <Summary label="Failed" value={result.failed.length} />
          </div>
          {result.failed.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1">
              <div className="text-xs font-medium">Files that could not be imported</div>
              {result.failed.map((f) => (
                <p key={f.name} className="text-xs">
                  {f.name} — {f.error}
                </p>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Imported files appear in each client's Forms &amp; Documents area, marked as a
            historical import. Original files were stored unchanged.
          </p>
          <Button onClick={reset}>Start another import</Button>
        </CardContent>
      </Card>
    );
  }

  if (step === 'review') {
    const conflicts = items.filter((i) => i.confidence === 'conflict').length;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Review proposed mappings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {items.length} file{items.length === 1 ? '' : 's'} · {selected.length} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setRows((r) => {
                  const next = { ...r };
                  for (const item of items) {
                    if (item.confidence === 'high' && item.proposedClientId && !item.duplicateOfFormId) {
                      next[key(item)] = { ...next[key(item)], include: true };
                    }
                  }
                  return next;
                })
              }
            >
              Select all high confidence
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setRows((r) =>
                  Object.fromEntries(
                    Object.entries(r).map(([k, v]) => [k, { ...v, include: false }]),
                  ),
                )
              }
            >
              Clear selection
            </Button>
          </div>

          {conflicts > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
              <span>
                {conflicts} file{conflicts === 1 ? ' has' : 's have'} conflicting identifiers and
                cannot be committed until the mapping is corrected.
              </span>
            </div>
          )}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium w-10" />
                  <th className="px-3 py-2 font-medium">File</th>
                  <th className="px-3 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 font-medium">Document type</th>
                  <th className="px-3 py-2 font-medium">Confidence</th>
                  <th className="px-3 py-2 font-medium">Issue</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const row = rows[key(item)];
                  const isDuplicate = !!item.duplicateOfFormId;
                  return (
                    <tr key={key(item)} className="border-t align-top">
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={row?.include ?? false}
                          disabled={item.confidence === 'conflict'}
                          onCheckedChange={(v) => setRow(item, { include: v === true })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="max-w-[220px] truncate" title={item.file.path}>
                          {item.file.name}
                        </div>
                        <div className="text-xs text-muted-foreground max-w-[220px] truncate">
                          {item.file.path}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={row?.clientId || undefined}
                          onValueChange={(v) => setRow(item, { clientId: v })}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Select a client">
                              {row?.clientId ? clientLabel(row.clientId) : undefined}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {clients.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.last_name}, {c.first_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {item.detectedMemberId && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Detected member ID: {item.detectedMemberId}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={row?.formType}
                          onValueChange={(v) => setRow(item, { formType: v })}
                        >
                          <SelectTrigger className="w-[190px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FORM_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {item.proposedDate && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Document date: {item.proposedDate}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="secondary" className={CONFIDENCE_CLASS[item.confidence]}>
                          {CONFIDENCE_LABEL[item.confidence]}
                        </Badge>
                        <div className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                          {item.matchReason}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {isDuplicate ? (
                          <div className="space-y-1">
                            <div className="text-amber-700">Duplicate — already imported</div>
                            <label className="flex items-center gap-1.5">
                              <Checkbox
                                checked={row?.allowDuplicate ?? false}
                                onCheckedChange={(v) =>
                                  setRow(item, { allowDuplicate: v === true })
                                }
                              />
                              <span>Import anyway</span>
                            </label>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{item.issue ?? '—'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={commit} disabled={busy || !selected.length}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {busyLabel}
                </>
              ) : (
                `Import ${selected.length} file${selected.length === 1 ? '' : 's'}`
              )}
            </Button>
            <Button variant="outline" onClick={reset} disabled={busy}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Bulk document import</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Add historical client documents in bulk — a ZIP of client folders, a whole folder, or
          individual files. Nothing is stored until you review and confirm the mappings.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}>
            <FileUp className="h-4 w-4 mr-2" />
            Add files or ZIP
          </Button>
          <Button variant="outline" onClick={() => folderInput.current?.click()} disabled={busy}>
            <FolderUp className="h-4 w-4 mr-2" />
            Add a folder
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={folderInput}
            type="file"
            multiple
            className="hidden"
            // Directory upload is Chromium/WebKit only; the file picker above
            // remains the portable route.
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="manifest">Optional mapping manifest (.xlsx or .csv)</Label>
          <Input
            id="manifest"
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={busy}
            onChange={(e) => addManifest(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">
            A manifest makes matching deterministic. Recommended columns: source_file (required),
            first_name, last_name, date_of_birth, member_id, mco, form_type, form_date,
            external_status, notes.{' '}
            <a href="/import-manifest-template.csv" download className="underline">
              Download a template
            </a>
            .{manifestName && ` — loaded ${manifestName} (${manifest.length} rows)`}
          </p>
        </div>

        {staged.length > 0 && (
          <div className="rounded-md border p-3 space-y-1">
            <div className="text-sm font-medium">
              {staged.length} file{staged.length === 1 ? '' : 's'} staged
            </div>
            <div className="max-h-40 overflow-y-auto text-xs text-muted-foreground space-y-0.5">
              {staged.slice(0, 100).map((f) => (
                <div key={`${f.path}::${f.hash}`} className="truncate">
                  {f.path}
                </div>
              ))}
              {staged.length > 100 && <div>…and {staged.length - 100} more</div>}
            </div>
          </div>
        )}

        {skipped.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-1">
            <div className="text-xs font-medium">
              {skipped.length} item{skipped.length === 1 ? '' : 's'} skipped
            </div>
            {skipped.slice(0, 10).map((s) => (
              <p key={s} className="text-xs">
                {s}
              </p>
            ))}
          </div>
        )}

        <Button onClick={analyze} disabled={busy || !staged.length || !profileId}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {busyLabel}
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Analyze and review
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

const Summary: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="rounded-md border p-3">
    <div className="text-2xl font-semibold">{value}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
);
