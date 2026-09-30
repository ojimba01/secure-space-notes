// The left-hand menu around a page that has its own route (Billing, Help guide,
// Staff activity, Support tickets), so leaving "/" never loses the navigation.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar';
import { TutorialProvider } from '@/components/TutorialProvider';
import { FeatureWalkthrough } from '@/components/FeatureWalkthrough';
import { useViewAs } from '@/components/ViewAsProvider';

export function PageShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { isViewingAs } = useViewAs();
  return (
    <TutorialProvider>
      <FeatureWalkthrough />
      <div className={`flex h-screen w-full overflow-hidden bg-slate-50 ${isViewingAs ? 'pt-9' : ''}`}>
        <Sidebar onViewChange={(view) => navigate('/', { state: { view } })} />
        <main className="min-w-0 flex-1 overflow-y-auto pt-14 md:pt-0">{children}</main>
      </div>
    </TutorialProvider>
  );
}
