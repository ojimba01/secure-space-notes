import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useRole } from '@/hooks/useRole';
import TutorialOverlay from '@/components/TutorialOverlay';
import { HelpGuide } from '@/components/HelpGuide';
import { TUTORIALS, type TutorialDefinition } from '@/lib/tutorials';

interface TutorialContextType {
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

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

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

const doneStorageKey = (userId: string, key: string) =>
  `ss_tutorial_done::${userId}::${key}`;

export const TutorialProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const [activePage, setActivePageState] = useState<string | null>(null);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const autoRunTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setActivePage = useCallback((key: string | null) => {
    setActivePageState(key);
  }, []);

  const isCompleted = useCallback(
    (key: string) => {
      if (!user) return true;
      try {
        return localStorage.getItem(doneStorageKey(user.id, key)) === '1';
      } catch {
        return false;
      }
    },
    [user],
  );

  const markCompleted = useCallback(
    (key: string) => {
      if (!user) return;
      try {
        localStorage.setItem(doneStorageKey(user.id, key), '1');
      } catch {
        /* ignore storage errors */
      }
    },
    [user],
  );

  const startTutorial = useCallback(
    (key?: string) => {
      const target = key ?? activePage;
      if (target && TUTORIALS[target]) {
        setHelpOpen(false);
        setRunningKey(target);
      }
    },
    [activePage],
  );

  const endTutorial = useCallback(() => {
    if (runningKey) markCompleted(runningKey);
    setRunningKey(null);
  }, [runningKey, markCompleted]);

  // First-use auto-run. Superadmin never auto-starts; admin/staff do, once per key.
  useEffect(() => {
    if (autoRunTimer.current) clearTimeout(autoRunTimer.current);
    if (roleLoading || !user || !activePage || runningKey || helpOpen) return;

    const def: TutorialDefinition | undefined = TUTORIALS[activePage];
    if (!def) return;
    if (!def.autoRunRoles.includes(role)) return; // excludes superadmin
    if (isCompleted(activePage)) return;

    autoRunTimer.current = setTimeout(() => {
      setRunningKey(activePage);
    }, 600);

    return () => {
      if (autoRunTimer.current) clearTimeout(autoRunTimer.current);
    };
  }, [activePage, role, roleLoading, user, runningKey, helpOpen, isCompleted]);

  return (
    <TutorialContext.Provider
      value={{
        setActivePage,
        startTutorial,
        endTutorial,
        openHelp: () => setHelpOpen(true),
        closeHelp: () => setHelpOpen(false),
        activeKey: activePage,
        isTutorialActive: !!runningKey,
      }}
    >
      {children}
      {runningKey && TUTORIALS[runningKey] && (
        <TutorialOverlay
          definition={TUTORIALS[runningKey]}
          onComplete={endTutorial}
          onSkip={endTutorial}
        />
      )}
      <HelpGuide
        open={helpOpen}
        role={role}
        onOpenChange={setHelpOpen}
        onStart={(key) => startTutorial(key)}
      />
    </TutorialContext.Provider>
  );
};
