import React, { createContext, useContext, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { setPreviewGuard } from '@/lib/previewGuard';

/** What the previewed person can open, so the preview matches their own view. */
export interface PreviewAccess {
  isAdmin: boolean;
  canViewStaffActivity: boolean;
}

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
  /** The previewed person's access; null while it loads or when not previewing. */
  previewAccess: PreviewAccess | null;
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
  const [previewAccess, setPreviewAccess] = useState<PreviewAccess | null>(null);

  const startViewAs = useCallback((employeeId: string, name: string) => {
    // Nothing is saved from here until the preview ends (src/lib/previewGuard.ts).
    setPreviewGuard(name);
    setPreviewAccess(null);
    setViewAsEmployeeId(employeeId);
    setViewAsName(name);
    void (async () => {
      const { data: profile } = await supabase.from('profiles').select('user_id').eq('id', employeeId).maybeSingle();
      const userId = profile?.user_id as string | undefined;
      if (!userId) {
        setPreviewAccess({ isAdmin: false, canViewStaffActivity: false });
        return;
      }
      const [{ data: roles }, { data: canView }] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', userId),
        // Newer than the generated types.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.rpc as any)('can_view_staff_activity', { _user_id: userId }),
      ]);
      setPreviewAccess({
        isAdmin: (roles ?? []).some((r) => r.role === 'admin' || r.role === 'superadmin'),
        canViewStaffActivity: canView === true,
      });
    })();
  }, []);

  const exitViewAs = useCallback(() => {
    setPreviewGuard(null);
    setViewAsEmployeeId(null);
    setViewAsName(null);
    setPreviewAccess(null);
  }, []);

  const guardWrite = useCallback(() => {
    if (viewAsEmployeeId) {
      toast(`Previewing as ${viewAsName}. Changes will not be saved.`);
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
        previewAccess,
        startViewAs,
        exitViewAs,
        guardWrite,
      }}
    >
      {children}
    </ViewAsContext.Provider>
  );
};

/**
 * The preview, for the access hooks: whether one is running, and the
 * previewed person's access (null while it loads). Safe outside the provider.
 */
export const usePreview = (): { previewing: boolean; access: PreviewAccess | null } => {
  const ctx = useContext(ViewAsContext);
  return { previewing: !!ctx?.isViewingAs, access: ctx?.previewAccess ?? null };
};

export const useViewAs = (): ViewAsState => {
  const ctx = useContext(ViewAsContext);
  if (!ctx) {
    throw new Error('useViewAs must be used within a ViewAsProvider');
  }
  return ctx;
};
