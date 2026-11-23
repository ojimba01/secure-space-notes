import { Button } from "@/components/ui/button";
import { NotificationBell } from '@/components/notifications/NotificationBell';
import {
  Users,
  LogOut,
  LayoutGrid,
  UserCheck,
  Calendar,
  BookOpen,
  Menu,
  X,
  DollarSign,
  FileText,
  FileSpreadsheet,
  NotebookPen,
  UserCircle,
  Activity,
  LifeBuoy,
  Inbox,
} from "lucide-react";
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIsSuperadmin } from '@/hooks/useIsSuperadmin';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useCanViewStaffActivity } from '@/hooks/useCanViewStaffActivity';
import { useViewAs } from '@/components/ViewAsProvider';
import { AdvancedTools } from '@/components/AdvancedTools';
import { AccountDialog } from '@/components/AccountDialog';
import { cn } from '@/lib/utils';
import { openHelp } from '@/components/help/HelpCenter';
import { NewRibbon, useNewRibbon } from '@/components/WhatsNew';
import { useUnreadCount } from '@/hooks/useUnreadCount';

interface SidebarProps {
  /** Which in-page view is showing. Only meaningful on "/". */
  activeView?: 'compliance' | 'clients' | 'calendar' | 'forms' | 'intakes' | 'inbox';
  onViewChange: (view: 'compliance' | 'clients' | 'calendar' | 'forms' | 'intakes' | 'inbox') => void;
}

/** Where the highlight last sat, kept across pages. */
let lastHighlight: { top: number; height: number } | null = null;

/** A small grey heading over a group of menu items. */
const NavGroup: React.FC<{ label?: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-0.5">
    {label && (
      <div className="px-3 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/85">
        {label}
      </div>
    )}
    {children}
  </div>
);

/**
 * A menu item. The current page carries data-active; the light blue highlight
 * behind it is drawn once by the sidebar and slides from item to item.
 */
const NavItem: React.FC<{
  icon: React.ElementType;
  label: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  badge?: React.ReactNode;
  tutorial?: string;
}> = ({ icon: Icon, label, active, onClick, badge, tutorial }) => (
  <button
    type="button"
    onClick={onClick}
    data-active={active ? 'true' : undefined}
    data-tutorial={tutorial}
    aria-current={active ? 'page' : undefined}
    className={cn(
      'group relative z-10 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[14.5px] transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      active ? 'font-semibold text-primary' : 'text-foreground/75 hover:bg-muted hover:text-foreground',
    )}
  >
    <Icon className="wiggle-on-hover h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
    <span className="flex min-w-0 flex-1 items-center gap-2 truncate">{label}</span>
    {badge}
  </button>
);

