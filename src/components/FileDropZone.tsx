// Choosing a file, as a target you can drop one on.
//
// The browser's own file input is a small grey button labelled "Choose File"
// with the filename beside it, and no indication that a drag would work —
// because it would not. People arrive here having just downloaded a signed PDF
// and try to drag it in; this is the thing they were reaching for.
import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Upload, X } from 'lucide-react';

interface Props {
  /** The file currently chosen, owned by the parent so it can clear it too. */
  file: File | null;
  onChange: (file: File | null) => void;
  /** An `accept` string, e.g. "application/pdf". Enforced on drop as well. */
  accept?: string;
  /** Said under the button, e.g. "PDF only, up to 20 MB." */
  hint?: string;
  label?: string;
  disabled?: boolean;
  id?: string;
}

export const FileDropZone: React.FC<Props> = ({
  file,
  onChange,
  accept,
  hint,
  label = 'Upload PDF',
  disabled,
  id = 'file-drop',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  /** A drop bypasses the input's own accept, so the same rule is applied here. */
  const allowed = (f: File) => {
    if (!accept) return true;
    return accept
      .split(',')
      .map((a) => a.trim())
      .some((a) =>
        a.startsWith('.')
          ? f.name.toLowerCase().endsWith(a.toLowerCase())
          : a.endsWith('/*')
            ? f.type.startsWith(a.slice(0, -1))
            : f.type === a,
      );
  };

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
        <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {file.size < 1024 * 1024
              ? `${Math.max(1, Math.round(file.size / 1024))} KB`
              : `${(file.size / 1024 / 1024).toFixed(1)} MB`}
          </p>
        </div>
        {/* Picking the wrong file should not mean closing the dialog and
            starting again. */}
        <button
          type="button"
          onClick={() => {
            onChange(null);
            if (inputRef.current) inputRef.current.value = '';
          }}
          disabled={disabled}
          aria-label={`Remove ${file.name}`}
          title="Remove this file"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped && allowed(dropped)) onChange(dropped);
      }}
      className={`flex flex-col items-center gap-2 rounded-md border-2 border-dashed p-6 text-center transition-colors ${
        over ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 bg-muted/20'
      }`}
    >
      <Upload className={`h-7 w-7 ${over ? 'text-primary' : 'text-muted-foreground'}`} />
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">Drag a file here, or</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Choose file
      </Button>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
};

export default FileDropZone;
