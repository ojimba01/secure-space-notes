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
import { SignaturePad } from '@/components/forms/SignaturePad';
import { FORM_TYPES, signPdf } from '@/lib/formSigning';
import { Upload } from 'lucide-react';

const MAX_BYTES = 20 * 1024 * 1024;

const schema = z.object({
  client_id: z.string().uuid('Select a client'),
  form_type: z.enum(FORM_TYPES),
  title: z.string().trim().min(1, 'Title is required').max(200),
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
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState('');
  const [formType, setFormType] = useState<string>(initialFormType ?? FORM_TYPES[0]);
  const [title, setTitle] = useState<string>(initialFormType ?? FORM_TYPES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [attested, setAttested] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, first_name, last_name')
        .is('deleted_at', null)
        .order('last_name');
      setClients(data ?? []);
    })();
  }, [open]);

  const reset = () => {
    setClientId('');
    setFormType(FORM_TYPES[0]);
    setTitle(FORM_TYPES[0]);
    setFile(null);
    setSignature(null);
    setAttested(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    const parsed = schema.safeParse({ client_id: clientId, form_type: formType, title });
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
    if (!signature) {
      toast({ title: 'Add your signature before submitting', variant: 'destructive' });
      return;
    }
    if (!attested) {
      toast({ title: 'Confirm the attestation to submit', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const signedBytes = await signPdf(file, {
        signatureDataUrl: signature,
        signerName,
      });
      const folder = `forms/${clientId}/${crypto.randomUUID()}`;
      const signedPath = `${folder}/signed.pdf`;
      const originalPath = `${folder}/original.pdf`;

      const signedBlob = new Blob([signedBytes as unknown as BlobPart], {
        type: 'application/pdf',
      });

      const uploads = await Promise.all([
        supabase.storage
          .from('client-files')
          .upload(signedPath, signedBlob, { contentType: 'application/pdf' }),
        supabase.storage
          .from('client-files')
          .upload(originalPath, file, { contentType: 'application/pdf' }),
      ]);
      const uploadError = uploads.find((u) => u.error)?.error;
      if (uploadError) throw uploadError;

      const { error } = await supabase.from('client_forms').insert({
        client_id: clientId,
        employee_id: profileId,
        form_type: formType,
        title: parsed.data.title,
        file_path: signedPath,
        original_file_path: originalPath,
        file_size: signedBlob.size,
        status: 'submitted',
        signature_name: signerName,
        signed_by: profileId,
        signed_at: new Date().toISOString(),
      });
      if (error) throw error;

      toast({
        title: 'Form submitted',
        description: 'Your signed form is now awaiting manager approval.',
      });
      reset();
      onSubmitted();
      onClose();
    } catch (err: any) {
      toast({
        title: 'Could not submit the form',
        description: err.message,
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
            <Select
              value={formType}
              onValueChange={(v) => {
                setFormType(v);
                if (FORM_TYPES.includes(title as never) || !title) setTitle(v);
              }}
            >
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="form-title">Title</Label>
            <Input
              id="form-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="form-file">Completed PDF</Label>
            <Input
              id="form-file"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">PDF only, up to 20 MB.</p>
          </div>

          <SignaturePad onChange={setSignature} />

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
            {saving ? 'Submitting...' : 'Sign and submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
