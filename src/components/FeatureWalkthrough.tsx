import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface Step {
  title: string;
  points: string[];
}

/** What every case manager has to know before touchpoints start counting. */
const STAFF_STEPS: Step[] = [
  {
    title: 'Touchpoints',
    points: [
      'A Low level client needs 2 contacts each 30-day cycle. A High level client needs 4.',
      'Your cycle runs from the client’s 30-day start date, not from the calendar month.',
      'Touchpoints only start counting from the date your administrator sets. Until then nothing is late.',
    ],
  },
  {
    title: 'Recording a touchpoint',
    points: [
      'Open Touchpoints, choose the client, and enter the date, the length and what happened.',
      'Record it on the day it happened. The cycle is judged on dates, not on when it was typed.',
      'A client with no 30-day start date has no cycle. Tell your administrator rather than guessing.',
    ],
  },
  {
    title: 'Forms and documents',
    points: [
      'Each client record has a Forms tab listing the four forms every client should have.',
      'A green check means the form is filed. A red X means it is not.',
      'A red X row offers three things: upload a document, Begin the form, or Mark as complete if it was done on paper.',
    ],
  },
  {
    title: 'Sending a form to an MCO',
    points: [
      'Only the IAT and the HSP are sent to an MCO. Everything else is your own record.',
      'Press Sent to MCO when it goes. Press Accepted by MCO or Denied by MCO when they answer.',
      'Remove a wrong document with the X. You will be asked to confirm.',
    ],
  },
  {
    title: 'Client intake and HMIS',
    points: [
      'Fill the Client Intake first. Its answers feed the other forms and the HMIS screen.',
      'The HMIS button at the top of a client record lists the HMIS boxes in order, with a copy button on each.',
      'An orange box is one to check before you paste it. A blank box is one you answer in HMIS.',
    ],
  },
];

/** Everything above, and the two screens only an administrator uses. */
const ADMIN_STEPS: Step[] = [
  ...STAFF_STEPS,
  {
    title: 'Billing',
    points: [
      'Billing runs in order: client details, then the clients to bill, then revenue.',
      'A claim can be filed for six months after its cycle ends. After that the money cannot be recovered.',
      'Clients whose windows have all closed are listed separately under Missed deadlines.',
    ],
  },
  {
    title: 'Availity',
    points: [
      'The Availity screens list the boxes in the order Availity asks for them.',
      'An orange box is one to check before pasting: the payer, gender, relationship and the diagnosis code.',
      'Every other box is either fixed or filled in by Availity. Press the copy button beside a box to take its value.',
    ],
  },
];

/**
 * The walkthrough, opened from the sidebar.
 *
 * It used to open itself the first time somebody signed in and refuse to close
 * until every step was acknowledged. That put a modal over the screen of
 * anybody being shown the site, so it is now only ever asked for.
 */
export const FeatureWalkthrough: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled || !data) return;
      setProfileId(data.id as string);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Somebody who has already been through it can ask for it again, from the
  // sidebar. Without this the only way back in was to clear their record.
  useEffect(() => {
    const replay = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener('show-new-features', replay);
    return () => window.removeEventListener('show-new-features', replay);
  }, []);

  const steps = isAdmin ? ADMIN_STEPS : STAFF_STEPS;
  const last = step === steps.length - 1;

  const acknowledge = async () => {
    if (!profileId) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ touchpoint_tutorial_acknowledged_at: new Date().toISOString() } as never)
      .eq('id', profileId);
    setSaving(false);
    if (error) return;
    setOpen(false);
  };

  const close = () => setOpen(false);

  if (!open) return null;
  const current = steps[step];

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>New features</DialogTitle>

        <p className="text-xs text-muted-foreground">
          Step {step + 1} of {steps.length}
        </p>

        <div className="space-y-3">
          <h3 className="text-base font-medium">{current.title}</h3>
          <ul className="space-y-2 text-sm">
            {current.points.map((p) => (
              <li key={p} className="flex gap-2">
                <span className="text-muted-foreground">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </Button>
          {last ? (
            <Button onClick={acknowledge} disabled={saving}>
              {saving ? 'Saving' : 'I have read this'}
            </Button>
          ) : (
            <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
