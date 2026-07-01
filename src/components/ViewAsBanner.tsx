import React from 'react';
import { useViewAs } from '@/components/ViewAsProvider';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';

export const ViewAsBanner: React.FC = () => {
  const { isViewingAs, viewAsName, exitViewAs } = useViewAs();
  if (!isViewingAs) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-purple-700 text-white px-4 py-2 flex items-center justify-center gap-3 text-sm shadow-md">
      <Eye className="h-4 w-4" />
      <span>Sandbox preview as <b>{viewAsName}</b> — you can click through everything; nothing you do is saved.</span>
      <Button size="sm" variant="secondary" className="h-7 ml-2" onClick={exitViewAs}>Exit view</Button>
    </div>
  );
};
