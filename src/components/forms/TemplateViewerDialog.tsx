import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink, Upload } from 'lucide-react';
import type { FormType } from '@/lib/formSigning';

export interface PdfTemplate {
  formType: FormType;
  file: string;
  description: string;
}

/**
 * Blank fillable copies of the official NJ Housing Supports PDFs, served from
 * /public so the browser's built-in PDF viewer can render and fill them.
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

interface TemplateViewerDialogProps {
  template: PdfTemplate;
  onClose: () => void;
  /** Opens the upload dialog pre-set to this template's form type. */
  onUpload: (formType: FormType) => void;
}

export const TemplateViewerDialog: React.FC<TemplateViewerDialogProps> = ({
  template,
  onClose,
  onUpload,
}) => (
  <Dialog open onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-w-5xl h-[92vh] flex flex-col gap-3">
      <DialogHeader>
        <DialogTitle>{template.formType}</DialogTitle>
      </DialogHeader>

      <p className="text-xs text-muted-foreground">
        Fill the form directly in the viewer below, then use the viewer's download button to save
        your completed copy. Nothing you type here is stored by this site until you submit the
        downloaded PDF with <span className="font-medium">Upload completed PDF</span>. If the
        fields aren't editable in your browser, open the form in a new tab or download the blank
        copy instead.
      </p>

      <iframe
        src={template.file}
        title={template.formType}
        className="flex-1 w-full rounded-md border bg-muted/30"
      />

      <DialogFooter className="gap-2 sm:justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={template.file} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4 mr-1" />
              Open in new tab
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={template.file} download>
              <Download className="h-4 w-4 mr-1" />
              Download blank
            </a>
          </Button>
        </div>
        <Button size="sm" onClick={() => onUpload(template.formType)}>
          <Upload className="h-4 w-4 mr-1" />
          Upload completed PDF
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
