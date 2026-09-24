import React, { useState, useEffect } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { FeatureWalkthrough } from '@/components/FeatureWalkthrough';
import { TutorialProvider } from '@/components/TutorialProvider';
import { Sidebar } from "@/components/Sidebar";
import { ClientManagement } from "@/components/ClientManagement";
import { CaseManagerCalendar } from "@/components/CaseManagerCalendar";
import { StaffTouchpoints } from "@/components/StaffTouchpoints";
import { FormsHub } from "@/components/forms/FormsHub";
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { SuperadminTouchpoints } from '@/components/SuperadminTouchpoints';
import { useViewAs } from '@/components/ViewAsProvider';

type View = 'compliance' | 'clients' | 'calendar' | 'forms';

const VIEWS: View[] = ['compliance', 'clients', 'calendar', 'forms'];
const isView = (v: string | null): v is View => !!v && (VIEWS as string[]).includes(v);

/**
 * Two different questions, so two views rather than one blended screen:
 * "how is the whole agency doing" and "what do I personally owe this week".
 * Admins and superadmins need both; staff only ever see the second.
 */
const TouchpointViews: React.FC<{ onOpenClient: (id: string) => void }> = ({ onOpenClient }) => {
  const [view, setView] = useState<'oversight' | 'mine'>('oversight');

  // A switch rather than two buttons: the coloured pill slides under the side
  // that is chosen, and the page below slides in from that side, so it is
  // plain which of the two you are looking at and that you have moved.
  const options: { id: 'oversight' | 'mine'; label: string }[] = [
    { id: 'oversight', label: 'All cases' },
    { id: 'mine', label: 'My cases' },
  ];
  const mine = view === 'mine';

  return (
    <div>
      <div className="px-4 pt-6 md:px-8">
        <div
          role="tablist"
          aria-label="Whose cases"
          className="relative inline-grid grid-cols-2 rounded-full bg-muted p-1"
        >
          <span
            aria-hidden
            className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-primary shadow-sm transition-transform duration-300 ease-out ${
              mine ? 'translate-x-full' : 'translate-x-0'
            }`}
          />
          {options.map((o) => (
            <button
              key={o.id}
              role="tab"
              aria-selected={view === o.id}
              onClick={() => setView(o.id)}
              className={`relative z-10 w-32 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-300 ${
                view === o.id ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div
        key={view}
        className={`duration-300 animate-in fade-in-0 ${mine ? 'slide-in-from-right-8' : 'slide-in-from-left-8'}`}
      >
        {view === 'oversight'
          ? <SuperadminTouchpoints onOpenClient={onOpenClient} />
          : <StaffTouchpoints onOpenClient={onOpenClient} />}
      </div>
    </div>
  );
};

const Index = () => {
  const { user, loading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { isViewingAs } = useViewAs();
  const location = useLocation();
  // The section and the open record live in the URL, so a refresh comes back
  // where you were instead of at the top of the client list. Written with
  // replace rather than push: the sidebar is an app shell, and filling the
  // browser's history with section changes makes Back mean nothing useful.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlView = searchParams.get('view');
  const urlClient = searchParams.get('client');
  const [activeView, setActiveView] = useState<View>(isView(urlView) ? urlView : 'compliance');
  const [clientsKey, setClientsKey] = useState(0);
  const [initialClientId, setInitialClientId] = useState<string | null>(urlClient);
  // A view read off the URL is the answer already; the landing default below
  // must not overwrite it on the first render after a refresh.
  const [defaultApplied, setDefaultApplied] = useState(isView(urlView));
  const [wasViewingAs, setWasViewingAs] = useState(false);
  /** The record currently open, so a refresh reopens it rather than the list. */
  const [openClientId, setOpenClientId] = useState<string | null>(urlClient);

  // Honor a view requested by another page (for example the admin sidebar),
  // and a specific client with it — the admin dashboard's queues are lists of
  // clients whose only useful action is to open the record.
  useEffect(() => {
    const state = location.state as { view?: View; clientId?: string } | null;
    if (state?.clientId) {
      setInitialClientId(state.clientId);
      setActiveView('clients');
      setDefaultApplied(true);
      return;
    }
    if (state?.view) {
      setActiveView(state.view);
      setDefaultApplied(true);
    }
  }, [location.state]);

  // Non-admins land on My Month; admins keep the Clients list as their landing here.
  useEffect(() => {
    if (!adminLoading && !defaultApplied) {
      setActiveView(isAdmin ? 'clients' : 'compliance');
      setDefaultApplied(true);
    }
  }, [adminLoading, isAdmin, defaultApplied]);

  // Entering view-as lands on the employee's My Month; exiting returns to Clients.
  useEffect(() => {
    if (isViewingAs && !wasViewingAs) {
      setActiveView('compliance');
      setWasViewingAs(true);
    } else if (!isViewingAs && wasViewingAs) {
      setActiveView('clients');
      setWasViewingAs(false);
    }
  }, [isViewingAs, wasViewingAs]);

  useEffect(() => {
    if (!defaultApplied) return;
    const next = new URLSearchParams(searchParams);
    if (next.get('view') === activeView && (next.get('client') ?? null) === openClientId) return;
    next.set('view', activeView);
    if (openClientId) next.set('client', openClientId);
    else next.delete('client');
    setSearchParams(next, { replace: true });
  }, [activeView, openClientId, defaultApplied, searchParams, setSearchParams]);

  const handleViewChange = (view: View) => {
    if (view === 'clients') {
      setClientsKey((k) => k + 1);
    }
    setActiveView(view);
    setOpenClientId(null);
  };

  const handleOpenClient = (clientId: string) => {
    setInitialClientId(clientId);
    setActiveView('clients');
    setOpenClientId(clientId);
  };

  // Signing in lands on the work, not on a guide. An account with nothing in
  // `user_onboarding` used to be sent to the help guide before it ever saw the
  // dashboard; the guide is still in the sidebar, for whoever wants it.
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    // Carry where they were, so signing in — or a session that took a moment
    // to come back — returns them to it rather than to a bare "/". Landing
    // there is what sent somebody refreshing the Forms page to the client
    // list: the section lives in the query string, and the round trip through
    // /auth dropped it.
    return <Navigate to="/auth" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  return (
    <TutorialProvider>
      <FeatureWalkthrough />
      <div className={`flex h-screen bg-background w-full overflow-hidden ${isViewingAs ? 'pt-9' : ''}`}>
        <Sidebar activeView={activeView} onViewChange={handleViewChange} />
        <main className="flex-1 overflow-y-auto min-w-0 pt-14 md:pt-0">
          {activeView === 'compliance' ? (
            /* Admins and superadmins carry caseloads of their own -- the two
               largest in the agency belong to them -- so they need the
               supervisory view *and* their own work queue, not one or the
               other. Staff see only their own queue, with no switcher. */
            isAdmin && !isViewingAs
              ? <TouchpointViews onOpenClient={handleOpenClient} />
              : <StaffTouchpoints onOpenClient={handleOpenClient} />
          ) : activeView === 'clients' ? (
            <ClientManagement
              key={clientsKey}
              onOpenClientChange={setOpenClientId}
              initialClientId={initialClientId}
              onConsumeInitialClient={() => setInitialClientId(null)}
            />
          ) : activeView === 'forms' ? (
            <FormsHub />
          ) : (
            <CaseManagerCalendar onOpenClient={handleOpenClient} />
          )}
        </main>
      </div>
    </TutorialProvider>
  );
};

export default Index;
