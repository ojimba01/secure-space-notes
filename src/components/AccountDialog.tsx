import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { SignatureManager } from '@/components/SignatureManager';
import { loadSignatures, signatureUrl } from '@/lib/signatures';
import {
  calendarFeedUrl,
  loadCalendarFeed,
  rotateCalendarFeedToken,
  turnCalendarFeedOff,
  type CalendarFeed,
} from '@/lib/calendarFeed';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The heading over each part of the page, in the same voice throughout. */
const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
    {children}
  </h3>
);

/**
 * The person's own account: who they are, and the two things they can change.
 *
 * Laid out as separate sections, one job each, because a button sitting
 * directly under the password box reads as the button that changes the
 * password. The signature is a different job and now looks like one.
 *
 * The signature screens live here too. They were only reachable while filling
 * in a form, so somebody wanting to replace one had to start a form they did
 * not intend to submit.
 */
export const AccountDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
  const { user } = useAuth();
  const profileId = useEffectiveProfileId();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [signatures, setSignatures] = useState(false);
  /** The default mark, shown so the section says what is already saved. */
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  /** null while loading, false once we know there is no feed. */
  const [feed, setFeed] = useState<CalendarFeed | null | false>(null);
  const [copied, setCopied] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', user.id)
        .maybeSingle();
      setName(`${data?.first_name ?? ''} ${data?.last_name ?? ''}`.trim());
    })();
  }, [open, user]);

  // Re-read on every opening, so coming back from the signature screens shows
  // what was just saved rather than what was there before.
  useEffect(() => {
    if (!open || !profileId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await loadSignatures(profileId);
        if (cancelled) return;
        setSavedCount(list.length);
        const first = list.find((s) => s.isDefault) ?? list[0];
        const url = first ? await signatureUrl(first.imagePath) : null;
        if (cancelled) return;
        setPreview(url && first ? { url, label: first.label } : null);
      } catch {
        if (!cancelled) setSavedCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, profileId]);

  useEffect(() => {
    if (!open || !profileId) return;
    let cancelled = false;
    loadCalendarFeed(profileId)
      .then((f) => { if (!cancelled) setFeed(f ?? false); })
      .catch(() => { if (!cancelled) setFeed(false); });
    return () => { cancelled = true; };
  }, [open, profileId]);

  const turnFeedOn = async () => {
    setBusy(true);
    try {
      setFeed(await rotateCalendarFeedToken());
      toast({ title: 'Calendar link ready', description: 'Paste it into Outlook, Google or Apple Calendar.' });
    } catch (e) {
      toast({ title: 'Could not create the link', description: msg(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const replaceFeedLink = async () => {
    setBusy(true);
    try {
      setFeed(await rotateCalendarFeedToken());
      toast({
        title: 'Old link is dead',
        description: 'Anything still subscribed to it stops updating. Paste the new one in its place.',
      });
    } catch (e) {
      toast({ title: 'Could not replace it', description: msg(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const turnFeedOff = async () => {
    setBusy(true);
    try {
      await turnCalendarFeedOff();
      setFeed(false);
      toast({ title: 'Calendar link switched off', description: 'Every subscription to it has stopped.' });
    } catch (e) {
      toast({ title: 'Could not switch it off', description: msg(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const copyFeedUrl = async () => {
    if (!feed) return;
    try {
      await navigator.clipboard.writeText(calendarFeedUrl(feed.token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Could not copy', description: 'Select the link and copy it by hand.' });
    }
  };

  const changePassword = async () => {
    if (password.length < 8) {
      toast({ title: 'Use at least 8 characters', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast({ title: 'Could not change it', description: error.message, variant: 'destructive' });
      return;
    }
    setPassword('');
    toast({ title: 'Password changed' });
  };

  const sendRecovery = async () => {
    if (!user?.email) return;
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      toast({ title: 'Could not send it', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Recovery email sent', description: `Check ${user.email}.` });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md gap-0 p-0">
          <DialogHeader className="px-5 pb-4 pt-5 text-left">
            <DialogTitle>Your account</DialogTitle>
            <DialogDescription>{name || 'Signed in'}</DialogDescription>
          </DialogHeader>

          {/* One job to a section, each fenced off from the next. */}
          <div className="divide-y border-t">
            <section className="space-y-1 px-5 py-4">
              <SectionHeading>Signed in as</SectionHeading>
              <p className="text-sm">{user?.email}</p>
            </section>

            <section className="space-y-3 px-5 py-4">
              <SectionHeading>Password</SectionHeading>
              <Label htmlFor="account-password" className="sr-only">
                New password
              </Label>
              <Input
                id="account-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password, at least 8 characters"
                autoComplete="new-password"
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={changePassword} disabled={busy || !password}>
                  Change password
                </Button>
                <Button size="sm" variant="outline" onClick={sendRecovery} disabled={busy}>
                  Send a recovery email
                </Button>
              </div>
            </section>

            <section className="space-y-3 px-5 py-4">
              <SectionHeading>Calendar subscription</SectionHeading>
              {feed === null ? (
                <p className="text-sm text-muted-foreground">Loading</p>
              ) : feed === false ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    See your touchpoints in Outlook, Google or Apple Calendar. Changes appear
                    within a few hours, so check the app for anything urgent.
                  </p>
                  <Button size="sm" variant="outline" onClick={turnFeedOn} disabled={busy}>
                    Create my calendar link
                  </Button>
                </>
              ) : (
                <>
                  {/* Readable, selectable, and never a link you can click: opening
                      it in a browser downloads a file, which is not what anyone
                      wants and looks like the feature is broken. */}
                  <code className="block w-full break-all rounded border bg-muted/40 p-2 text-[11px] leading-relaxed">
                    {calendarFeedUrl(feed.token)}
                  </code>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={copyFeedUrl} disabled={busy}>
                      {copied ? 'Copied' : 'Copy link'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={replaceFeedLink} disabled={busy}>
                      Replace link
                    </Button>
                    <Button size="sm" variant="ghost" onClick={turnFeedOff} disabled={busy}>
                      Switch off
                    </Button>
                  </div>

                  {/* Subscribing is not downloading, and the difference is not
                      obvious: clicking the link gets you a file that never
                      updates, which looks like the feature working. So the
                      steps live here rather than in a document nobody opens. */}
                  <Collapsible open={howOpen} onOpenChange={setHowOpen}>
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-xs font-medium hover:bg-muted/50">
                      How to add this to your calendar
                      <ChevronDown
                        className={`h-4 w-4 opacity-60 transition-transform ${howOpen ? 'rotate-180' : ''}`}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-3 px-1 pt-3 text-xs">
                      <ol className="list-decimal space-y-1 pl-4">
                        <li>Copy the link above.</li>
                        <li>Open your calendar app.</li>
                        <li>Find the option to add a calendar from a web address.</li>
                        <li>Paste the link.</li>
                      </ol>

                      <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-amber-900">
                        <p className="font-medium">Do not open the link in your browser</p>
                        <p>
                          That downloads a one-time copy that never updates. Paste the link into
                          your calendar app instead.
                        </p>
                      </div>

                      <dl className="space-y-1.5 text-muted-foreground">
                        <div>
                          <dt className="font-medium text-foreground">Outlook (web)</dt>
                          <dd>Calendar → Add calendar → Subscribe from web</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-foreground">Outlook (desktop)</dt>
                          <dd>Account Settings → Internet Calendars → New</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-foreground">Google Calendar</dt>
                          <dd>Other calendars → + → From URL</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-foreground">Apple Calendar</dt>
                          <dd>File → New Calendar Subscription</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-foreground">iPhone</dt>
                          <dd>Settings → Calendar → Accounts → Add Account → Other</dd>
                        </div>
                      </dl>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Two warnings, not one paragraph. Somebody scanning this
                      needs to catch "work account" and "do not forward" without
                      reading a sentence that explains why either is true. */}
                  <div className="space-y-2 text-xs">
                    <div>
                      <p className="font-medium">Use your work account</p>
                      <p className="text-muted-foreground">
                        Entries include client names. Never subscribe with a personal account.
                      </p>
                    </div>
                    <div>
                      <p className="font-medium">Keep this link private</p>
                      <p className="text-muted-foreground">
                        Anyone with it can read your calendar without signing in. Do not forward
                        it. If it gets out, replace it — the old link stops working immediately.
                      </p>
                    </div>
                  </div>

                  {feed.lastAccessedAt && (
                    <p className="text-xs text-muted-foreground">
                      Last read {new Date(feed.lastAccessedAt).toLocaleString()}.
                    </p>
                  )}
                </>
              )}
            </section>

            <section className="space-y-3 px-5 py-4">
              <SectionHeading>Signature</SectionHeading>
              {preview ? (
                <div className="flex items-center gap-3">
                  <img
                    src={preview.url}
                    alt={preview.label}
                    className="h-10 w-28 rounded border bg-white object-contain"
                  />
                  <p className="min-w-0 truncate text-sm text-muted-foreground">
                    {savedCount && savedCount > 1
                      ? `${preview.label}, and ${savedCount - 1} more`
                      : preview.label}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {savedCount === null ? 'Loading' : 'Nothing saved yet.'}
                </p>
              )}
              {/* Not the full width of the section: a button that spans the
                  page reads as the one that finishes it. */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  setSignatures(true);
                }}
              >
                {savedCount ? 'Add or change' : 'Add a signature'}
              </Button>
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={signatures} onOpenChange={setSignatures}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto p-0">
          <DialogTitle className="sr-only">Your signature</DialogTitle>
          {/* The way back. Without it the only way out was to close the whole
              thing and open the account again. */}
          <div className="px-4 pb-1 pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSignatures(false);
                onOpenChange(true);
              }}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back to your account
            </Button>
          </div>
          <SignatureManager />
        </DialogContent>
      </Dialog>
    </>
  );
};
