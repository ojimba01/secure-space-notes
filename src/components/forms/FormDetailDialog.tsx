import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  EXTERNAL_STATUS_CLASS,
  EXTERNAL_STATUS_LABEL,
  FORM_STATUS_CLASS,
  FORM_STATUS_LABEL,
  WORKFLOW_PURPOSE_LABEL,
  goesToMco,
} from '@/lib/formSigning';
import { Download, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { FormRow } from '@/components/forms/FormsHub';
import { FormVersionHistory } from '@/components/forms/FormVersionHistory';
import { FormSyncPanel } from '@/components/forms/FormSyncPanel';
import { recordFormVersion } from '@/lib/formVersions';

interface FormDetailDialogProps {
  form: FormRow;
  isAdmin: boolean;
  approverName?: string;
  onClose: () => void;
  onChanged: () => void;
  onDownload: (form: FormRow) => void;
  onPreview: (form: FormRow) => void;
  /** Kept for callers; editing starts from the forms list. */
  onEdit?: (form: FormRow) => void;
}


export const FormDetailDialog: React.FC<FormDetailDialogProps> = ({
  form,
  isAdmin,
  onClose,
  onChanged,
  onDownload,
  onPreview,
}) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const clientName = form.clients
    ? `${form.clients.first_name} ${form.clients.last_name}`
    : 'Unknown client';

  /** External/MCO status is a separate track from our internal sign-off. */
  const setExternal = async (
    external_status: string,
    stamp: 'sent' | 'response' | null,
    successTitle: string,
  ) => {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const payload: Record<string, unknown> = { external_status };
      if (stamp === 'sent') payload.sent_to_mco_at = now;
      if (stamp === 'response') payload.mco_response_at = now;

      const { error } = await supabase.from('client_forms').update(payload).eq('id', form.id);
      if (error) throw error;

      // Snapshot exactly which file went to the MCO so it stays retrievable
      // even after later corrections repoint the form.
      if (stamp === 'sent' && form.file_path) {
        try {
          await recordFormVersion({
            clientFormId: form.id,
            filePath: form.file_path,
            versionType: 'sent_to_mco',
          });
        } catch (versionErr: any) {
          toast({
            title: 'Status saved, but the sent version was not snapshotted',
            description: versionErr.message,
            variant: 'destructive',
          });
        }
      }

      toast({ title: successTitle, description: `${clientName} — ${form.form_type}` });
      onChanged();
      onClose();
    } catch (err: any) {
      toast({
        title: 'Could not update the MCO status',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const externalStatus = form.external_status ?? 'not_sent';
  // A form is finished once it is completed; there is no sign-off after that.
  const completed = form.status !== 'draft';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.form_type}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-muted-foreground text-xs">Client</div>
              <div>{clientName}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Form type</div>
              <div>{form.form_type}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Filled out by</div>
              <div>
                {form.profiles
                  ? `${form.profiles.first_name ?? ''} ${form.profiles.last_name ?? ''}`.trim()
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Filled out</div>
              <div>{new Date(form.created_at).toLocaleString()}</div>
            </div>
            {form.workflow_purpose && (
              <div>
                <div className="text-muted-foreground text-xs">Purpose</div>
                <div>
                  {WORKFLOW_PURPOSE_LABEL[form.workflow_purpose] ?? form.workflow_purpose}
                </div>
              </div>
            )}
            {form.due_date && (
              <div>
                <div className="text-muted-foreground text-xs">Due</div>
                <div>{new Date(`${form.due_date}T00:00:00`).toLocaleDateString()}</div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 rounded-md border p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Status</div>
            <Badge variant="secondary" className={FORM_STATUS_CLASS[form.status] ?? ''}>
              {FORM_STATUS_LABEL[form.status] ?? form.status}
            </Badge>
          </div>

          {goesToMco(form.form_type) ? (
            <>
            {/* External / MCO status — tracked entirely separately. */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  MCO / external status
                </div>
                <Badge variant="secondary" className={EXTERNAL_STATUS_CLASS[externalStatus] ?? ''}>
                  {EXTERNAL_STATUS_LABEL[externalStatus] ?? externalStatus}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground">Sent to MCO</div>
                  <div>
                    {form.sent_to_mco_at ? new Date(form.sent_to_mco_at).toLocaleString() : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">MCO responded</div>
                  <div>
                    {form.mco_response_at ? new Date(form.mco_response_at).toLocaleString() : '—'}
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !completed}
                    onClick={() => setExternal('sent_to_mco', 'sent', 'Marked as sent to the MCO')}
                  >
                    <Send className="h-4 w-4 mr-1" />
                    Mark sent to MCO
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setExternal('awaiting_response', null, 'Marked awaiting response')}
                  >
                    Awaiting response
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setExternal('accepted', 'response', 'MCO response recorded')}
                  >
                    <ThumbsUp className="h-4 w-4 mr-1" />
                    Accepted
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setExternal('denied', 'response', 'MCO denial recorded')}
                  >
                    <ThumbsDown className="h-4 w-4 mr-1" />
                    Denied
                  </Button>
                </div>
              )}
              {isAdmin && !completed && (
                <p className="text-xs text-muted-foreground">
                  This form is still a draft. It can be marked sent once it is completed.
                </p>
              )}
            </div>
            </>
          ) : (
            <div className="rounded-md border p-3 text-xs text-muted-foreground">
              This form is not sent to an MCO. Only the IAT and the HSP are.
            </div>
          )}

          {isAdmin && <FormSyncPanel form={form} onApplied={onChanged} />}

          <FormVersionHistory
            clientFormId={form.id}
            formType={form.form_type}
            clientFirstName={form.clients?.first_name}
            clientLastName={form.clients?.last_name}
          />

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onPreview(form)}>
              Preview PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => onDownload(form)}>
              <Download className="h-4 w-4 mr-1" />
              Download
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

