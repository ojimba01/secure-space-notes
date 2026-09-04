import { supabase } from '@/integrations/supabase/client';

/**
 * Faxing a completed form to the MCO.
 *
 * Nothing here talks to the fax service. The account's keys are HTTP Basic
 * credentials for an outbound channel carrying a member's record, and anything
 * in this bundle is readable by anyone who opens the page, so the call goes to
 * an edge function that holds them.
 */

export type FaxStatus = 'queued' | 'sending' | 'sent' | 'failed';

/** What a form's fax columns say, for the row that shows it. */
export interface FaxState {
  fax_status?: FaxStatus | string | null;
  fax_to_number?: string | null;
  fax_requested_at?: string | null;
  fax_completed_at?: string | null;
  fax_error?: string | null;
}

export const FAX_STATUS_LABEL: Record<string, string> = {
  queued: 'Faxing',
  sending: 'Faxing',
  sent: 'Faxed',
  failed: 'Fax failed',
};

/** The columns a screen needs to show where a fax got to. */
export const FAX_COLUMNS =
  'fax_id, fax_status, fax_to_number, fax_requested_at, fax_completed_at, fax_error';

/**
 * As it should be read aloud and dialled: (201) 555-0134.
 *
 * A fax number is checked by a person against a letterhead, and a wall of
 * digits is checked badly.
 */
export const formatFaxNumber = (raw: string | null | undefined): string => {
  const d = (raw ?? '').replace(/\D+/g, '');
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  if (ten.length !== 10) return raw ?? '';
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
};

/** Ten digits, or eleven starting with the country code. */
export const isSendableFaxNumber = (raw: string): boolean => {
  const d = raw.replace(/\D+/g, '');
  return d.length === 10 || (d.length === 11 && d.startsWith('1'));
};

/** The number each MCO takes its faxes on, by MCO name. */
export async function loadMcoFaxNumbers(): Promise<Record<string, string>> {
  const { data, error } = await (supabase as unknown as {
    from: (t: string) => ReturnType<typeof supabase.from>;
  })
    .from('mco_fax_numbers')
    .select('mco, fax_number');
  if (error) throw new Error(error.message);
  return Object.fromEntries(
    ((data ?? []) as Record<string, string>[]).map((r) => [r.mco, r.fax_number]),
  );
}

export interface SendFaxRequest {
  formId: string;
  toNumber: string;
  toName?: string;
  note?: string;
  /** Set to keep this number against the MCO for next time. Admins only. */
  saveNumberForMco?: string;
}

/**
 * Send it, and say plainly what came back.
 *
 * Queued is the honest answer: the fax service has taken the form, and whether
 * a machine answered at the other end arrives minutes later on the webhook.
 */
export async function sendFax(
  req: SendFaxRequest,
): Promise<{ faxId: string; warning?: string }> {
  const { data, error } = await supabase.functions.invoke('fax-send', { body: req });

  if (error) {
    // The function answers a refusal with a plain sentence in `error`. Reading
    // it out beats "Edge Function returned a non-2xx status code".
    let detail = '';
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        detail = (await ctx.clone().json())?.error ?? '';
      }
    } catch {
      // Fall through to the generic message.
    }
    throw new Error(detail || error.message || 'The fax could not be sent.');
  }
  if (data?.error) throw new Error(data.error);
  return { faxId: String(data?.faxId ?? ''), warning: data?.warning };
}
