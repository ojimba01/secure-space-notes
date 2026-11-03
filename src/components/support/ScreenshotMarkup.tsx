// Drawing on a screenshot: circle the problem, then attach it.
//
// The screenshot fills the screen; dragging draws on top of it in the chosen
// colour. Undo takes back the last stroke. Saving hands back one image with
// the drawing flattened into it.
import React, { useEffect, useRef, useState } from 'react';
import { Check, Eraser, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PENS = [
  { name: 'Red', value: '#dc2626' },
  { name: 'Yellow', value: '#facc15' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Black', value: '#111827' },
];

interface Props {
  image: HTMLCanvasElement;
  onCancel: () => void;
  onSave: (png: Blob) => void;
  /** The instruction at the top. */
  hint?: string;
}

export const ScreenshotMarkup: React.FC<Props> = ({ image, onCancel, onSave, hint }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  // The picture before each stroke, so Undo can put it back.
  const history = useRef<ImageData[]>([]);
  const [strokes, setStrokes] = useState(0);
  const [pen, setPen] = useState(PENS[0].value);

  const paintBase = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    history.current = [];
    setStrokes(0);
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
    const canvas = canvasRef.current!;
    history.current.push(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height));
    // Memory stays bounded on large screenshots.
    if (history.current.length > 20) history.current.shift();
    drawing.current = true;
    last.current = point(e);
    setStrokes((n) => n + 1);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const next = point(e);
    ctx.strokeStyle = pen;
    ctx.lineWidth = Math.max(4, image.width / 300);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    last.current = next;
  };

  const up = () => {
    drawing.current = false;
    last.current = null;
  };

  const undo = () => {
    const prev = history.current.pop();
    if (prev) canvasRef.current!.getContext('2d')!.putImageData(prev, 0, 0);
    setStrokes((n) => Math.max(0, n - 1));
  };

  const save = () => {
    canvasRef.current?.toBlob((blob) => blob && onSave(blob), 'image/png');
  };

  return (
    <div data-support-widget className="fixed inset-0 z-[100] flex flex-col bg-slate-900/90">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-4 py-2 shadow">
        <p className="text-sm">
          <strong>Mark up the screenshot.</strong> {hint ?? 'Draw around the problem, then select Attach.'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Pen colour">
            {PENS.map((p) => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={pen === p.value}
                aria-label={p.name}
                title={p.name}
                onClick={() => setPen(p.value)}
                className={`h-6 w-6 rounded-full border-2 ${pen === p.value ? 'border-slate-900 ring-2 ring-offset-1 ring-slate-400' : 'border-white shadow'}`}
                style={{ backgroundColor: p.value }}
              />
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={undo} disabled={!strokes}>
            <Undo2 className="mr-1.5 h-4 w-4" />
            Undo
          </Button>
          <Button variant="outline" size="sm" onClick={paintBase} disabled={!strokes}>
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
