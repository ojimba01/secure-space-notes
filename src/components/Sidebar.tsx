import { Button } from "@/components/ui/button";
import { 
  Users, 
  LogOut, 
  Shield, 
  ClipboardList,
  Calendar,
  BookOpen,
  Menu,
  X,
  DollarSign,
  FileSpreadsheet,
  FilePlus2,
  NotebookPen,
  UserCircle,
  Activity,
  LifeBuoy,
} from "lucide-react";
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIsSuperadmin } from '@/hooks/useIsSuperadmin';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useCanViewStaffActivity } from '@/hooks/useCanViewStaffActivity';
import { useViewAs } from '@/components/ViewAsProvider';
import { AdvancedTools } from '@/components/AdvancedTools';
import { AccountDialog } from '@/components/AccountDialog';
import { cn } from '@/lib/utils';

interface SidebarProps {
  /** Which in-page view is showing. Only meaningful on "/". */
  activeView?: 'compliance' | 'clients' | 'calendar' | 'forms';
  onViewChange: (view: 'compliance' | 'clients' | 'calendar' | 'forms') => void;
}

/** Marks a feature still being tried out. Hidden from screen readers so the item keeps its name. */
const BetaBadge = () => (
  <span aria-hidden className="ml-auto rounded-full bg-violet-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-violet-700">
    Beta
  </span>
);

/** A menu item: tall and rounded; the current page is the dark pill. */
const NAV_ITEM =
  'w-full justify-start gap-3 h-11 rounded-xl px-3 text-[15px] font-normal text-white/85 [&.bg-primary]:bg-white [&.bg-primary]:font-medium [&.bg-primary]:text-primary [&.bg-primary]:shadow-sm [&:not(.bg-primary)]:hover:bg-white/10 [&:not(.bg-primary)]:hover:text-white [&_svg]:size-[18px]';

