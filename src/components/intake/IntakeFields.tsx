// The handful of field shapes the intake form uses over and over.
//
// Questions keep the paper form's numbering so staff can work from the page in
// front of them and land on the same question here.

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';

interface QuestionProps {
  /** The number on the paper form. Omitted for the unnumbered header fields. */
  number?: number;
  label: string;
  hint?: string;
  children: React.ReactNode;
}

export const Question: React.FC<QuestionProps> = ({ number, label, hint, children }) => (
  <div className="space-y-2 border-b pb-4 last:border-b-0 last:pb-0">
    <div>
      <p className="text-sm font-medium">
        {number !== undefined && <span className="text-muted-foreground">{number}. </span>}
        {label}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
    {children}
  </div>
);

interface TextFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'date' | 'tel';
  className?: string;
}

export const TextField: React.FC<TextFieldProps> = ({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  className,
}) => (
  <div className={`space-y-1 ${className ?? ''}`}>
    {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
    <Input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

interface AreaFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}

export const AreaField: React.FC<AreaFieldProps> = ({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}) => (
  <div className="space-y-1">
    {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
    <Textarea
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

interface MoneyFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
}

export const MoneyField: React.FC<MoneyFieldProps> = ({ label, value, onChange }) => (
  <div className="space-y-1">
    {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        $
      </span>
      <Input
        inputMode="decimal"
        className="pl-6"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  </div>
);

interface YesNoProps {
  value: boolean | null | undefined;
  onChange: (value: boolean | null) => void;
}

/**
 * Yes / No, with no default. An unanswered question stays unanswered — the
 * paper form has plenty of blanks and the app should not invent a "No".
 */
export const YesNo: React.FC<YesNoProps> = ({ value, onChange }) => (
  <div className="flex items-center gap-2">
    <Button
      type="button"
      size="sm"
      variant={value === true ? 'default' : 'outline'}
      onClick={() => onChange(value === true ? null : true)}
    >
      Yes
    </Button>
    <Button
      type="button"
      size="sm"
      variant={value === false ? 'default' : 'outline'}
      onClick={() => onChange(value === false ? null : false)}
    >
      No
    </Button>
    {value !== null && value !== undefined && (
      <button
        type="button"
        className="text-xs text-muted-foreground underline"
        onClick={() => onChange(null)}
      >
        clear
      </button>
    )}
  </div>
);

interface ChoiceFieldProps {
  options: readonly string[];
  value: string | null | undefined;
  onChange: (value: string | null) => void;
}

/** One of a fixed list. Clicking the selected option clears it. */
export const ChoiceField: React.FC<ChoiceFieldProps> = ({ options, value, onChange }) => (
  <div className="flex flex-wrap gap-2">
    {options.map((option) => (
      <Button
        key={option}
        type="button"
        size="sm"
        variant={value === option ? 'default' : 'outline'}
        onClick={() => onChange(value === option ? null : option)}
      >
        {option}
      </Button>
    ))}
  </div>
);

interface MultiChoiceFieldProps {
  options: readonly string[];
  values: string[];
  onChange: (values: string[]) => void;
  columns?: number;
}

export const MultiChoiceField: React.FC<MultiChoiceFieldProps> = ({
  options,
  values,
  onChange,
  columns = 2,
}) => {
  const toggle = (option: string) =>
    onChange(values.includes(option) ? values.filter((v) => v !== option) : [...values, option]);

  return (
    <div
      className={`grid gap-2 ${columns === 3 ? 'sm:grid-cols-3' : columns === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-2'}`}
    >
      {options.map((option) => (
        <label key={option} className="flex items-center gap-2 text-sm">
          <Checkbox checked={values.includes(option)} onCheckedChange={() => toggle(option)} />
          {option}
        </label>
      ))}
    </div>
  );
};

/** A row of fields that belong to one question, e.g. name / phone / practice. */
export const FieldRow: React.FC<{ children: React.ReactNode; columns?: number }> = ({
  children,
  columns = 3,
}) => (
  <div
    className={`grid gap-3 ${columns === 2 ? 'sm:grid-cols-2' : columns === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}
  >
    {children}
  </div>
);
