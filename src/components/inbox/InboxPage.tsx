// Inbox: everything a person needs to know about their work, in one place.
//
//   Staff:  comments on their forms, and the changes a supervisor made to
//           them (tracked changes: each answer before and after), and intake
//           calls sent to them.
//   Admins: forms staff have submitted or updated, to review.
//
// Selecting a notice shows it in full, with the form one press away. Built on
// notifications and form_corrections (src/lib/formComments.ts).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import { FileCheck2, Inbox, MessageSquareWarning, PencilLine, PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { TemplateFillDialog } from '@/components/forms/TemplateFillDialog';
import type { FormRow } from '@/components/forms/FormsHub';
import {
  loadFormComments,
  loadNotifications,
  markNotificationsRead,
  type AppNotification,
  type FormComment,
} from '@/lib/formComments';

const ICON: Record<AppNotification['kind'], { icon: typeof Inbox; cls: string }> = {
  form_comment: { icon: MessageSquareWarning, cls: 'text-amber-700' },
  form_corrected: { icon: PencilLine, cls: 'text-primary' },
  intake_assigned: { icon: PhoneCall, cls: 'text-green-700' },
  form_submitted: { icon: FileCheck2, cls: 'text-blue-700' },
};

const FORM_COLUMNS =
  'id, client_id, employee_id, form_type, title, file_path, original_file_path, status, signature_name, signed_at, approved_at, review_note, created_at, form_data, clients(first_name, last_name)';

/** Tell the menu and the bell that what is read has changed. */
export const notificationsChanged = () => window.dispatchEvent(new Event('notifications-changed'));

export const InboxPage: React.FC<{ onOpenClient: (clientId: string) => void }> = ({ onOpenClient }) => {
  const profileId = useEffectiveProfileId();
  const location = useLocation();
  const asked = (location.state as { notificationId?: string } | null)?.notificationId ?? null;
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(asked);
  const [comments, setComments] = useState<FormComment[]>([]);
  const [form, setForm] = useState<FormRow | null>(null);
  const [opening, setOpening] = useState(false);
  const [signerName, setSignerName] = useState('');

  const load = useCallback(async () => {
    if (!profileId) return;
    setItems(await loadNotifications(profileId, 200).catch(() => []));
  }, [profileId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (asked) setSelectedId(asked);
  }, [asked]);

  useEffect(() => {
    if (!profileId) return;
    void supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', profileId)
      .maybeSingle()
      .then(({ data }) => setSignerName(`${data?.first_name ?? ''} ${data?.last_name ?? ''}`.trim()));
  }, [profileId]);

  const selected = useMemo(() => (items ?? []).find((n) => n.id === selectedId) ?? null, [items, selectedId]);
  const shown = (items ?? []).filter((n) => filter === 'all' || !n.read_at);
  const unread = (items ?? []).filter((n) => !n.read_at).length;

  // Opening a notice reads it, and loads its form and that form's open comments.
  useEffect(() => {
    if (!selected) return;
    if (!selected.read_at) {
      void markNotificationsRead([selected.id]).then(() => {
        notificationsChanged();
        void load();
      });
    }
    setComments([]);
    setForm(null);
    if (!selected.client_form_id) return;
    void loadFormComments(selected.client_form_id)
      .then((c) => setComments(c.filter((x) => !x.resolved_at)))
      .catch(() => setComments([]));
    void supabase
      .from('client_forms')
      .select(FORM_COLUMNS)
      .eq('id', selected.client_form_id)
      .maybeSingle()
      .then(({ data }) => setForm((data as unknown as FormRow) ?? null));
  }, [selected, load]);

  const markAllRead = async () => {
    const ids = (items ?? []).filter((n) => !n.read_at).map((n) => n.id);
    await markNotificationsRead(ids);
    notificationsChanged();
    void load();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-primary md:text-3xl">Inbox</h1>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={() => void markAllRead()}>
            Mark all read
          </Button>
        )}
      </div>

      <div className="flex gap-2" role="tablist" aria-label="Show">
        {(
          [
            ['all', 'All'],
            ['unread', `Unread ${unread}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={`rounded-full border px-3 py-1.5 text-sm ${filter === key ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="max-h-[70vh] divide-y overflow-y-auto rounded-lg border bg-background">
          {items === null ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Loading.</p>
          ) : shown.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{filter === 'unread' ? 'Nothing unread.' : 'Your inbox is empty.'}</p>
          ) : (
            shown.map((n) => {
              const { icon: Icon, cls } = ICON[n.kind] ?? ICON.form_comment;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setSelectedId(n.id)}
                  className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-muted/50 ${
                    n.id === selectedId ? 'bg-primary/10' : n.read_at ? '' : 'bg-amber-50/60'
                  }`}
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cls}`} />
                  <span className="min-w-0">
                    <span className={`block truncate text-sm ${n.read_at ? '' : 'font-semibold'}`}>{n.title}</span>
                    {n.body && <span className="block truncate text-sm text-muted-foreground">{n.body}</span>}
                    <span className="block text-xs text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="rounded-lg border bg-background p-4">
          {!selected ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Select a message.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">{selected.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {selected.body ? `${selected.body} · ` : ''}
                  {format(new Date(selected.created_at), 'MMM d, yyyy h:mm a')}
                </p>
              </div>

              {selected.kind === 'form_corrected' && selected.details?.changes?.length ? (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full table-fixed text-left text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="w-2/5 px-3 py-2 font-medium">Question</th>
                        <th className="px-3 py-2 font-medium">Before</th>
                        <th className="px-3 py-2 font-medium">After</th>
                      </tr>
                    </thead>
                    <tbody className="align-top">
                      {selected.details.changes.map((c) => (
                        <tr key={c.field} className="border-t">
                          <td className="px-3 py-2 text-muted-foreground [overflow-wrap:anywhere]">{c.label}</td>
                          <td className="px-3 py-2 [overflow-wrap:anywhere]">
                            {c.before ? <span className="text-red-700 line-through">{c.before}</span> : <span className="text-muted-foreground">Blank</span>}
                          </td>
                          <td className="px-3 py-2 [overflow-wrap:anywhere]">
                            {c.after ? <span className="text-green-700">{c.after}</span> : <span className="text-muted-foreground">Blank</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {comments.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Comments to fix</h3>
                  {comments.map((c) => (
                    <div key={c.id} className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                      {c.field_label && <p className="font-medium">{c.field_label}</p>}
                      <p>{c.body}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {form && profileId && (
                  <Button onClick={() => setOpening(true)}>Open {form.form_type}</Button>
                )}
                {selected.client_id && (
                  <Button variant="outline" onClick={() => onOpenClient(selected.client_id!)}>
                    Open client
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {opening && form && profileId && (
        <TemplateFillDialog
          existing={form}
          profileId={profileId}
          signerName={signerName || 'Staff'}
          onClose={() => setOpening(false)}
          onSubmitted={() => void load()}
        />
      )}
    </div>
  );
};
