import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import TutorialOverlay from '@/components/TutorialOverlay';

interface TutorialContextType {
  isTutorialActive: boolean;
  startTutorial: () => void;
  endTutorial: () => void;
  hasCompletedTutorial: boolean;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export const useTutorial = () => {
  const context = useContext(TutorialContext);
  if (context === undefined) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
};

export const TutorialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isTutorialActive, setIsTutorialActive] = useState(false);
  const [hasCompletedTutorial, setHasCompletedTutorial] = useState(true);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (user) {
      checkTutorialStatus();
    }
  }, [user]);

  const checkTutorialStatus = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('user_tutorial_progress')
        .select('completed')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      
      // If no record or not completed, user hasn't done tutorial
      setHasCompletedTutorial(data?.completed ?? false);
      
      // Auto-start tutorial for first-time users (after onboarding)
      if (!data?.completed) {
        // Small delay to let the page render first
        setTimeout(() => {
          setIsTutorialActive(true);
        }, 500);
      }
    } catch (error) {
      console.error('Error checking tutorial status:', error);
    } finally {
      setChecked(true);
    }
  };

  const startTutorial = useCallback(() => {
    setIsTutorialActive(true);
  }, []);

  const endTutorial = useCallback(() => {
    setIsTutorialActive(false);
    setHasCompletedTutorial(true);
  }, []);

  return (
    <TutorialContext.Provider value={{ isTutorialActive, startTutorial, endTutorial, hasCompletedTutorial }}>
      {children}
      {isTutorialActive && (
        <TutorialOverlay onComplete={endTutorial} onSkip={endTutorial} />
      )}
    </TutorialContext.Provider>
  );
};
