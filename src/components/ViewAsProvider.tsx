import React, { createContext, useContext, useState, useCallback } from 'react';
import { toast } from 'sonner';

interface ViewAsState {
  viewAsEmployeeId: string | null;
  viewAsName: string | null;
  isViewingAs: boolean;
  startViewAs: (employeeId: string, name: string) => void;
  exitViewAs: () => void;
  /**
   * Read-only write guard. Returns true and shows a toast when a mutation
   * should be blocked because a view-as session is active. Components call
   * this at the top of any create/edit/delete handler as defense in depth.
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
      toast(`Read-only — you're viewing as ${viewAsName}. Exit to make changes.`);
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
