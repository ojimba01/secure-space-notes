import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { TutorialProvider } from '@/components/TutorialProvider';
import { Sidebar } from "@/components/Sidebar";
import { ClientManagement } from "@/components/ClientManagement";
import { NotesHub } from "@/components/NotesHub";
import { CaseManagerCalendar } from "@/components/CaseManagerCalendar";

const Index = () => {
  const { user, loading } = useAuth();
  const [activeView, setActiveView] = useState<'clients' | 'notes' | 'calendar'>('clients');
  const [clientsKey, setClientsKey] = useState(0);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const handleViewChange = (view: 'clients' | 'notes' | 'calendar') => {
    if (view === 'clients') {
      // Always reset client management to the list (clear selected client)
      setClientsKey((k) => k + 1);
    }
    setActiveView(view);
  };

  const handleOpenNote = (noteId: string) => {
    setSelectedNoteId(noteId);
    setActiveView('notes');
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
      
      // If no record exists, user needs onboarding
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
        <Sidebar activeView={activeView} onViewChange={handleViewChange} />
        <main className="flex-1 overflow-y-auto min-w-0 pt-14 md:pt-0">
          {activeView === 'clients' ? (
            <ClientManagement key={clientsKey} />
          ) : activeView === 'calendar' ? (
            <CaseManagerCalendar />
          ) : (
            <div className="p-3 md:p-6">
              <h1 className="text-xl md:text-3xl font-bold mb-3 md:mb-6">Notes</h1>
              <NoteEditor />
            </div>
          )}
        </main>
      </div>
    </TutorialProvider>
  );
};

export default Index;
