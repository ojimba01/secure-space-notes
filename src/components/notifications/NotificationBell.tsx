// The notification center: a bell with the number unread, opening a list.
// Selecting one opens the client's record (src/lib/formComments.ts).
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Bell, MessageSquareWarning, PencilLine, PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { loadNotifications, markNotificationsRead, type AppNotification } from '@/lib/formComments';

export const NotificationBell: React.FC<{ className?: string }> = ({ className }) => {
  const profileId = useEffectiveProfileId();
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!profileId) return;
    try {
      setItems(await loadNotifications(profileId));
    } catch {
      // Kept as it was; the next check tries again.
    }
  }, [profileId]);

  // On arrival, every minute, and on coming back to the tab.
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    window.addEventListener('notifications-changed', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('notifications-changed', onFocus);
    };
  }, [load]);

  const unread = items.filter((n) => !n.read_at);

  const openItem = (n: AppNotification) => {
    setOpen(false);
    void markNotificationsRead([n.id]).then(() => {
      window.dispatchEvent(new Event('notifications-changed'));
      void load();
    });
    // The message in full, with its form, in the Inbox.
    navigate('/', { state: { view: 'inbox', notificationId: n.id } });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={`relative ${className ?? ''}`} title="Notifications" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-semibold">Notifications</p>
          {unread.length > 0 && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => void markNotificationsRead(unread.map((n) => n.id)).then(load)}
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No notifications.</p>
          ) : (
            items.map((n) => {
              const Icon = n.kind === 'form_corrected' ? PencilLine : n.kind === 'intake_assigned' ? PhoneCall : MessageSquareWarning;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openItem(n)}
                  className={`flex w-full gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-muted/50 ${n.read_at ? '' : 'bg-amber-50/60'}`}
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${n.kind === 'form_corrected' ? 'text-primary' : 'text-amber-700'}`} />
                  <span className="min-w-0">
                    <span className={`block text-sm ${n.read_at ? '' : 'font-semibold'}`}>{n.title}</span>
                    {n.body && <span className="block text-sm text-muted-foreground">{n.body}</span>}
                    <span className="block text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </span>
                  </span>
                  {!n.read_at && <span className="ml-auto mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-600" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
