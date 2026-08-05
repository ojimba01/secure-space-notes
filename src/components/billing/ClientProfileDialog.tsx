import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

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
  auth_150_start: string | null;
  auth_150_end: string | null;
  auth_180_approved: boolean | null;
  auth_180_start: string | null;
  auth_180_end: string | null;
  mco_housing_manager: string | null;
  notes: string | null;
  assigned_employee_id: string | null;
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

  useEffect(() => {
    if (!clientId) { setClient(null); return; }
    let cancelled = false;
    (async () => {
      const [{ data: c }, { count }] = await Promise.all([
        supabase.from('clients').select('*').eq('id', clientId).maybeSingle(),
        supabase.from('billing_cycles').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('is_active', true),
      ]);
      if (cancelled) return;
      const row = c as unknown as ClientRow | null;
      setClient(row);
      setCycleCount(count ?? 0);
      if (row?.assigned_employee_id) {
        const { data: p } = await supabase.from('profiles').select('first_name,last_name,email').eq('id', row.assigned_employee_id).maybeSingle();
        if (!cancelled) setStaff(p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email : null);
      } else {
        setStaff(null);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

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
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{client.status ?? 'Unknown status'}</Badge>
              {client.approval_status && <Badge variant="outline">{client.approval_status}</Badge>}
              <Badge variant="outline">{client.level_of_need ? client.level_of_need.replace(' Level', '') + ' level of need' : 'Level of need not set'}</Badge>
              <Badge variant="outline">{cycleCount} active billing cycle{cycleCount === 1 ? '' : 's'}</Badge>
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
