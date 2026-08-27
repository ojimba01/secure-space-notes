import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Batch {
  id: string;
  created_at: string;
  status: string;
  manifest_filename: string | null;
  total_files: number;
  imported_count: number;
  review_count: number;
  duplicate_count: number;
  failed_count: number;
  profiles?: { first_name: string | null; last_name: string | null } | null;
}

interface Item {
  id: string;
  source_filename: string;
  source_path: string | null;
  confidence: string;
  match_reason: string | null;
  resolution_status: string;
  resolved_at: string | null;
  final_form_type: string | null;
  clients?: { first_name: string; last_name: string } | null;
  profiles?: { first_name: string | null; last_name: string | null } | null;
}

const RESOLUTION_LABEL: Record<string, string> = {
  pending: 'Left in review',
  accepted: 'Accepted',
  imported: 'Imported',
  skipped_duplicate: 'Skipped — duplicate',
  skipped: 'Skipped',
  failed: 'Failed',
};

const RESOLUTION_CLASS: Record<string, string> = {
  imported: 'bg-green-100 text-green-800',
  skipped_duplicate: 'bg-amber-100 text-amber-900',
  failed: 'bg-red-100 text-red-800',
};

/** Audit trail of every bulk migration: what was proposed, and who confirmed it. */
export const ImportHistory: React.FC<{ refreshKey?: number }> = ({ refreshKey = 0 }) => {
  const { toast } = useToast();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, Item[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('document_import_batches')
        .select('*, profiles:created_by (first_name, last_name)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setBatches((data as unknown as Batch[]) ?? []);
    } catch (err: any) {
      toast({
        title: 'Could not load import history',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const toggle = async (batchId: string) => {
    if (expanded === batchId) {
      setExpanded(null);
      return;
    }
    setExpanded(batchId);
    if (items[batchId]) return;
    try {
      const { data, error } = await supabase
        .from('document_import_items')
        .select(
          '*, clients:final_client_id (first_name, last_name), profiles:resolved_by (first_name, last_name)',
        )
        .eq('batch_id', batchId)
        .order('source_filename');
      if (error) throw error;
      setItems((prev) => ({ ...prev, [batchId]: (data as unknown as Item[]) ?? [] }));
    } catch (err: any) {
      toast({
        title: 'Could not load the batch details',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Import history</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading history...</p>
        ) : batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bulk imports have been run yet.</p>
        ) : (
          batches.map((batch) => (
            <div key={batch.id} className="rounded-md border">
              <button
                onClick={() => toggle(batch.id)}
                className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-accent/50"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {expanded === batch.id ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm">
                      {new Date(batch.created_at).toLocaleString()}
                      {batch.profiles && (
                        <span className="text-muted-foreground">
                          {' '}
                          — {`${batch.profiles.first_name ?? ''} ${batch.profiles.last_name ?? ''}`.trim()}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {batch.total_files} file{batch.total_files === 1 ? '' : 's'} ·{' '}
                      {batch.imported_count} imported · {batch.duplicate_count} duplicate ·{' '}
                      {batch.failed_count} failed
                      {batch.manifest_filename ? ` · manifest ${batch.manifest_filename}` : ''}
                    </div>
                  </div>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {batch.status}
                </Badge>
              </button>

              {expanded === batch.id && (
                <div className="border-t divide-y">
                  {(items[batch.id] ?? []).map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 p-2.5 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="truncate max-w-[320px]">{item.source_path ?? item.source_filename}</div>
                        <div className="text-muted-foreground">
                          {item.match_reason ?? '—'}
                          {item.clients &&
                            ` → ${item.clients.last_name}, ${item.clients.first_name}`}
                          {item.final_form_type ? ` · ${item.final_form_type}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.profiles && (
                          <span className="text-muted-foreground">
                            confirmed by{' '}
                            {`${item.profiles.first_name ?? ''} ${item.profiles.last_name ?? ''}`.trim()}
                            {item.resolved_at
                              ? ` on ${new Date(item.resolved_at).toLocaleDateString()}`
                              : ''}
                          </span>
                        )}
                        <Badge
                          variant="secondary"
                          className={RESOLUTION_CLASS[item.resolution_status] ?? ''}
                        >
                          {RESOLUTION_LABEL[item.resolution_status] ?? item.resolution_status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {(items[batch.id]?.length ?? 0) === 0 && (
                    <p className="p-3 text-xs text-muted-foreground">No items in this batch.</p>
                  )}
                </div>
              )}
            </div>
          ))
        )}
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </CardContent>
    </Card>
  );
};
