import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { TutorialProvider } from '@/components/TutorialProvider';
import { Sidebar } from "@/components/Sidebar";
import { ClientManagement } from "@/components/ClientManagement";
import { NotesHub } from "@/components/NotesHub";
import { CaseManagerCalendar } from "@/components/CaseManagerCalendar";
import { MyMonth } from "@/components/MyMonth";
import { useIsAdmin } from '@/hooks/useIsAdmin';

type View = 'compliance' | 'clients' | 'notes' | 'calendar';

const Index = () => {
  const { user, loading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [activeView, setActiveView] = useState<View>('compliance');
  const [clientsKey, setClientsKey] = useState(0);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [initialClientId, setInitialClientId] = useState<string | null>(null);
  const [defaultApplied, setDefaultApplied] = useState(false);

  // Non-admins land on My Month; admins keep the Clients list as their landing here.
  useEffect(() => {
    if (!adminLoading && !defaultApplied) {
      setActiveView(isAdmin ? 'clients' : 'compliance');
      setDefaultApplied(true);
    }
  }, [adminLoading, isAdmin, defaultApplied]);

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
      <div className="flex h-screen bg-background w-full overflow-hidden">
        <Sidebar activeView={activeView} onViewChange={handleViewChange} onOpenNote={handleOpenNote} />
        <main className="flex-1 overflow-y-auto min-w-0 pt-14 md:pt-0">
          {activeView === 'compliance' ? (
            <MyMonth onOpenClient={handleOpenClient} />
          ) : activeView === 'clients' ? (
            <ClientManagement
              key={clientsKey}
              initialClientId={initialClientId}
              onConsumeInitialClient={() => setInitialClientId(null)}
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
