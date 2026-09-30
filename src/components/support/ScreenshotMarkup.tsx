// Drawing on a screenshot: circle the problem, then attach it.
//
// The screenshot fills the screen; dragging draws in red on top of it. Saving
// hands back one image with the drawing flattened into it.
import React, { useEffect, useRef, useState } from 'react';
import { Check, Eraser, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  image: HTMLCanvasElement;
  onCancel: () => void;
  onSave: (png: Blob) => void;
}

export const ScreenshotMarkup: React.FC<Props> = ({ image, onCancel, onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [marked, setMarked] = useState(false);

  const paintBase = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    setMarked(false);
  };

  useEffect(paintBase, [image]);

  /** Where the pointer is, in the screenshot's own pixels. */
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * image.width,
      y: ((e.clientY - rect.top) / rect.height) * image.height,
    };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const next = point(e);
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = Math.max(4, image.width / 300);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    last.current = next;
    setMarked(true);
  };

  const up = () => {
    drawing.current = false;
    last.current = null;
  };

  const save = () => {
    canvasRef.current?.toBlob((blob) => blob && onSave(blob), 'image/png');
  };

  return (
    <div data-support-widget className="fixed inset-0 z-[100] flex flex-col bg-slate-900/90">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-4 py-2 shadow">
        <p className="text-sm">
          <strong>Mark up the screenshot.</strong> Draw around the problem, then select Attach.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={paintBase} disabled={!marked}>
            <Eraser className="mr-1.5 h-4 w-4" />
            Clear
          </Button>
          <Button variant="outline" size="sm" onClick={onCancel}>
            <X className="mr-1.5 h-4 w-4" />
            Cancel
          </Button>
          <Button size="sm" onClick={save}>
            <Check className="mr-1.5 h-4 w-4" />
            Attach
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <canvas
          ref={canvasRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="max-h-full max-w-full cursor-crosshair touch-none rounded bg-white shadow-2xl"
        />
      </div>
    </div>
  );
};
