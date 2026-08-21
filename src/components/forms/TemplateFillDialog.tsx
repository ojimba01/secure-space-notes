import React, { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import '@/lib/pdfWorker';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { Download, Upload, ZoomIn, ZoomOut } from 'lucide-react';
import type { FormType } from '@/lib/formSigning';

export interface PdfTemplate {
  formType: FormType;
  file: string;
  description: string;
}

/**
 * Blank fillable copies of the official NJ Housing Supports PDFs, served from
 * /public and rendered in-page with interactive form fields.
 */
export const PDF_TEMPLATES: PdfTemplate[] = [
  {
    formType: 'Initial Assessment Tool',
    file: '/form-templates/initial-assessment-tool.pdf',
    description: 'Request Housing Supports services and document eligibility.',
  },
  {
    formType: 'Level of Need Assessment Tool',
    file: '/form-templates/level-of-need-assessment-tool.pdf',
    description: 'Scored assessment for authorization and reauthorization.',
  },
  {
    formType: 'Housing Stabilization Plan',
    file: '/form-templates/housing-stabilization-plan.pdf',
    description: 'Individualized goals and activities plan built with the member.',
  },
];

const BASE_PAGE_WIDTH = 820;
const MAX_BYTES = 20 * 1024 * 1024;

interface ClientOption {
  id: string;
  first_name: string;
  last_name: string;
}

interface TemplateFillDialogProps {
  template: PdfTemplate;
  profileId: string;
  signerName: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export const TemplateFillDialog: React.FC<TemplateFillDialogProps> = ({
  template,
  profileId,
  signerName,
  onClose,
  onSubmitted,
}) => {
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();
  const docRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState('');
  const [attested, setAttested] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
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
  }, [isAdmin, profileId]);

  /** The current PDF bytes including everything typed into the form fields. */
  const collectFilledPdf = async (): Promise<Blob> => {
    const doc = docRef.current;
    if (!doc) throw new Error('The form is still loading — try again in a moment.');
    const bytes = await doc.saveDocument();
    return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  };

  const handleDownloadCopy = async () => {
    try {
      const blob = await collectFilledPdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${template.formType.replace(/[^\w\- ]+/g, '')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: 'Could not prepare the PDF', description: err.message, variant: 'destructive' });
    }
  };

  const handleSubmit = async () => {
    if (!clientId) {
      toast({ title: 'Select a client', variant: 'destructive' });
      return;
    }
    if (!attested) {
      toast({ title: 'Confirm the attestation to submit', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const blob = await collectFilledPdf();
      if (blob.size > MAX_BYTES) {
        throw new Error('The completed form is larger than 20 MB.');
      }

      const folder = `forms/${clientId}/${crypto.randomUUID()}`;
      const filePath = `${folder}/form.pdf`;

      const { error: uploadError } = await supabase.storage
        .from('client-files')
        .upload(filePath, blob, { contentType: 'application/pdf' });
      if (uploadError) throw uploadError;

      const { error } = await supabase.from('client_forms').insert({
        client_id: clientId,
        employee_id: profileId,
        form_type: template.formType,
        title: template.formType,
        file_path: filePath,
        original_file_path: filePath,
        file_size: blob.size,
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl h-[94vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{template.formType}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1.5 min-w-[240px]">
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
                No clients are assigned to you yet. Ask an administrator to assign a client.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setScale((s) => Math.max(0.6, +(s - 0.1).toFixed(2)))}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setScale((s) => Math.min(1.6, +(s + 0.1).toFixed(2)))}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Type directly into the form fields below — including typing names on the signature
          lines. Your entries stay on this page until you press Submit. If a handwritten
          signature is required, use <span className="font-medium">Download copy</span> to
          print and sign, then submit it via Upload Form instead.
        </p>

        <div className="flex-1 overflow-auto rounded-md border bg-muted/30 p-3">
          <Document
            file={template.file}
            onLoadSuccess={(doc) => {
              docRef.current = doc;
              setNumPages(doc.numPages);
            }}
            onLoadError={(err) => setLoadError(err?.message ?? String(err))}
            onSourceError={(err) => setLoadError(err?.message ?? String(err))}
            loading={<div className="p-8 text-center text-sm text-muted-foreground">Loading form...</div>}
            error={
              <div className="p-8 text-center text-sm text-destructive space-y-1">
                <p>Failed to load the form. Try downloading the blank copy instead.</p>
                {loadError && <p className="text-xs opacity-80">Details: {loadError}</p>}
              </div>
            }
          >
            <div className="flex flex-col items-center gap-4">
              {Array.from({ length: numPages }, (_, i) => (
                <div key={i} className="shadow-sm">
                  <Page
                    pageNumber={i + 1}
                    width={BASE_PAGE_WIDTH * scale}
                    renderTextLayer={false}
                    renderAnnotationLayer
                    renderForms
                  />
                </div>
              ))}
            </div>
          </Document>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={attested}
            onCheckedChange={(v) => setAttested(v === true)}
            className="mt-0.5"
          />
          <span>I attest this form is complete and accurate.</span>
        </label>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadCopy} disabled={!numPages}>
              <Download className="h-4 w-4 mr-1" />
              Download copy
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving || !numPages}>
              <Upload className="h-4 w-4 mr-2" />
              {saving ? 'Submitting...' : 'Submit form'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
