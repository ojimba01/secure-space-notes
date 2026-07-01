import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BillingCycle,
  billingBadgeClass,
  paymentBadgeClass,
  formatMoney,
  totalsForCycles,
  nextBillDue,
  currentCycleNumber,
  isPastDue,
  rateForLevel,
} from '@/lib/billing';
import { BillingCycleDialog } from '@/components/billing/BillingCycleDialog';
import { RefreshCw } from 'lucide-react';

interface Props {
  clientId: string;
}

interface ClientInfo {
  first_name: string;
  last_name: string;
  insurance: string | null;
  member_id: string | null;
  level_of_need: string | null;
  auth_150_start: string | null;
}

export const ClientBillingTimeline: React.FC<Props> = ({ clientId }) => {
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [cycles, setCycles] = useState<BillingCycle[]>([]);
  const [editing, setEditing] = useState<BillingCycle | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data: c } = await supabase
      .from('clients')
      .select('first_name, last_name, insurance, member_id, level_of_need, auth_150_start')
      .eq('id', clientId)
      .maybeSingle();
    const { data: cyc } = await supabase
      .from('billing_cycles')
      .select('*')
      .eq('client_id', clientId)
      .order('cycle_number');
    setClient(c as ClientInfo);
    setCycles((cyc as BillingCycle[]) ?? []);
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!client) return null;

  const totals = totalsForCycles(cycles);
  const cur = currentCycleNumber(client.auth_150_start);
  const rate = rateForLevel(client.level_of_need);
  const currentPhase = cycles.find((c) => c.cycle_number === cur)?.phase ?? '—';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Billing timeline</CardTitle>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground pt-1">
          <span>MCO: <b className="text-foreground">{client.insurance ?? '—'}</b></span>
          <span>Member ID: <b className="text-foreground">{client.member_id ?? '—'}</b></span>
          <span>LoN: <b className="text-foreground">{client.level_of_need ?? '—'}</b>{rate ? ` (${formatMoney(rate)}/cycle)` : ''}</span>
          <span>Current phase: <b className="text-foreground">{currentPhase}</b></span>
          <span>Next bill due: <b className="text-foreground">{nextBillDue(cycles, client.auth_150_start) ?? '—'}</b></span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">Expected</div><div className="font-semibold">{formatMoney(totals.expected)}</div></div>
          <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">Billed</div><div className="font-semibold">{formatMoney(totals.billed)}</div></div>
          <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">Collected</div><div className="font-semibold text-green-600">{formatMoney(totals.collected)}</div></div>
          <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">Outstanding</div><div className="font-semibold text-amber-600">{formatMoney(totals.outstanding)}</div></div>
        </div>

        {cycles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No billing cycles yet. Set the 150-Day start date and regenerate.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {cycles.map((c) => {
              const pastDue = isPastDue(c);
              return (
                <button
                  key={c.id}
                  onClick={() => { setEditing(c); setOpen(true); }}
                  className={`min-w-[160px] shrink-0 rounded-lg border p-3 text-left transition-colors hover:bg-accent ${pastDue ? 'border-red-500 border-2' : ''} ${c.cycle_number === cur ? 'ring-2 ring-primary' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Cycle {c.cycle_number}</span>
                    <Badge variant="outline" className="text-[10px]">{c.phase}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{c.cycle_start} → {c.cycle_end}</div>
                  <div className="font-medium mt-1">{formatMoney(c.billed_amount)}</div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Badge className={billingBadgeClass(c.billing_status)}>{c.billing_status}</Badge>
                    <Badge className={paymentBadgeClass(c.payment_status)}>{c.payment_status}</Badge>
                  </div>
                  {pastDue && <div className="text-[10px] text-red-600 font-semibold mt-1">Past due</div>}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
      <BillingCycleDialog cycle={editing} open={open} onOpenChange={setOpen} onSaved={load} />
    </Card>
  );
};