/** Supportive Care Management's logo. */
export const BrandMark: React.FC<{ className?: string }> = ({ className }) => (
  <img
    src="/brand/scm-logo.png"
    alt="Supportive Care Management LLC"
    className={cn('h-auto w-full select-none', className)}
    draggable={false}
  />
);

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange }) => {
  const inboxRibbon = useNewRibbon('inbox');
  const unreadCount = useUnreadCount();
  const navigate = useNavigate();
  const location = useLocation();

  // Some nav entries switch a view inside "/", others are their own route.
  // Highlighting reads the real location so a page can never light up the
  // wrong entry, and view highlights only apply while "/" is showing.
  const onRoot = location.pathname === '/';
  const { signOut } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  // Follows a preview: shows the previewed person's menu.
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();
  const { isSuperadmin, loading: superLoading } = useIsSuperadmin();
  const { canView: canViewActivity, loading: activityLoading } = useCanViewStaffActivity();
  // The first time this person's access is checked, the menu waits for all of it,
  // so items appear together instead of one after another. Later pages are instant.
  const menuReady = !adminLoading && !superLoading && !activityLoading;
  /** Support tickets waiting on an answer, for the count beside the link. */
  const [openTickets, setOpenTickets] = useState(0);
  useEffect(() => {
    if (!isSuperadmin) return;
    // Newer than the generated types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase.from as any)('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .then(({ count }: { count: number | null }) => setOpenTickets(count ?? 0));
  }, [isSuperadmin, location.pathname]);
  const { isViewingAs } = useViewAs();

  // Close sidebar when view changes on mobile
  const handleViewChange = (view: 'compliance' | 'clients' | 'calendar' | 'forms' | 'intakes' | 'inbox') => {
    onViewChange(view);
    if (isMobile) setIsOpen(false);
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    if (isMobile) setIsOpen(false);
  };


  // Mobile toolbar header
  const MobileToolbar = () => (
    <div className="fixed top-0 left-0 right-0 z-50 md:hidden bg-card/95 backdrop-blur-sm border-b border-border h-14 flex items-center px-3 gap-3">
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 shrink-0"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>
      <div className="flex flex-1 items-center gap-2 min-w-0">
        <BrandMark className="max-h-9 w-auto" />
      </div>
      <NotificationBell className="h-10 w-10 shrink-0" />
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 shrink-0"
        onClick={() => setAccountOpen(true)}
        title="Your account"
        aria-label="Your account"
      >
        <UserCircle className="h-5 w-5" />
      </Button>
    </div>
  );

  // Overlay for mobile
  const Overlay = () => (
    <div 
      className={cn(
        "fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity",
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
      onClick={() => setIsOpen(false)}
    />
  );

  const onPath = (path: string) => location.pathname === path;
  const onView = (view: SidebarProps['activeView']) => onRoot && activeView === view;

  // The highlight behind the current item, measured from that item so it can
  // slide when the page changes.
  const navRef = useRef<HTMLDivElement>(null);
  // Each page draws its own sidebar, so the highlight starts where the last
  // page left it and slides to the new item instead of jumping.
  const [highlight, setHighlight] = useState<{ top: number; height: number } | null>(lastHighlight);
  useLayoutEffect(() => {
    const nav = navRef.current;
    const item = nav?.querySelector<HTMLElement>('[data-active="true"]');
    if (!nav || !item) { setHighlight(null); return; }
    const a = nav.getBoundingClientRect();
    const b = item.getBoundingClientRect();
    const next = { top: b.top - a.top + nav.scrollTop, height: b.height };
    lastHighlight = next;
    // One frame at the old position first, so the move is animated.
    const frame = requestAnimationFrame(() => setHighlight(next));
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, activeView, menuReady, isAdmin, isSuperadmin, canViewActivity]);

  return (
    <>
      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} />
      <MobileToolbar />
      <Overlay />
      <div className={cn(
        'flex flex-col overflow-y-auto bg-card px-4 pb-5 pt-6',
        'border-r border-border',
        'fixed md:sticky inset-y-0 left-0 z-40',
        'w-[85vw] max-w-72 md:w-[228px] md:max-w-none md:shrink-0',
        'transform transition-transform duration-300 ease-out',
        isMobile && !isOpen ? '-translate-x-full' : 'translate-x-0',
        isMobile ? 'top-14' : 'top-0', // Account for mobile toolbar
        'md:h-screen'
      )}>
        <div className="mb-6 hidden items-center gap-1 md:flex">
          <button
            type="button"
            onClick={() => handleViewChange('clients')}
            className="min-w-0 flex-1 text-left transition-opacity hover:opacity-80"
            aria-label="Clients"
          >
            <BrandMark className="max-w-[160px]" />
          </button>
          <NotificationBell className="h-9 w-9 shrink-0 text-foreground/75 hover:bg-muted" />
        </div>

        <div
          ref={navRef}
          className={cn('relative flex flex-1 flex-col transition-opacity duration-300', menuReady ? 'opacity-100' : 'pointer-events-none opacity-0')}
          aria-busy={!menuReady}
        >
          {highlight && (
            <div
              aria-hidden
              className="absolute inset-x-0 z-0 rounded-lg bg-accent transition-[transform,height] duration-300"
              style={{
                transform: `translateY(${highlight.top}px)`,
                height: highlight.height,
                top: 0,
                transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          )}

          <div className="space-y-5">
            <NavGroup label="Workspace">
              {isAdmin && (
                <NavItem icon={LayoutGrid} label="Admin Dashboard" active={onPath('/admin')} onClick={() => handleNavigate('/admin')} tutorial="admin-nav" />
              )}
              <NavItem icon={Users} label="Clients" active={onView('clients')} onClick={() => handleViewChange('clients')} tutorial="clients-nav" />
              <NavItem
                icon={Inbox}
                label={<>Inbox {inboxRibbon && <NewRibbon inline />}</>}
                active={onView('inbox')}
                onClick={() => handleViewChange('inbox')}
                badge={unreadCount > 0 ? (
                  <span key={unreadCount} className="animate-pop rounded-full bg-danger px-1.5 text-[11px] font-semibold leading-[18px] text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : undefined}
              />
              <NavItem icon={FileText} label="Blank forms" active={onView('forms')} onClick={() => handleViewChange('forms')} tutorial="forms-nav" />
              <NavItem icon={NotebookPen} label="Generate Notes" active={onPath('/clinical-notes')} onClick={() => handleNavigate('/clinical-notes')} />
              {isAdmin && (
                <NavItem icon={FileSpreadsheet} label="Workbook" active={onPath('/workbook')} onClick={() => handleNavigate('/workbook')} />
              )}
              {/* Named for whose work it is. "Touchpoints" alone collided with
                  the Touchpoints section inside a client's record. Admins see
                  it under Team & operations. */}
              {!isAdmin && (
                <NavItem icon={UserCheck} label="My touchpoints" active={onView('compliance')} onClick={() => handleViewChange('compliance')} tutorial="touchpoints-nav" />
              )}
              <NavItem icon={Calendar} label="Calendar" active={onView('calendar')} onClick={() => handleViewChange('calendar')} tutorial="calendar-nav" />
            </NavGroup>

            {(isAdmin || canViewActivity) && (
              <NavGroup label="Team & operations">
                {isAdmin && (
                  <NavItem icon={UserCheck} label="Team touchpoints" active={onView('compliance')} onClick={() => handleViewChange('compliance')} tutorial="touchpoints-nav" />
                )}
                {isAdmin && (
                  <NavItem icon={DollarSign} label="Billing" active={onPath('/billing')} onClick={() => handleNavigate('/billing')} tutorial="billing-nav" />
                )}
                {canViewActivity && (
                  <NavItem icon={Activity} label="Staff activity" active={onPath('/staff-activity')} onClick={() => handleNavigate('/staff-activity')} />
                )}
              </NavGroup>
            )}
          </div>

          <div className="mt-auto space-y-0.5 pt-6">
            <NavItem
              icon={BookOpen}
              label="Help guide"
              active={false}
              onClick={() => {
                // The Help guide is now Help: ask, or pick a task, and be shown.
                openHelp();
                if (isMobile) setIsOpen(false);
              }}
              tutorial="onboarding-nav"
            />
            {isSuperadmin && !isViewingAs && (
              <NavItem
                icon={LifeBuoy}
                label="Support tickets"
                active={onPath('/support-tickets')}
                onClick={() => handleNavigate('/support-tickets')}
                badge={openTickets > 0 ? (
                  <span key={openTickets} className="animate-pop rounded-full bg-danger px-1.5 text-[11px] font-semibold leading-[18px] text-white">{openTickets}</span>
                ) : undefined}
              />
            )}
            <AdvancedTools />
            <div className="!mt-4 space-y-0.5 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setAccountOpen(true)}
                aria-label="Your account"
                className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[13.5px] text-foreground/75 transition-colors hover:bg-muted hover:text-foreground"
              >
                <UserCircle className="h-[18px] w-[18px]" strokeWidth={1.75} />
                Your account
              </button>
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  navigate('/auth');
                }}
                className="group flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[13.5px] text-foreground/75 transition-colors hover:bg-destructive/5 hover:text-destructive"
              >
                <LogOut className="nudge h-[18px] w-[18px]" strokeWidth={1.75} />
                Log out
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
