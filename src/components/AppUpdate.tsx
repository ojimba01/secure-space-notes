import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { onWaitingChange, reloadNow, startUpdateChecks } from '@/lib/appUpdate';

/**
 * Keeps everyone on the latest published version (src/lib/appUpdate.ts). Shows
 * a bar only when an update is waiting for someone to save their work.
 */
export const AppUpdate = () => {
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    startUpdateChecks();
    return onWaitingChange(setWaiting);
  }, []);

  if (!waiting) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[100] flex flex-wrap items-center justify-center gap-3 bg-primary px-4 py-2 text-sm text-primary-foreground shadow"
    >
      <span>An update is ready. Save your work and the page will refresh.</span>
      <Button size="sm" variant="secondary" onClick={reloadNow}>
        <RefreshCw className="mr-1.5 h-4 w-4" />
        Refresh now
      </Button>
    </div>
  );
};
