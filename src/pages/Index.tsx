import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from "@/components/Sidebar";
import { ClientManagement } from "@/components/ClientManagement";
import { NoteEditor } from "@/components/NoteEditor";
import { CaseManagerCalendar } from "@/components/CaseManagerCalendar";

const Index = () => {
  const { user, loading } = useAuth();
  const [activeView, setActiveView] = useState<'clients' | 'notes' | 'calendar'>('clients');
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
    <div className="flex min-h-screen bg-background">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="flex-1 overflow-y-auto">
        {activeView === 'clients' ? (
          <ClientManagement />
        ) : activeView === 'calendar' ? (
          <CaseManagerCalendar />
        ) : (
          <div className="p-6">
            <h1 className="text-3xl font-bold mb-6">Note Editor</h1>
            <NoteEditor />
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
