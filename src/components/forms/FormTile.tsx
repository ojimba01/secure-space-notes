// One form on the Blank forms page: what it is, then the two ways to use it.
// Every form there uses this, so the cards line up and read the same way.
import React from 'react';
import { FileText, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Action {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  /** Spoken and hovered label when the visible one is short. */
  title?: string;
}

interface Props {
  title: string;
  /** A short second line: the request type, a saved draft. */
  detail?: React.ReactNode;
  icon?: LucideIcon;
  primary: Action;
  secondary?: Action;
  disabled?: boolean;
}

export const FormTile: React.FC<Props> = ({ title, detail, icon: Icon = FileText, primary, secondary, disabled }) => (
  <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
    <div className="flex items-start gap-3">
      <div className="rounded-xl bg-sky-100 p-2.5 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <h3 className="font-semibold leading-snug text-primary">{title}</h3>
        {detail && <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>}
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        className="rounded-lg"
        onClick={primary.onClick}
        disabled={disabled}
        title={primary.title}
        aria-label={primary.title}
      >
        {primary.icon && <primary.icon className="mr-1.5 h-4 w-4" />}
        {primary.label}
      </Button>
      {secondary && (
        <Button
          size="sm"
          variant="ghost"
          className="rounded-lg text-primary"
          onClick={secondary.onClick}
          disabled={disabled}
          title={secondary.title}
          aria-label={secondary.title}
        >
          {secondary.icon && <secondary.icon className="mr-1.5 h-4 w-4" />}
          {secondary.label}
        </Button>
      )}
    </div>
  </div>
);
