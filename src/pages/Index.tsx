import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { TutorialProvider } from '@/components/TutorialProvider';
import { Sidebar } from "@/components/Sidebar";
import { ClientManagement } from "@/components/ClientManagement";
import { NotesHub } from "@/components/NotesHub";
import { CaseManagerCalendar } from "@/components/CaseManagerCalendar";
import { StaffTouchpoints } from "@/components/StaffTouchpoints";
import { FormsHub } from "@/components/forms/FormsHub";
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { SuperadminTouchpoints } from '@/components/SuperadminTouchpoints';
import { useViewAs } from '@/components/ViewAsProvider';

type View = 'compliance' | 'clients' | 'notes' | 'calendar' | 'forms';

/**
 * Two different questions, so two views rather than one blended screen:
 * "how is the whole agency doing" and "what do I personally owe this week".
 * Admins and superadmins need both; staff only ever see the second.
 */
const TouchpointViews: React.FC<{ onOpenClient: (id: string) => void }> = ({ onOpenClient }) => {
  const [view, setView] = useState<'oversight' | 'mine'>('oversight');

  const Tab: React.FC<{ id: 'oversight' | 'mine'; label: string; hint: string }> = ({ id, label, hint }) => (
    <button
      onClick={() => setView(id)}
      aria-pressed={view === id}
      className={`rounded-md px-3 py-1.5 text-left transition-colors ${
        view === id ? 'bg-background shadow-sm' : 'hover:bg-background/60'
      }`}
    >
      <div className="text-sm font-medium">{label}</div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </button>
  );

  return (
    <div>
      <div className="px-6 pt-6">
        <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
          <Tab id="oversight" label="Oversight" hint="Every case manager" />
          <Tab id="mine" label="My caseload" hint="Clients assigned to me" />
        </div>
      </div>
      {view === 'oversight'
        ? <SuperadminTouchpoints onOpenClient={onOpenClient} />
        : <StaffTouchpoints onOpenClient={onOpenClient} />}
    </div>
  );
};

const Index = () => {
  const { user, loading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { isViewingAs } = useViewAs();
  const location = useLocation();
  const [activeView, setActiveView] = useState<View>('compliance');
  const [clientsKey, setClientsKey] = useState(0);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [initialClientId, setInitialClientId] = useState<string | null>(null);
  const [initialClientTab, setInitialClientTab] = useState<string | undefined>(undefined);
  const [defaultApplied, setDefaultApplied] = useState(false);
  const [wasViewingAs, setWasViewingAs] = useState(false);

  // Honor a view requested by another page (for example the admin sidebar).
  useEffect(() => {
    const state = location.state as { view?: View; noteId?: string } | null;
    if (state?.view) {
      setActiveView(state.view);
      setDefaultApplied(true);
      if (state.noteId) setSelectedNoteId(state.noteId);
    }
  }, [location.state]);

  // Non-admins land on My Month; admins keep the Clients list as their landing here.
  useEffect(() => {
    if (!adminLoading && !defaultApplied) {
      setActiveView(isAdmin ? 'clients' : 'compliance');
      setDefaultApplied(true);
    }
  }, [adminLoading, isAdmin, defaultApplied]);

  // Entering view-as lands on the employee's My Month; exiting returns to Clients.
  useEffect(() => {
    if (isViewingAs && !wasViewingAs) {
      setActiveView('compliance');
      setWasViewingAs(true);
    } else if (!isViewingAs && wasViewingAs) {
      setActiveView('clients');
      setWasViewingAs(false);
    }
  }, [isViewingAs, wasViewingAs]);

  const handleViewChange = (view: View) => {
    if (view === 'clients') {
      setClientsKey((k) => k + 1);
    }
    setActiveView(view);
  };

  const handleOpenNote = (noteId: string) => {
    setSelectedNoteId(noteId);
    setActiveView('notes');
  };

  const handleOpenClient = (clientId: string) => {
    setInitialClientId(clientId);
    setActiveView('clients');
  };

  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    if (user) {
      checkOnboardingStatus();
    } else {
      setCheckingOnboarding(false);
    }
  }, [user]);

  const checkOnboardingStatus = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_onboarding')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      setNeedsOnboarding(!data);
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      setNeedsOnboarding(false);
    } finally {
      setCheckingOnboarding(false);
    }
  };

  if (loading || checkingOnboarding) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <TutorialProvider>
      <div className={`flex h-screen bg-background w-full overflow-hidden ${isViewingAs ? 'pt-9' : ''}`}>
        <Sidebar activeView={activeView} onViewChange={handleViewChange} onOpenNote={handleOpenNote} />
        <main className="flex-1 overflow-y-auto min-w-0 pt-14 md:pt-0">
          {activeView === 'compliance' ? (
            /* Admins and superadmins carry caseloads of their own -- the two
               largest in the agency belong to them -- so they need the
               supervisory view *and* their own work queue, not one or the
               other. Staff see only their own queue, with no switcher. */
            isAdmin && !isViewingAs
              ? <TouchpointViews onOpenClient={handleOpenClient} />
              : <StaffTouchpoints onOpenClient={handleOpenClient} />
          ) : activeView === 'clients' ? (
            <ClientManagement
              key={clientsKey}
              initialClientId={initialClientId}
              initialTab={initialClientTab}
              onConsumeInitialClient={() => setInitialClientId(null)}
            />
          ) : activeView === 'forms' ? (
            <FormsHub
              onOpenClientIntake={(id) => {
                setInitialClientId(id);
                setInitialClientTab('intake');
                setActiveView('clients');
              }}
            />
          ) : activeView === 'calendar' ? (
            <CaseManagerCalendar />
          ) : (
            <NotesHub
              selectedNoteId={selectedNoteId}
              onClearSelected={() => setSelectedNoteId(null)}
            />
          )}
        </main>
      </div>
    </TutorialProvider>
  );
};

export default Index;