/** The agency's name, set like its logo: blue over orange. */
export const BrandMark: React.FC<{ onDark?: boolean }> = ({ onDark = true }) => (
  <div className="min-w-0 leading-tight">
    <div className={cn('text-lg font-bold tracking-tight', onDark ? 'text-white' : 'text-[#2e6da4]')}>Supportive Care</div>
    <div className="text-base font-semibold tracking-tight text-[hsl(var(--brand-orange))]">Management</div>
  </div>
);

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Some nav entries switch a view inside "/", others are their own route.
  // Highlighting reads the real location so a page can never light up the
  // wrong entry, and view highlights only apply while "/" is showing.
  const onRoot = location.pathname === '/';
  const viewVariant = (view: SidebarProps['activeView']) =>
    onRoot && activeView === view ? 'default' : 'ghost';
  const routeVariant = (path: string) => (location.pathname === path ? 'default' : 'ghost');
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
  const handleViewChange = (view: 'compliance' | 'clients' | 'calendar' | 'forms') => {
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
        <span className="truncate font-semibold text-[#2e6da4]">
          Supportive Care <span className="text-[hsl(var(--brand-orange))]">Management</span>
        </span>
      </div>
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

  return (
    <>
      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} />
      <MobileToolbar />
      <Overlay />
      <div className={cn(
        // The brand's dark blue, lightening toward the bottom, floating beside the page.
        "bg-gradient-to-b from-[#0c3d66] via-[#14558c] to-[#2e6da4] text-white p-3 md:p-5 space-y-3 md:space-y-6 flex flex-col overflow-y-auto",
        "md:rounded-2xl md:shadow-md md:m-3",
        "fixed md:sticky md:top-3 inset-y-0 left-0 z-40",
        "w-[85vw] max-w-72 md:w-72 md:max-w-none md:shrink-0",
        "transform transition-transform duration-300 ease-in-out",
        isMobile && !isOpen ? "-translate-x-full" : "translate-x-0",
        isMobile ? "top-14" : "top-0", // Account for mobile toolbar
        "md:h-[calc(100vh-1.5rem)]"
      )}>
        {/* Header - hidden on mobile since toolbar shows it */}
        <div className="space-y-3 md:pt-0">
          <div className="hidden md:flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleViewChange('clients')}
              className="flex flex-1 min-w-0 items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer text-left"
            >
              <BrandMark />
            </button>
            {/* Your own account: your signatures and your password. At the top
                where a profile belongs, rather than at the foot of the
                navigation under everything else. */}
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-10 w-10 text-white/80 hover:bg-white/10 hover:text-white"
              onClick={() => setAccountOpen(true)}
              title="Your account"
              aria-label="Your account"
            >
              <UserCircle className="h-6 w-6" />
            </Button>
          </div>
            
        </div>

        {/* Navigation */}
        <div className={cn('space-y-1 transition-opacity', menuReady ? 'opacity-100' : 'pointer-events-none opacity-0')} aria-busy={!menuReady}>
          {isAdmin && (
            <Button
              variant={routeVariant('/admin')}
              className={NAV_ITEM}
              onClick={() => handleNavigate('/admin')}
              data-tutorial="admin-nav"
            >
              <Shield className="h-4 w-4" />
              Admin Dashboard
            </Button>
          )}
          <Button
            variant={viewVariant('clients')}
            className={NAV_ITEM}
            onClick={() => handleViewChange('clients')}
            data-tutorial="clients-nav"
          >
            <Users className="h-4 w-4" />
            Clients
          </Button>
          <Button
            variant={viewVariant('forms')}
            className={NAV_ITEM}
            onClick={() => handleViewChange('forms')}
            data-tutorial="forms-nav"
          >
            <FilePlus2 className="h-4 w-4" />
            Blank forms
          </Button>
          <Button
            variant={routeVariant('/clinical-notes')}
            className={NAV_ITEM}
            onClick={() => handleNavigate('/clinical-notes')}
          >
            <NotebookPen className="h-4 w-4" />
            Generate Notes
            <BetaBadge />
          </Button>
          {isAdmin && (
            <Button
              variant={routeVariant('/workbook')}
              className={NAV_ITEM}
              onClick={() => handleNavigate('/workbook')}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Workbook
              <BetaBadge />
            </Button>
          )}
          <Button
            data-tutorial="touchpoints-nav"
            variant={viewVariant('compliance')}
            className={NAV_ITEM}
            onClick={() => handleViewChange('compliance')}
          >
            <ClipboardList className="h-4 w-4" />
            {/* Named for whose work it is. "Touchpoints" alone collided with
                the Touchpoints section inside a client's record, and staff
                could not tell which one anybody meant. */}
            {isAdmin ? 'Team touchpoints' : 'My touchpoints'}
          </Button>

          {isAdmin && (
            <Button
              data-tutorial="billing-nav"
              variant={routeVariant('/billing')}
              className={NAV_ITEM}
              onClick={() => handleNavigate('/billing')}
            >
              <DollarSign className="h-4 w-4" />
              Billing
            </Button>
          )}
          <Button
            variant={viewVariant('calendar')}
            className={NAV_ITEM}
            onClick={() => handleViewChange('calendar')}
            data-tutorial="calendar-nav"
          >
            <Calendar className="h-4 w-4" />
            Calendar
          </Button>
          <Button
            variant={routeVariant('/onboarding')}
            className={NAV_ITEM}
            onClick={() => handleNavigate('/onboarding')}
            data-tutorial="onboarding-nav"
          >
            <BookOpen className="h-4 w-4" />
            Help guide
          </Button>
          {canViewActivity && (
            <Button
              variant={routeVariant('/staff-activity')}
              className={NAV_ITEM}
              onClick={() => handleNavigate('/staff-activity')}
            >
              <Activity className="h-4 w-4" />
              Staff activity
            </Button>
          )}
          {isSuperadmin && !isViewingAs && (
            <Button
              variant={routeVariant('/support-tickets')}
              className={NAV_ITEM}
              onClick={() => handleNavigate('/support-tickets')}
            >
              <LifeBuoy className="h-4 w-4" />
              Support tickets
              {openTickets > 0 && (
                <span className="ml-auto rounded-full bg-red-600 px-2 text-xs text-white">{openTickets}</span>
              )}
            </Button>
          )}
        </div>

        {/* Advanced Tools (superadmin only) - pinned to bottom */}
        <div className="!mt-auto space-y-2">
          <AdvancedTools />
          {/* Logout Button */}
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-11 rounded-xl text-[15px] text-white/80 hover:bg-white/10 hover:text-white"
            onClick={async () => {
              await signOut();
              navigate('/auth');
            }}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </>
  );
};
