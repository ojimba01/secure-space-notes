// Support tickets (docs/support-tickets.sql): opened from the Support button,
// answered on the Support tickets page.
import { supabase } from '@/integrations/supabase/client';

// The tables are newer than the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (table: string) => (supabase.from as any)(table);

export const BUCKET = 'support-attachments';

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const STATUS_CLASS: Record<TicketStatus, string> = {
  open: 'bg-amber-100 text-amber-900',
  in_progress: 'bg-sky-100 text-sky-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-muted text-muted-foreground',
};

export interface Attachment {
  path: string;
  kind: 'screenshot' | 'recording' | 'file';
  name?: string;
}

export interface Ticket {
  id: string;
  created_by: string;
  message: string;
  page_url: string | null;
  status: TicketStatus;
  attachments: Attachment[];
  created_at: string;
  updated_at: string;
  requester_seen_at: string;
  last_support_reply_at: string | null;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  author: string;
  body: string;
  from_support: boolean;
  attachments: Attachment[];
  created_at: string;
}

const TICKET_COLUMNS =
  'id, created_by, message, page_url, status, attachments, created_at, updated_at, requester_seen_at, last_support_reply_at';

/** A ticket has a reply the person has not read yet. */
export const hasNewReply = (t: Ticket) =>
  !!t.last_support_reply_at && t.last_support_reply_at > t.requester_seen_at;

/** Upload a screenshot, recording or file into the person's own folder. */
export async function uploadAttachment(
  userId: string,
  blob: Blob,
  kind: Attachment['kind'],
  name: string,
): Promise<Attachment> {
  const safe = name.replace(/[^a-z0-9._-]+/gi, '-').slice(-80) || 'file';
  const path = `${userId}/${crypto.randomUUID()}/${safe}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type || 'application/octet-stream' });
  if (error) throw new Error(error.message);
  return { path, kind, name };
}

/** Email support about a new ticket or a reply. Failing to email never fails the ticket. */
export async function notifySupport(ticketId: string, messageId?: string): Promise<void> {
  try {
    await supabase.functions.invoke('support-notify', { body: { ticketId, messageId } });
  } catch {
    // The ticket is saved and shows on the Support tickets page regardless.
  }
}

export async function openTicket(message: string, attachments: Attachment[]): Promise<Ticket> {
  const { data, error } = await db('support_tickets')
    .insert({
      message: message.trim(),
      attachments,
      page_url: window.location.href,
      user_agent: navigator.userAgent,
    })
    .select(TICKET_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  void notifySupport(data.id);
  return data as Ticket;
}

export async function loadMyTickets(userId: string): Promise<Ticket[]> {
  const { data } = await db('support_tickets')
    .select(TICKET_COLUMNS)
    .eq('created_by', userId)
    .order('updated_at', { ascending: false })
    .limit(50);
  return (data ?? []) as Ticket[];
}

export async function loadAllTickets(): Promise<Ticket[]> {
  const { data, error } = await db('support_tickets')
    .select(TICKET_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as Ticket[];
}

export async function loadMessages(ticketId: string): Promise<TicketMessage[]> {
  const { data } = await db('support_ticket_messages')
    .select('id, ticket_id, author, body, from_support, attachments, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  return (data ?? []) as TicketMessage[];
}

export async function reply(ticketId: string, body: string, fromSupport: boolean): Promise<void> {
  const { data, error } = await db('support_ticket_messages')
    .insert({ ticket_id: ticketId, body: body.trim(), from_support: fromSupport })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  if (!fromSupport) void notifySupport(ticketId, data.id);
}

export async function markSeen(ticketId: string): Promise<void> {
  await db('support_tickets').update({ requester_seen_at: new Date().toISOString() }).eq('id', ticketId);
}

export async function setStatus(ticketId: string, status: TicketStatus): Promise<void> {
  const { error } = await db('support_tickets').update({ status }).eq('id', ticketId);
  if (error) throw new Error(error.message);
}

export async function signedUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
