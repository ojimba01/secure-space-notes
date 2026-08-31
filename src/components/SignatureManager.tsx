import React, { useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/AuthProvider';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Upload } from 'lucide-react';
import {
  cleanPhotograph,
  deleteSignature,
  loadSignatures,
  makeDefault,
  saveSignature,
  signatureUrl,
  type SavedSignature,
  type SignatureKind,
} from '@/lib/signatures';

/**
 * Draw a signature once, or photograph the one on paper, and keep it.
 *
 * Two kinds, because they are two different marks: a full signature and an
 * initial. Somebody may keep more than one of each, named, so the right one
 * can be picked on a form.
 */
export const SignatureManager: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const profileId = useEffectiveProfileId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);

  const [saved, setSaved] = useState<SavedSignature[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<SignatureKind>('signature');
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');

  /**
   * Write a typed name onto the canvas in a script face.
   *
   * The browser's own cursive family, so nothing is downloaded and this works
   * with no connection. It lands on the same canvas as a drawing, so it can be
   * looked at, cleared, or saved by the same button.
   */
  const writeTyped = () => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !typed.trim()) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#111';
    ctx.textBaseline = 'middle';
    let size = 64;
    do {
      ctx.font = `italic ${size}px "Snell Roundhand", "Segoe Script", "Brush Script MT", cursive`;
      size -= 2;
    } while (ctx.measureText(typed).width > c.width - 40 && size > 18);
    ctx.fillText(typed.trim(), 20, c.height / 2);
  };

  const load = async () => {
    if (!profileId) return;
    try {
      const list = await loadSignatures(profileId);
      setSaved(list);
      const pairs = await Promise.all(
        list.map(async (s) => [s.id, (await signatureUrl(s.imagePath)) ?? ''] as const),
      );
      setUrls(Object.fromEntries(pairs));
    } catch (err: any) {
      toast({ title: 'Could not load your signatures', description: err.message, variant: 'destructive' });
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  // ---- drawing -----------------------------------------------------------
  const position = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = position(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = position(e);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stop = () => {
    drawing.current = false;
  };

  const clear = () => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
  };

  const isBlank = () => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return true;
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
    return true;
  };

  // ---- saving ------------------------------------------------------------
  const store = async (blob: Blob) => {
    if (!profileId || !user) return;
    setBusy(true);
    try {
      await saveSignature(profileId, user.id, label, kind, blob);
      setLabel('');
      clear();
      await load();
      toast({ title: 'Saved' });
    } catch (err: any) {
      toast({ title: 'Could not save it', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const saveDrawing = () => {
    if (isBlank()) {
      toast({ title: 'Draw it first', variant: 'destructive' });
      return;
    }
    canvas.current?.toBlob((blob) => blob && store(blob), 'image/png');
  };

  const setDefault = async (sig: SavedSignature) => {
    try {
      await makeDefault(sig.id);
      await load();
    } catch (err: any) {
      toast({ title: 'Could not set that', description: err.message, variant: 'destructive' });
    }
  };

  const remove = async (sig: SavedSignature) => {
    try {
      await deleteSignature(sig);
      await load();
    } catch (err: any) {
      toast({ title: 'Could not remove it', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Your signature</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Draw it, type it, or upload a photograph of the one you sign on paper. Only you can see
          these.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sig-label">Name</Label>
            <Input
              id="sig-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={kind === 'initial' ? 'Initials' : 'Full signature'}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Kind</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={kind === 'signature' ? 'default' : 'outline'}
                onClick={() => setKind('signature')}
              >
                Signature
              </Button>
              <Button
                type="button"
                variant={kind === 'initial' ? 'default' : 'outline'}
                onClick={() => setKind('initial')}
              >
                Initial
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label htmlFor="sig-typed">Or type your name</Label>
            <Input
              id="sig-typed"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Khyla Williams"
            />
          </div>
          <Button type="button" variant="outline" onClick={writeTyped} disabled={!typed.trim()}>
            Add
          </Button>
        </div>

        <div className="space-y-2">
          <canvas
            ref={canvas}
            width={520}
            height={140}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={stop}
            onPointerLeave={stop}
            className="w-full touch-none rounded-md border bg-white"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={saveDrawing} disabled={busy}>
              Save this signature
            </Button>
            <Button type="button" variant="outline" onClick={clear} disabled={busy}>
              Clear
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload a photo
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) cleanPhotograph(f).then(store);
              }}
            />
          </div>
        </div>

        {saved.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Saved</p>
            <div className="divide-y rounded-md border">
              {saved.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 p-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    {urls[s.id] && (
                      <img
                        src={urls[s.id]}
                        alt={s.label}
                        className="h-10 w-28 object-contain bg-white rounded border"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm">{s.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.kind === 'initial' ? 'Initial' : 'Signature'}
                        {s.isDefault && ' · default'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!s.isDefault && (
                      <Button variant="outline" size="sm" onClick={() => setDefault(s)}>
                        Make default
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => remove(s)} aria-label="Remove">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
