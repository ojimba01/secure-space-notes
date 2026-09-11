import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronLeft } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { SignatureManager } from '@/components/SignatureManager';
import { loadSignatures, signatureUrl } from '@/lib/signatures';
import {
  calendarFeedUrl,
  loadCalendarFeed,
  rotateCalendarFeedToken,
  setCalendarFeedNames,
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

  const toggleFeedNames = async (show: boolean) => {
    if (!feed) return;
    setFeed({ ...feed, showClientNames: show });
    try {
      await setCalendarFeedNames(show);
    } catch (e) {
      setFeed({ ...feed, showClientNames: !show });
      toast({ title: 'Could not save that', description: msg(e), variant: 'destructive' });
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
                    Put your touchpoints and appointments in the calendar you already use. Your
                    calendar decides how often to check for changes — usually a few hours, so treat
                    it as a reminder and the app as the record.
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

                  <label className="flex items-start gap-3 pt-1">
                    <Switch
                      checked={feed.showClientNames}
                      onCheckedChange={toggleFeedNames}
                      disabled={busy}
                      aria-label="Show client names in the calendar feed"
                    />
                    <span className="text-sm">
                      Show client names
                      <span className="block text-xs text-muted-foreground">
                        Off, an entry reads “Touchpoint (In person)” and names nobody. On, it
                        carries the client's name into whatever calendar you subscribed with —
                        only do that on an agency account, never a personal one.
                      </span>
                    </span>
                  </label>

                  <p className="text-xs text-muted-foreground">
                    Anyone who has this link can read your calendar without signing in, so do not
                    forward it. Replace it and the old one stops working immediately.
                    {feed.lastAccessedAt && (
                      <> Last read {new Date(feed.lastAccessedAt).toLocaleString()}.</>
                    )}
                  </p>
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
