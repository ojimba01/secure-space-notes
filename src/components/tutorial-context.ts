import { createContext, useContext, useEffect } from 'react';

export interface TutorialContextType {
  /** Declare which tutorial applies to the currently visible page. */
  setActivePage: (key: string | null) => void;
  /** Launch a specific tutorial, or the current page's tutorial when omitted. */
  startTutorial: (key?: string) => void;
  endTutorial: () => void;
  openHelp: () => void;
  closeHelp: () => void;
  activeKey: string | null;
  isTutorialActive: boolean;
}

export const TutorialContext = createContext<TutorialContextType | undefined>(
  undefined,
);

export const useTutorial = () => {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error('useTutorial must be used within a TutorialProvider');
  return ctx;
};

/** Registers the active tutorial for a page while it is mounted. */
export const usePageTutorial = (key: string | null) => {
  const { setActivePage } = useTutorial();
  useEffect(() => {
    setActivePage(key);
    return () => setActivePage(null);
  }, [key, setActivePage]);
};
