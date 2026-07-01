import React, { createContext, useContext, useState, useCallback } from 'react';
import { toast } from 'sonner';

interface ViewAsState {
  viewAsEmployeeId: string | null;
  viewAsName: string | null;
  isViewingAs: boolean;
  /**
   * True whenever a view-as session is active. In sandbox mode dialogs and
   * buttons work normally and local UI state can update, but mutation handlers
   * must skip the actual database write.
   */
  isSandbox: boolean;
  startViewAs: (employeeId: string, name: string) => void;
  exitViewAs: () => void;
  /**
   * Sandbox write interceptor. Returns true when the real DB write should be
   * skipped because a view-as session is active, showing a "not saved" toast.
   * Handlers should still update local React state so the change appears on
   * screen, then call this right before the Supabase call and bail if true.
   */
  guardWrite: () => boolean;
}

const ViewAsContext = createContext<ViewAsState | undefined>(undefined);

export const ViewAsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [viewAsEmployeeId, setViewAsEmployeeId] = useState<string | null>(null);
  const [viewAsName, setViewAsName] = useState<string | null>(null);

  const startViewAs = useCallback((employeeId: string, name: string) => {
    setViewAsEmployeeId(employeeId);
    setViewAsName(name);
  }, []);

  const exitViewAs = useCallback(() => {
    setViewAsEmployeeId(null);
    setViewAsName(null);
  }, []);

  const guardWrite = useCallback(() => {
    if (viewAsEmployeeId) {
      toast(`Sandbox preview — not saved. You're viewing as ${viewAsName}.`);
      return true;
    }
    return false;
  }, [viewAsEmployeeId, viewAsName]);

  return (
    <ViewAsContext.Provider
      value={{
        viewAsEmployeeId,
        viewAsName,
        isViewingAs: !!viewAsEmployeeId,
        isSandbox: !!viewAsEmployeeId,
        startViewAs,
        exitViewAs,
        guardWrite,
      }}
    >
      {children}
    </ViewAsContext.Provider>
  );
};

export const useViewAs = (): ViewAsState => {
  const ctx = useContext(ViewAsContext);
  if (!ctx) {
    throw new Error('useViewAs must be used within a ViewAsProvider');
  }
  return ctx;
};
