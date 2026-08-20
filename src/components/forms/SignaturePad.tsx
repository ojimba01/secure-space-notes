import React, { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Eraser } from 'lucide-react';

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({ onChange }) => {
  const padRef = useRef<SignatureCanvas | null>(null);
  const [hasInk, setHasInk] = useState(false);

  const handleEnd = () => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      setHasInk(false);
      onChange(null);
      return;
    }
    setHasInk(true);
    onChange(pad.toDataURL('image/png'));
  };

  const clear = () => {
    padRef.current?.clear();
    setHasInk(false);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Signature</Label>
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!hasInk}>
          <Eraser className="h-4 w-4 mr-1" />
          Clear
        </Button>
      </div>
      <div className="rounded-md border bg-muted/30">
        <SignatureCanvas
          ref={(ref) => {
            padRef.current = ref;
          }}
          penColor="#111827"
          onEnd={handleEnd}
          canvasProps={{
            className: 'w-full h-32 rounded-md touch-none',
            width: 640,
            height: 160,
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Draw your signature above with a mouse or finger. It is stamped into the PDF with your name
        and a UTC timestamp.
      </p>
    </div>
  );
};
