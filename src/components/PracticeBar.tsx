// The owner's practice switch (src/lib/practiceMode.ts), for superadmin
// accounts. On by default for one with no clients of its own (the owner's),
// so pressing anything changes no staff work; off by default for a superadmin
// who carries clients, whose work is real. Kept per account on this device.
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useIsSuperadmin } from '@/hooks/useIsSuperadmin';
import { setPractice } from '@/lib/practiceMode';
import { supabase } from '@/integrations/supabase/client';

const keyFor = (userId: string) => `practice-mode:${userId}`;

/** The saved choice, or null when none was made on this device. */
const readChoice = (userId: string): boolean | null => {
  try {
    const v = localStorage.getItem(keyFor(userId));
    return v === 'on' ? true : v === 'off' ? false : null;
  } catch {
    return null;
  }
};

export const PracticeBar: React.FC = () => {
  const { user } = useAuth();
  const { isSuperadmin } = useIsSuperadmin();
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!user || !isSuperadmin) return;
    const saved = readChoice(user.id);
    if (saved !== null) {
      setOn(saved);
      return;
    }
    // No choice yet: on for an account with no clients of its own.
    void (async () => {
      const { data: me } = await supabase.from('profiles').select('id').eq('user_id', user.id).maybeSingle();
      if (!me) return;
      const { count } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_employee_id', me.id)
        .is('deleted_at', null);
      setOn((count ?? 0) === 0);
    })();
  }, [user, isSuperadmin]);

  useEffect(() => {
    setPractice('switch', !!user && isSuperadmin && on);
    return () => setPractice('switch', false);
  }, [user, isSuperadmin, on]);

  if (!user || !isSuperadmin) return null;

  const toggle = () => {
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem(keyFor(user.id), next ? 'on' : 'off');
    } catch {
      // Kept for this visit only.
    }
  };

  return on ? (
    <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 flex items-center gap-3 rounded-full border border-amber-300 bg-amber-50 py-1.5 pl-4 pr-1.5 text-sm text-amber-900 shadow-md">
      <span>
        <span className="font-semibold">Practice mode:</span> nothing you do is saved
      </span>
      <button type="button" onClick={toggle} className="rounded-full bg-amber-900 px-3 py-1 text-xs font-medium text-white hover:bg-amber-800">
        Turn off
      </button>
    </div>
  ) : (
    <button
      type="button"
      onClick={toggle}
      title="Turn practice mode on: nothing you do is saved"
      className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground shadow-sm hover:text-foreground"
    >
      Practice mode off · Turn on
    </button>
  );
};
