// One form on the Blank forms page. The whole card opens the form; an
// optional small icon beside it does the one other thing (view the case log
// form). Uploading a completed form is a single button at the top of the
// page, not one on every card.
import React from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  title: string;
  /** Only when it adds something, like a saved draft. */
  detail?: React.ReactNode;
  onOpen: () => void;
  /** Spoken label for the card, e.g. "Fill out the Client Intake". */
  label: string;
  disabled?: boolean;
  aside?: { icon: LucideIcon; label: string; onClick: () => void };
}

export const FormTile: React.FC<Props> = ({ title, detail, onOpen, label, disabled, aside }) => (
  <div className="group relative flex items-center rounded-2xl border border-border/70 bg-card shadow-sm transition hover:border-primary/30 hover:shadow-md">
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex min-h-[72px] flex-1 items-center gap-3 rounded-2xl px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-medium leading-snug text-foreground">{title}</span>
        {detail && <span className="mt-0.5 block text-sm text-muted-foreground">{detail}</span>}
      </span>
      {!aside && (
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
      )}
    </button>
    {aside && (
      <Button
        variant="ghost"
        size="icon"
        className="mr-3 shrink-0 rounded-xl text-muted-foreground hover:text-primary"
        onClick={aside.onClick}
        disabled={disabled}
        title={aside.label}
        aria-label={aside.label}
      >
        <aside.icon className="h-5 w-5" />
      </Button>
    )}
  </div>
);
