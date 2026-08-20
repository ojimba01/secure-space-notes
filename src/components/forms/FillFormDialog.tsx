import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SignaturePad } from '@/components/forms/SignaturePad';
import {
  FORM_TEMPLATES,
  TEMPLATE_FORM_TYPES,
  formatFieldValue,
  type FieldDef,
  type FormDataMap,
  type FormTemplate,
  type TableRowValue,
} from '@/lib/formTemplates';
import type { FormType } from '@/lib/formSigning';
import type { FormRow } from '@/components/forms/FormsHub';
import { Plus, Save, Send, Trash2 } from 'lucide-react';

interface FillFormDialogProps {
  open: boolean;
  onClose: () => void;
  profileId: string;
  signerName: string;
  onSubmitted: () => void;
  /** When set, the dialog edits an existing draft / changes-requested form. */
  existing?: FormRow | null;
}

interface ClientOption {
  id: string;
  first_name: string;
  last_name: string;
}

const inputTypeFor = (kind: FieldDef['kind']) => {
  switch (kind) {
    case 'date':
      return 'date';
    case 'email':
      return 'email';
    case 'phone':
      return 'tel';
    case 'number':
    case 'currency':
      return 'number';
    default:
      return 'text';
  }
};

export const FillFormDialog: React.FC<FillFormDialogProps> = ({
  open,
  onClose,
  profileId,
  signerName,
  onSubmitted,
  existing,
}) => {
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState(existing?.client_id ?? '');
  const [formType, setFormType] = useState<FormType>(
    (existing?.form_type as FormType) ?? TEMPLATE_FORM_TYPES[0],
  );
  const [data, setData] = useState<FormDataMap>(
    (existing?.form_data as FormDataMap) ?? {},
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [signature, setSignature] = useState<string | null>(null);
  const [attested, setAttested] = useState(false);
  const [saving, setSaving] = useState(false);

  const template: FormTemplate | undefined = FORM_TEMPLATES[formType];
  const score = useMemo(
    () => (template?.scoring ? template.scoring(data) : null),
    [template, data],
  );

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: rows } = await supabase
        .from('clients')
        .select('id, first_name, last_name')
        .is('deleted_at', null)
        .order('last_name');
      setClients(rows ?? []);
    })();
  }, [open]);

  const setValue = (id: string, value: FormDataMap[string]) => {
    setData((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const validate = (forSubmit: boolean): boolean => {
    if (!template) return false;
    const fieldErrors: Record<string, string> = {};
    if (!clientId) fieldErrors.__client = 'Select a client';

    if (forSubmit) {
      for (const section of template.sections) {
        for (const field of section.fields) {
          if (!field.required) continue;
          const value = data[field.id];
          const empty =
            value === undefined ||
            value === '' ||
            (Array.isArray(value) && value.length === 0);
          if (empty) fieldErrors[field.id] = 'Required';
        }
      }
    }

    const crossErrors = forSubmit ? template.validate?.(data) ?? [] : [];
    setErrors(fieldErrors);

    if (Object.keys(fieldErrors).length > 0 || crossErrors.length > 0) {
      toast({
        title: 'Check the form',
        description:
          crossErrors[0] ??
          (fieldErrors.__client ?? 'Please complete all required fields (highlighted in red).'),
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const persist = async (status: 'draft' | 'submitted') => {
    if (!validate(status === 'submitted')) return;
    if (status === 'submitted') {
      if (!signature) {
        toast({ title: 'Add your signature before submitting', variant: 'destructive' });
        return;
      }
      if (!attested) {
        toast({ title: 'Confirm the attestation to submit', variant: 'destructive' });
        return;
      }
    }

    setSaving(true);
    try {
      const formData: FormDataMap = { ...data };
      if (status === 'submitted' && signature) {
        formData._signature = signature;
      }
      if (score) {
        formData._score_total = String(score.total);
        formData._score_category = score.category;
      }

      const payload = {
        client_id: clientId,
        employee_id: profileId,
        form_type: formType,
        title: formType,
        form_data: formData,
        status,
        signature_name: status === 'submitted' ? signerName : null,
        signed_by: status === 'submitted' ? profileId : null,
        signed_at: status === 'submitted' ? new Date().toISOString() : null,
      };

      const { error } = existing
        ? await supabase.from('client_forms').update(payload).eq('id', existing.id)
        : await supabase.from('client_forms').insert(payload);
      if (error) throw error;

      toast({
        title: status === 'submitted' ? 'Form submitted' : 'Draft saved',
        description:
          status === 'submitted'
            ? 'Your form is now awaiting manager approval.'
            : 'You can finish and submit it from the forms list.',
      });
      onSubmitted();
      onClose();
    } catch (err: any) {
      toast({ title: 'Could not save the form', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field: FieldDef) => {
    const error = errors[field.id];
    const labelClass = error ? 'text-destructive' : '';

    const body = (() => {
      switch (field.kind) {
        case 'text':
        case 'date':
        case 'email':
        case 'phone':
        case 'number':
        case 'currency':
          return (
            <Input
              id={field.id}
              type={inputTypeFor(field.kind)}
              min={field.kind === 'number' || field.kind === 'currency' ? 0 : undefined}
              step={field.kind === 'currency' ? '0.01' : undefined}
              value={(data[field.id] as string) ?? ''}
              placeholder={field.placeholder}
              onChange={(e) => setValue(field.id, e.target.value)}
              className={error ? 'border-destructive' : ''}
            />
          );
        case 'textarea':
          return (
            <Textarea
              id={field.id}
              value={(data[field.id] as string) ?? ''}
              placeholder={field.placeholder}
              onChange={(e) => setValue(field.id, e.target.value)}
              className={error ? 'border-destructive' : ''}
            />
          );
        case 'select':
          return (
            <Select
              value={(data[field.id] as string) ?? ''}
              onValueChange={(v) => setValue(field.id, v)}
            >
              <SelectTrigger className={error ? 'border-destructive' : ''}>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {field.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        case 'radio':
          return (
            <RadioGroup
              value={(data[field.id] as string) ?? ''}
              onValueChange={(v) => setValue(field.id, v)}
              className="space-y-1"
            >
              {field.options.map((o) => (
                <label
                  key={o.value}
                  className="flex items-start gap-2 text-sm font-normal cursor-pointer"
                >
                  <RadioGroupItem value={o.value} className="mt-0.5" />
                  <span>
                    {o.label}
                    {o.points !== undefined && (
                      <span className="text-muted-foreground"> ({o.points} {o.points === 1 ? 'point' : 'points'})</span>
                    )}
                  </span>
                </label>
              ))}
            </RadioGroup>
          );
        case 'checkboxes': {
          const selected = (data[field.id] as string[]) ?? [];
          return (
            <div className="space-y-1">
              {field.options.map((o) => (
                <label
                  key={o.value}
                  className="flex items-start gap-2 text-sm font-normal cursor-pointer"
                >
                  <Checkbox
                    checked={selected.includes(o.value)}
                    onCheckedChange={(checked) =>
                      setValue(
                        field.id,
                        checked === true
                          ? [...selected, o.value]
                          : selected.filter((v) => v !== o.value),
                      )
                    }
                    className="mt-0.5"
                  />
                  <span>
                    {o.label}
                    {o.points !== undefined && (
                      <span className="text-muted-foreground"> ({o.points} {o.points === 1 ? 'point' : 'points'})</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          );
        }
        case 'table': {
          const rows = (data[field.id] as TableRowValue[]) ?? [];
          return (
            <div className="space-y-2">
              {rows.map((row, index) => (
                <div key={index} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      {index + 1}.
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setValue(field.id, rows.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {field.columns.map((col) => (
                      <div key={col.id} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{col.label}</Label>
                        <Input
                          type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                          value={row[col.id] ?? ''}
                          onChange={(e) =>
                            setValue(
                              field.id,
                              rows.map((r, i) =>
                                i === index ? { ...r, [col.id]: e.target.value } : r,
                              ),
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {(!field.maxRows || rows.length < field.maxRows) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setValue(field.id, [...rows, {}])}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {field.addLabel ?? 'Add row'}
                </Button>
              )}
            </div>
          );
        }
      }
    })();

    return (
      <div key={field.id} className="space-y-1.5">
        <Label htmlFor={field.id} className={labelClass}>
          {field.label}
          {field.required && <span className="text-destructive"> *</span>}
        </Label>
        {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
        {body}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  };

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existing ? `Edit — ${formType}` : 'Fill out a form'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className={errors.__client ? 'text-destructive' : ''}>
                Client <span className="text-destructive">*</span>
              </Label>
              <Select
                value={clientId}
                onValueChange={(v) => {
                  setClientId(v);
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.__client;
                    return next;
                  });
                }}
                disabled={!!existing}
              >
                <SelectTrigger className={errors.__client ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.last_name}, {c.first_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Form template</Label>
              <Select
                value={formType}
                onValueChange={(v) => {
                  setFormType(v as FormType);
                  setData({});
                  setErrors({});
                }}
                disabled={!!existing}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_FORM_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-sm text-muted-foreground border-l-2 pl-3">{template.intro}</p>

          {existing?.status === 'changes_requested' && existing.review_note && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <div className="text-xs font-medium">Reviewer requested changes</div>
              <p className="text-sm">{existing.review_note}</p>
            </div>
          )}

          {template.sections.map((section) => (
            <Card key={section.id} className="p-4 space-y-4">
              <div>
                <h3 className="font-semibold">{section.title}</h3>
                {section.description && (
                  <p className="text-xs text-muted-foreground mt-1">{section.description}</p>
                )}
              </div>
              {section.fields.map(renderField)}
            </Card>
          ))}

          {score && (
            <Card className="p-4 space-y-2 border-primary/40">
              <h3 className="font-semibold">Score summary</h3>
              <div className="flex items-baseline gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Total score</div>
                  <div className="text-2xl font-semibold">{score.total}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Level of need category</div>
                  <div className="text-lg font-medium">{score.category}</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Scoring rubric: 1–17 points = Low level of need · 18+ points = High level of need.
                Points update automatically as answers are selected.
              </p>
            </Card>
          )}

          <div className="space-y-3 border-t pt-4">
            <SignaturePad onChange={setSignature} />
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={attested}
                onCheckedChange={(v) => setAttested(v === true)}
                className="mt-0.5"
              />
              <span>I attest this form is complete and accurate.</span>
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => persist('draft')} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            Save draft
          </Button>
          <Button onClick={() => persist('submitted')} disabled={saving}>
            <Send className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Sign and submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Read-only rendering of a structured submission, used by the detail dialog. */
export const FormDataSummary: React.FC<{ formType: string; data: FormDataMap }> = ({
  formType,
  data,
}) => {
  const template = FORM_TEMPLATES[formType as FormType];
  if (!template) return null;
  const score = template.scoring ? template.scoring(data) : null;

  return (
    <div className="space-y-4">
      {score && (
        <div className="rounded-md border border-primary/40 p-3 flex items-baseline gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Total score</div>
            <div className="text-xl font-semibold">{score.total}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Level of need</div>
            <div className="font-medium">{score.category}</div>
          </div>
        </div>
      )}
      {template.sections.map((section) => (
        <div key={section.id} className="space-y-2">
          <h4 className="text-sm font-semibold border-b pb-1">{section.title}</h4>
          {section.fields.map((field) => {
            if (field.kind === 'table') {
              const rows = (data[field.id] as TableRowValue[]) ?? [];
              if (!rows.length) return null;
              return (
                <div key={field.id} className="space-y-1">
                  <div className="text-xs text-muted-foreground">{field.label}</div>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 text-left">
                        <tr>
                          {field.columns.map((c) => (
                            <th key={c.id} className="px-2 py-1 font-medium">
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={i} className="border-t">
                            {field.columns.map((c) => (
                              <td key={c.id} className="px-2 py-1">
                                {row[c.id] || '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            }
            return (
              <div key={field.id} className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm">
                <div className="text-xs text-muted-foreground">{field.label}</div>
                <div>{formatFieldValue(field, data[field.id])}</div>
              </div>
            );
          })}
        </div>
      ))}
      {typeof data._signature === 'string' && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Employee signature</div>
          <img
            src={data._signature}
            alt="Signature"
            className="h-20 rounded-md border bg-white"
          />
        </div>
      )}
    </div>
  );
};
