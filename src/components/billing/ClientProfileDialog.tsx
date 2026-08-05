import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { hspDueDateFor } from '@/lib/billing';

interface ClientRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  county: string | null;
  member_id: string | null;
  insurance: string | null;
  level_of_need: string | null;
  status: string | null;
  approval_status: string | null;
  hsp_submitted: boolean | null;
  auth_30_start: string | null;
  auth_30_end: string | null;
  hsp_due_date: string | null;
  auth_30_number: string | null;
  auth_150_number: string | null;
  auth_180_number: string | null;
  auth_150_start: string | null;
  auth_150_end: string | null;
  auth_180_approved: boolean | null;
  auth_180_start: string | null;
  auth_180_end: string | null;
  mco_housing_manager: string | null;
  notes: string | null;
  assigned_employee_id: string | null;
}

interface EditableFields {
  auth_30_start: string;
  auth_30_number: string;
  auth_150_number: string;
  auth_180_number: string;
}

const fmt = (d?: string | null) => (d ? format(parseISO(d), 'MMM d, yyyy') : '—');

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="space-y-0.5">
    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="text-sm font-medium">{value ?? '—'}</p>
  </div>
);

export function ClientProfileDialog({ clientId, onClose }: { clientId: string | null; onClose: () => void }) {
  const [client, setClient] = useState<ClientRow | null>(null);
  const [staff, setStaff] = useState<string | null>(null);
  const [cycleCount, setCycleCount] = useState(0);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditableFields>({ auth_30_start: '', auth_30_number: '', auth_150_number: '', auth_180_number: '' });

  const load = async (id: string) => {
    const [{ data: c }, { count }] = await Promise.all([
      supabase.from('clients').select('*').eq('id', id).maybeSingle(),
      supabase.from('billing_cycles').select('id', { count: 'exact', head: true }).eq('client_id', id).eq('is_active', true),
    ]);
    const row = c as unknown as ClientRow | null;
    setClient(row);
    setCycleCount(count ?? 0);
    setForm({
      auth_30_start: row?.auth_30_start ?? '',
      auth_30_number: row?.auth_30_number ?? '',
      auth_150_number: row?.auth_150_number ?? '',
      auth_180_number: row?.auth_180_number ?? '',
    });
    if (row?.assigned_employee_id) {
      const { data: p } = await supabase.from('profiles').select('first_name,last_name,email').eq('id', row.assigned_employee_id).maybeSingle();
      setStaff(p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email : null);
    } else {
      setStaff(null);
    }
  };

  useEffect(() => {
    if (!clientId) { setClient(null); setEditing(false); return; }
    let cancelled = false;
    (async () => { if (!cancelled) await load(clientId); })();
    return () => { cancelled = true; };
  }, [clientId]);

  // The 30-day HSP window end date is the HSP due date — always derived.
  const derivedHspDue = hspDueDateFor(form.auth_30_start || null);

  const save = async () => {
    if (!clientId) return;
    setSaving(true);
    const { error } = await supabase
      .from('clients')
      .update({
        auth_30_start: form.auth_30_start || null,
        auth_30_end: derivedHspDue,
        hsp_due_date: derivedHspDue,
        auth_30_number: form.auth_30_number || null,
        auth_150_number: form.auth_150_number || null,
        auth_180_number: form.auth_180_number || null,
      } as never)
      .eq('id', clientId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Client profile saved.');
    setEditing(false);
    await load(clientId);
  };

  return (
    <Dialog open={!!clientId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {client ? `${client.first_name} ${client.last_name}` : 'Client profile'}
          </DialogTitle>
        </DialogHeader>
        {!client ? (
          <p className="text-sm text-muted-foreground">Loading client profile…</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{client.status ?? 'Unknown status'}</Badge>
              {client.approval_status && <Badge variant="outline">{client.approval_status}</Badge>}
              <Badge variant="outline">{client.level_of_need ? client.level_of_need.replace(' Level', '') + ' level of need' : 'Level of need not set'}</Badge>
              <Badge variant="outline">{cycleCount} active billing cycle{cycleCount === 1 ? '' : 's'}</Badge>
              {!editing && <Button size="sm" variant="outline" className="ml-auto" onClick={() => setEditing(true)}><Pencil className="mr-2 h-4 w-4" />Edit authorization details</Button>}
            </div>

            <section className="grid gap-4 sm:grid-cols-2">
              <Field label="Member ID" value={client.member_id} />
              <Field label="MCO" value={client.insurance} />
              <Field label="Assigned case manager" value={staff ?? 'Unassigned'} />
              <Field label="MCO housing manager" value={client.mco_housing_manager} />
              <Field label="Phone" value={client.phone} />
              <Field label="Email" value={client.email} />
              <Field label="County" value={client.county} />
              <Field label="Address" value={client.address} />
            </section>

            <section className="rounded-lg border p-4">
              <h3 className="mb-1 text-sm font-semibold">30-day HSP window (not billable)</h3>
              <p className="mb-3 text-xs text-muted-foreground">Every client relationship opens with a 30-day window. Its end date is the HSP due date and is calculated automatically. Billing only begins once the HSP is approved.</p>
              {editing ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>30-day window start</Label>
                    <Input type="date" value={form.auth_30_start} onChange={(e) => setForm((f) => ({ ...f, auth_30_start: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>HSP due date (calculated)</Label>
                    <Input value={derivedHspDue ? fmt(derivedHspDue) : '—'} readOnly className="bg-muted" />
                  </div>
                  <div className="space-y-1">
                    <Label>30-day auth number</Label>
                    <Input value={form.auth_30_number} onChange={(e) => setForm((f) => ({ ...f, auth_30_number: e.target.value }))} placeholder="Not entered" />
                  </div>
                  <div className="space-y-1">
                    <Label>150-day auth number</Label>
                    <Input value={form.auth_150_number} onChange={(e) => setForm((f) => ({ ...f, auth_150_number: e.target.value }))} placeholder="Not entered" />
                  </div>
                  <div className="space-y-1">
                    <Label>180-day auth number</Label>
                    <Input value={form.auth_180_number} onChange={(e) => setForm((f) => ({ ...f, auth_180_number: e.target.value }))} placeholder="Not entered" />
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="30-day window start" value={fmt(client.auth_30_start)} />
                  <Field label="HSP due date" value={fmt(client.hsp_due_date ?? client.auth_30_end ?? hspDueDateFor(client.auth_30_start))} />
                  <Field label="30-day auth number" value={client.auth_30_number} />
                  <Field label="150-day auth number" value={client.auth_150_number} />
                  <Field label="180-day auth number" value={client.auth_180_number} />
                </div>
              )}
            </section>

            <section className="rounded-lg border p-4">
              <h3 className="mb-3 text-sm font-semibold">Billing setup</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="HSP submitted" value={client.hsp_submitted ? 'Yes' : 'No'} />
                <Field label="180-day extension" value={client.auth_180_approved ? 'Approved' : 'Not approved'} />
                <Field label="HSP approval start" value={fmt(client.auth_150_start)} />
                <Field label="150-day end" value={fmt(client.auth_150_end)} />
                <Field label="180-day start" value={fmt(client.auth_180_start)} />
                <Field label="180-day end" value={fmt(client.auth_180_end)} />
              </div>
            </section>

            {client.notes && (
              <section>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{client.notes}</p>
              </section>
            )}

            {editing && (
              <div className="flex justify-end gap-2 border-t pt-4">
                <Button variant="outline" onClick={() => { setEditing(false); if (clientId) load(clientId); }}>Cancel</Button>
                <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
