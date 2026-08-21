import React, { useEffect, useState } from 'react';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useIsAdmin } from '@/hooks/useIsAdmin';

import { FORM_TYPES } from '@/lib/formSigning';
import { Upload } from 'lucide-react';

const MAX_BYTES = 20 * 1024 * 1024;

const schema = z.object({
  client_id: z.string().uuid('Select a client'),
  form_type: z.enum(FORM_TYPES),
});

interface UploadFormDialogProps {
  open: boolean;
  onClose: () => void;
  profileId: string;
  signerName: string;
  onSubmitted: () => void;
  /** Pre-selects the form type, e.g. when arriving from a template viewer. */
  initialFormType?: string;
}

interface ClientOption {
  id: string;
  first_name: string;
  last_name: string;
}

export const UploadFormDialog: React.FC<UploadFormDialogProps> = ({
  open,
  onClose,
  profileId,
  signerName,
  onSubmitted,
  initialFormType,
}) => {
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();
  const [clients, setClients] = useState<ClientOption[]>([]);

  const [clientId, setClientId] = useState('');
  const [formType, setFormType] = useState<string>(initialFormType ?? FORM_TYPES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [attested, setAttested] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      let query = supabase
        .from('clients')
        .select('id, first_name, last_name')
        .is('deleted_at', null)
        .order('last_name');

      // Employees can only file forms for clients assigned to them, so keep the
      // dropdown in sync with what the database will actually accept.
      if (!isAdmin && profileId) {
        query = query.eq('assigned_employee_id', profileId);
      }

      const { data } = await query;
      setClients(data ?? []);
    })();
  }, [open, isAdmin, profileId]);


  const reset = () => {
    setClientId('');
    setFormType(FORM_TYPES[0]);
    setFile(null);
    setAttested(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    const parsed = schema.safeParse({ client_id: clientId, form_type: formType });
    if (!parsed.success) {
      toast({
        title: 'Check the form',
        description: Object.values(parsed.error.flatten().fieldErrors).flat()[0],
        variant: 'destructive',
      });
      return;
    }
    if (!file) {
      toast({ title: 'Attach the completed PDF', variant: 'destructive' });
      return;
    }
    if (file.type !== 'application/pdf') {
      toast({ title: 'Only PDF files can be submitted', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: 'File is larger than 20 MB', variant: 'destructive' });
      return;
    }
    if (!attested) {
      toast({ title: 'Confirm the attestation to submit', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const folder = `forms/${clientId}/${crypto.randomUUID()}`;
      const filePath = `${folder}/form.pdf`;

      const { error: uploadError } = await supabase.storage
        .from('client-files')
        .upload(filePath, file, { contentType: 'application/pdf' });
      if (uploadError) throw uploadError;

      const { error } = await supabase.from('client_forms').insert({
        client_id: clientId,
        employee_id: profileId,
        form_type: formType,
        title: formType,
        file_path: filePath,
        original_file_path: filePath,
        file_size: file.size,
        status: 'submitted',
        signature_name: signerName,
        signed_by: profileId,
        signed_at: new Date().toISOString(),
      });
      if (error) throw error;

      toast({
        title: 'Form submitted',
        description: 'Your form is now awaiting manager approval.',
      });
      reset();
      onSubmitted();
      onClose();
    } catch (err: any) {
      const raw = err?.message ?? '';
      toast({
        title: 'Could not submit the form',
        description: raw.includes('row-level security')
          ? 'You can only submit forms for clients assigned to you. Ask an administrator to assign this client to you first.'
          : raw,
        variant: 'destructive',
      });

    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload a completed form</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Form type</Label>
            <Select value={formType} onValueChange={setFormType}>
              <SelectTrigger>
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
          </div>

          <div className="space-y-2">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.last_name}, {c.first_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {clients.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No clients are assigned to you yet, so there is nothing to file a form
                against. Ask an administrator to assign a client.
              </p>
            )}
          </div>


          <div className="space-y-2">
            <Label htmlFor="form-file">Completed PDF</Label>
            <Input
              id="form-file"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              PDF only, up to 20 MB. The file is stored exactly as you upload it — sign it before
              uploading if a signature is required.
            </p>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={attested}
              onCheckedChange={(v) => setAttested(v === true)}
              className="mt-0.5"
            />
            <span>I attest this form is complete and accurate.</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            <Upload className="h-4 w-4 mr-2" />
            {saving ? 'Submitting...' : 'Submit form'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
