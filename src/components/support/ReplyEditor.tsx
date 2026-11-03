// Support's reply box: bold, italics, bullet points, text colour, and images
// (chosen, pasted or dropped) that can be drawn on before sending.
//
// The editor is a content-editable box. Pasted text arrives as plain text, so
// formatting only comes from the toolbar; what it holds is read into safe
// blocks (lib/richText) when the reply is sent.
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Bold, ImagePlus, Italic, List, Pencil, Palette, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { ScreenshotMarkup } from '@/components/support/ScreenshotMarkup';
import { domToRich, richToPlain, TEXT_COLORS, type RichBlock } from '@/lib/richText';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT = 4000;

export interface PendingImage {
  id: string;
  blob: Blob;
  url: string;
  name: string;
}

export interface ReplyEditorHandle {
  /** What is in the box: blocks for display, plain text for everything else. */
  read: () => { blocks: RichBlock[]; plain: string; images: PendingImage[] };
  clear: () => void;
}

interface Props {
  placeholder: string;
  disabled?: boolean;
  /** Called as the content changes, with whether there is anything to send. */
  onChange?: (hasContent: boolean) => void;
}

async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

export const ReplyEditor = forwardRef<ReplyEditorHandle, Props>(({ placeholder, disabled, onChange }, ref) => {
  const { toast } = useToast();
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [empty, setEmpty] = useState(true);
  const [marking, setMarking] = useState<{ id: string; canvas: HTMLCanvasElement } | null>(null);

  const report = (nextImages = images) => {
    const text = editorRef.current?.innerText.trim() ?? '';
    setEmpty(!text);
    onChange?.(!!text || nextImages.length > 0);
  };

  useImperativeHandle(ref, () => ({
    read: () => {
      const blocks = editorRef.current ? domToRich(editorRef.current) : [];
      return { blocks, plain: richToPlain(blocks), images };
    },
    clear: () => {
      if (editorRef.current) editorRef.current.innerHTML = '';
      images.forEach((i) => URL.revokeObjectURL(i.url));
      setImages([]);
      setEmpty(true);
      onChange?.(false);
    },
  }));

  const command = (name: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(name, false, value);
    report();
  };

  const addImages = (files: File[] | Blob[]) => {
    const accepted: PendingImage[] = [];
    for (const f of files) {
      if (!f.type.startsWith('image/')) {
        toast({ title: 'Only images can be attached here', variant: 'destructive' });
        continue;
      }
      if (f.size > MAX_IMAGE_BYTES) {
        toast({ title: 'That image is larger than 10 MB', variant: 'destructive' });
        continue;
      }
      const name = f instanceof File && f.name ? f.name : `screenshot-${accepted.length + images.length + 1}.png`;
      accepted.push({ id: crypto.randomUUID(), blob: f, url: URL.createObjectURL(f), name });
    }
    if (!accepted.length) return;
    const next = [...images, ...accepted];
    setImages(next);
    report(next);
  };

  const removeImage = (id: string) => {
    const gone = images.find((i) => i.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    const next = images.filter((i) => i.id !== id);
    setImages(next);
    report(next);
  };

  const startMarkup = async (img: PendingImage) => {
    try {
      setMarking({ id: img.id, canvas: await blobToCanvas(img.blob) });
    } catch {
      toast({ title: 'Could not open that image for drawing', variant: 'destructive' });
    }
  };

  const finishMarkup = (png: Blob) => {
    if (!marking) return;
    setImages((list) =>
      list.map((i) => {
        if (i.id !== marking.id) return i;
        URL.revokeObjectURL(i.url);
        return { ...i, blob: png, url: URL.createObjectURL(png), name: i.name.replace(/\.[a-z]+$/i, '') + '.png' };
      }),
    );
    setMarking(null);
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
    e.preventDefault();
    if (files.length) {
      addImages(files);
      return;
    }
    // Text only: formatting comes from the toolbar, never from what was copied.
    const text = e.clipboardData.getData('text/plain');
    const room = MAX_TEXT - (editorRef.current?.innerText.length ?? 0);
    if (text && room > 0) document.execCommand('insertText', false, text.slice(0, room));
    report();
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    e.preventDefault();
    addImages(files);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const length = editorRef.current?.innerText.length ?? 0;
    if (length >= MAX_TEXT && e.key.length === 1 && !e.ctrlKey && !e.metaKey) e.preventDefault();
  };

  const toolButton = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      title={label}
      aria-label={label}
      // Keep the selection in the editor while the button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
    </Button>
  );

  return (
    <div className="rounded-md border focus-within:ring-2 focus-within:ring-ring">
      <div className="flex flex-wrap items-center gap-0.5 border-b px-1 py-1">
        {toolButton('Bold (Ctrl+B)', <Bold className="h-4 w-4" />, () => command('bold'))}
        {toolButton('Italic (Ctrl+I)', <Italic className="h-4 w-4" />, () => command('italic'))}
        {toolButton('Bullet points', <List className="h-4 w-4" />, () => command('insertUnorderedList'))}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Text colour"
              aria-label="Text colour"
              onMouseDown={(e) => e.preventDefault()}
              disabled={disabled}
            >
              <Palette className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
            <div className="flex gap-1.5">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.name}
                  aria-label={c.name}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => command('foreColor', c.value)}
                  className="h-6 w-6 rounded-full border shadow-sm"
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <span className="mx-1 h-5 w-px bg-border" />
        {toolButton('Attach image', <ImagePlus className="h-4 w-4" />, () => fileRef.current?.click())}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addImages(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>
      <div className="relative">
        {empty && (
          <p className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">{placeholder}</p>
        )}
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          aria-label="Reply"
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={() => report()}
          onPaste={onPaste}
          onDrop={onDrop}
          onKeyDown={onKeyDown}
          className="min-h-[84px] max-h-72 overflow-y-auto px-3 py-2 text-sm outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
        />
      </div>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t p-2">
          {images.map((img) => (
            <div key={img.id} className="group relative">
              <img src={img.url} alt={img.name} className="h-20 rounded border object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/50 p-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                <Button type="button" size="sm" variant="secondary" className="h-6 px-2 text-xs" onClick={() => void startMarkup(img)}>
                  <Pencil className="mr-1 h-3 w-3" />
                  Draw
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-6 w-6"
                  aria-label={`Remove ${img.name}`}
                  onClick={() => removeImage(img.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {marking && (
        <ScreenshotMarkup
          image={marking.canvas}
          hint="Draw on the image, then select Attach."
          onCancel={() => setMarking(null)}
          onSave={finishMarkup}
        />
      )}
    </div>
  );
});
ReplyEditor.displayName = 'ReplyEditor';
