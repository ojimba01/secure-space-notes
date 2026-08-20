import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { stampApproval, FORM_STATUS_LABEL } from '@/lib/formSigning';
import { Check, Download, RotateCcw } from 'lucide-react';
import type { FormRow } from '@/components/forms/FormsHub';
import { FormDataSummary } from '@/components/forms/FillFormDialog';

interface FormDetailDialogProps {
  form: FormRow;
  isAdmin: boolean;
  approverName: string;
  onClose: () => void;
  onChanged: () => void;
  onDownload: (form: FormRow) => void;
  onPreview: (form: FormRow) => void;
}

export const FormDetailDialog: React.FC<FormDetailDialogProps> = ({
  form,
  isAdmin,
  approverName,
  onClose,
  onChanged,
  onDownload,
  onPreview,
}) => {
  const { toast } = useToast();
  const [note, setNote] = useState(form.review_note ?? '');
  const [busy, setBusy] = useState(false);

  const clientName = form.clients
    ? `${form.clients.first_name} ${form.clients.last_name}`
    : 'Unknown client';

  const approve = async () => {
    setBusy(true);
    try {
      let approvedPath = form.file_path;
      if (form.file_path) {
        // Stamp the approval onto a new copy so the stored signed file stays intact.
        const { data: blob, error: dlError } = await supabase.storage
          .from('client-files')
          .download(form.file_path);
        if (dlError) throw dlError;

        const stamped = await stampApproval(await blob.arrayBuffer(), approverName);
        approvedPath = form.file_path.replace(/[^/]+$/, `approved-${Date.now()}.pdf`);
        const { error: upError } = await supabase.storage
          .from('client-files')
          .upload(
            approvedPath,
            new Blob([stamped as unknown as BlobPart], { type: 'application/pdf' }),
            { contentType: 'application/pdf' },
          );
        if (upError) throw upError;
      }

      const { error } = await supabase
        .from('client_forms')
        .update({ status: 'approved', file_path: approvedPath, review_note: note || null })
        .eq('id', form.id);
      if (error) throw error;

      toast({ title: 'Form approved', description: `${clientName} — ${form.title}` });
      onChanged();
      onClose();
    } catch (err: any) {
      toast({ title: 'Could not approve', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const requestChanges = async () => {
    if (!note.trim()) {
      toast({ title: 'Add a note explaining what to change', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from('client_forms')
        .update({ status: 'changes_requested', review_note: note.trim() })
        .eq('id', form.id);
      if (error) throw error;
      toast({ title: 'Changes requested' });
      onChanged();
      onClose();
    } catch (err: any) {
      toast({ title: 'Could not update', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
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
              <div className="text-muted-foreground text-xs">Submitted by</div>
              <div>
                {form.profiles
                  ? `${form.profiles.first_name ?? ''} ${form.profiles.last_name ?? ''}`.trim()
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Submitted</div>
              <div>{new Date(form.created_at).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Status</div>
              <div>{FORM_STATUS_LABEL[form.status] ?? form.status}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Signed</div>
              <div>
                {form.signed_at
                  ? `${form.signature_name ?? ''} — ${new Date(form.signed_at).toLocaleString()}`
                  : 'Not signed'}
              </div>
            </div>
            {form.approved_at && (
              <div className="col-span-2">
                <div className="text-muted-foreground text-xs">Approved</div>
                <div>{new Date(form.approved_at).toLocaleString()}</div>
              </div>
            )}
          </div>

          {form.review_note && form.status === 'changes_requested' && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <div className="text-xs font-medium">Reviewer note</div>
              <p className="text-sm">{form.review_note}</p>
            </div>
          )}

          {form.file_path && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onPreview(form)}>
                Preview PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => onDownload(form)}>
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
            </div>
          )}

          {form.form_data && (
            <div className="border-t pt-3">
              <FormDataSummary formType={form.form_type} data={form.form_data} />
            </div>
          )}

          {isAdmin && form.status !== 'approved' && (
            <div className="space-y-2 border-t pt-3">
              <Label htmlFor="review-note">Reviewer note (optional for approval)</Label>
              <Textarea
                id="review-note"
                value={note}
                maxLength={1000}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What needs to change?"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          {isAdmin && form.status !== 'approved' ? (
            <>
              <Button variant="outline" onClick={requestChanges} disabled={busy}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Request changes
              </Button>
              <Button onClick={approve} disabled={busy}>
                <Check className="h-4 w-4 mr-2" />
                {busy ? 'Working...' : 'Approve'}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
