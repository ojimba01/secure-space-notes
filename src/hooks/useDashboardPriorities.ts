import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  ContactRow,
  requirementsForTier,
  hasValidTier,
  todayAgency,
  daysBetween,
  currentBillingWindow,
  contactsInWindow,
  windowProgress,
} from '@/lib/compliance';

export type PriorityKind =
  | 'billing_due_48'
  | 'billing_overdue'
  | 'hsp_to_submit'
  | 'touchpoints_due_48';

export interface PriorityItem {
  clientId: string;
  clientName: string;
  staffName: string | null;
  levelOfNeed: string | null;
  detail: string;
  dueDate: string | null;
}

export interface DashboardPriorities {
  loading: boolean;
  billingDue48: PriorityItem[];
  billingOverdue: PriorityItem[];
  hspToSubmit: PriorityItem[];
  touchpointsDue48: PriorityItem[];
  refresh: () => void;
}

const OPEN_CLAIM_STATUSES = new Set(['Not Billed', 'Ready to Bill']);

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function useDashboardPriorities(): DashboardPriorities {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<Omit<DashboardPriorities, 'loading' | 'refresh'>>({
    billingDue48: [],
    billingOverdue: [],
    hspToSubmit: [],
    touchpointsDue48: [],
  });

  const today = todayAgency();

  const load = useCallback(async () => {
    setLoading(true);

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email');
    const staffById: Record<string, string> = {};
    (profiles ?? []).forEach((p: any) => {
      staffById[p.id] = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email;
    });

    const { data: cls } = await supabase
      .from('clients')
      .select(
        'id, first_name, last_name, level_of_need, hsp_150_date, iat_date, hsp_due_date, status, approval_status, assigned_employee_id',
      )
      .eq('status', 'active');
    const clients = cls ?? [];
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const nameOf = (c: any) => `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
    const staffOf = (c: any) =>
      c.assigned_employee_id ? staffById[c.assigned_employee_id] ?? 'Unassigned' : 'Unassigned';

    // ---- Billing priorities -----------------------------------------
    const { data: cyc } = await supabase
      .from('billing_cycles')
      .select('client_id, cycle_number, cycle_end, billing_status, payment_status')
      .eq('is_active', true);
    const billingDue48: PriorityItem[] = [];
    const billingOverdue: PriorityItem[] = [];
    (cyc ?? []).forEach((cy: any) => {
      const client = clientById.get(cy.client_id);
      if (!client) return;
      const open =
        OPEN_CLAIM_STATUSES.has(cy.billing_status) && cy.payment_status !== 'Paid';
      if (!open) return;
      const daysToEnd = daysBetween(today, cy.cycle_end); // >0 future, <0 past
      const base: PriorityItem = {
        clientId: cy.client_id,
        clientName: nameOf(client),
        staffName: staffOf(client),
        levelOfNeed: client.level_of_need,
        detail: `Cycle ${cy.cycle_number} · ends ${fmtDate(cy.cycle_end)}`,
        dueDate: cy.cycle_end,
      };
      if (daysToEnd < 0) billingOverdue.push(base);
      else if (daysToEnd <= 2) billingDue48.push(base);
    });

    // ---- HSPs need to be submitted ----------------------------------
    const hspToSubmit: PriorityItem[] = clients
      .filter(
        (c: any) =>
          c.iat_date &&
          (c.approval_status === 'Not Submitted' || c.approval_status == null),
      )
      .map((c: any) => ({
        clientId: c.id,
        clientName: nameOf(c),
        staffName: staffOf(c),
        levelOfNeed: c.level_of_need,
        detail: `IAT ${fmtDate(c.iat_date)}${c.hsp_due_date ? ` · HSP due ${fmtDate(c.hsp_due_date)}` : ''}`,
        dueDate: c.hsp_due_date ?? null,
      }));

    // ---- Touchpoints due within 48h ---------------------------------
    const setupComplete = clients.filter(
      (c: any) => c.hsp_150_date && hasValidTier(c.level_of_need),
    );
    const ids = setupComplete.map((c: any) => c.id);
    const contactsByClient: Record<string, ContactRow[]> = {};
    if (ids.length) {
      const { data: cts } = await supabase
        .from('client_contacts')
        .select('id, client_id, contact_date, modality')
        .in('client_id', ids);
      (cts ?? []).forEach((c: any) => {
        (contactsByClient[c.client_id] ||= []).push({
          id: c.id,
          contact_date: c.contact_date,
          modality: c.modality,
        });
      });
    }
    const touchpointsDue48: PriorityItem[] = [];
    setupComplete.forEach((c: any) => {
      const window = currentBillingWindow(c.hsp_150_date, today);
      if (!window) return;
      const daysToEnd = daysBetween(today, window.end);
      if (daysToEnd < 0 || daysToEnd > 2) return; // ends within 48h only
      const req = requirementsForTier(c.level_of_need);
      const winContacts = contactsInWindow(contactsByClient[c.id] ?? [], window);
      const prog = windowProgress(req, winContacts);
      const missing =
        prog.contactDays < req.requiredContacts || prog.inPersonSpaced < req.requiredInPerson;
      if (!missing) return;
      touchpointsDue48.push({
        clientId: c.id,
        clientName: nameOf(c),
        staffName: staffOf(c),
        levelOfNeed: c.level_of_need,
        detail: `${prog.contactDays}/${req.requiredContacts} touchpoints · cycle ends ${fmtDate(window.end)}`,
        dueDate: window.end,
      });
    });

    const byDue = (a: PriorityItem, b: PriorityItem) =>
      (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
    billingDue48.sort(byDue);
    billingOverdue.sort(byDue);
    touchpointsDue48.sort(byDue);
    hspToSubmit.sort((a, b) => a.clientName.localeCompare(b.clientName));

    setState({ billingDue48, billingOverdue, hspToSubmit, touchpointsDue48 });
    setLoading(false);
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

  return { loading, refresh: load, ...state };
}
