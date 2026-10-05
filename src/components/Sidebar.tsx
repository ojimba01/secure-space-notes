import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Users, 
  Stethoscope, 
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
        <div className="p-1.5 bg-medical-blue rounded-md">
          <Stethoscope className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold truncate">Clinical Notes</span>
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
        "bg-card border-r border-border p-3 md:p-6 space-y-3 md:space-y-6 flex flex-col overflow-y-auto",
        "fixed md:sticky md:top-0 inset-y-0 left-0 z-40",
        "w-[85vw] max-w-72 md:w-80 md:max-w-none",
        "transform transition-transform duration-300 ease-in-out",
        isMobile && !isOpen ? "-translate-x-full" : "translate-x-0",
        isMobile ? "top-14" : "top-0", // Account for mobile toolbar
        "md:h-screen"
      )}>
        {/* Header - hidden on mobile since toolbar shows it */}
        <div className="space-y-3 md:pt-0">
          <div className="hidden md:flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleViewChange('clients')}
              className="flex flex-1 min-w-0 items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer text-left"
            >
              <div className="p-2 bg-medical-blue rounded-lg">
                <Stethoscope className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-lg">Clinical Notes</h2>
                <p className="text-sm text-muted-foreground">HIPAA Compliant</p>
              </div>
            </button>
            {/* Your own account: your signatures and your password. At the top
                where a profile belongs, rather than at the foot of the
                navigation under everything else. */}
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-10 w-10"
              onClick={() => setAccountOpen(true)}
              title="Your account"
              aria-label="Your account"
            >
              <UserCircle className="h-6 w-6" />
            </Button>
          </div>
            
        </div>

        {/* Navigation */}
        <div className={cn('space-y-1 md:space-y-2 transition-opacity', menuReady ? 'opacity-100' : 'pointer-events-none opacity-0')} aria-busy={!menuReady}>
          {isAdmin && (
            <Button
              variant={routeVariant('/admin')}
              className="w-full justify-start gap-2"
              onClick={() => handleNavigate('/admin')}
              data-tutorial="admin-nav"
            >
              <Shield className="h-4 w-4" />
              Admin Dashboard
            </Button>
          )}
          <Button
            variant={viewVariant('clients')}
            className="w-full justify-start gap-2"
            onClick={() => handleViewChange('clients')}
            data-tutorial="clients-nav"
          >
            <Users className="h-4 w-4" />
            Clients
          </Button>
          <Button
            variant={viewVariant('forms')}
            className="w-full justify-start gap-2"
            onClick={() => handleViewChange('forms')}
            data-tutorial="forms-nav"
          >
            <FilePlus2 className="h-4 w-4" />
            Blank forms
          </Button>
          <Button
            variant={routeVariant('/clinical-notes')}
            className="w-full justify-start gap-2"
            onClick={() => handleNavigate('/clinical-notes')}
          >
            <NotebookPen className="h-4 w-4" />
            Generate Notes
            <BetaBadge />
          </Button>
          {isAdmin && (
            <Button
              variant={routeVariant('/workbook')}
              className="w-full justify-start gap-2"
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
            className="w-full justify-start gap-2"
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
              className="w-full justify-start gap-2"
              onClick={() => handleNavigate('/billing')}
            >
              <DollarSign className="h-4 w-4" />
              Billing
            </Button>
          )}
          <Button
            variant={viewVariant('calendar')}
            className="w-full justify-start gap-2"
            onClick={() => handleViewChange('calendar')}
            data-tutorial="calendar-nav"
          >
            <Calendar className="h-4 w-4" />
            Calendar
          </Button>
          <Button
            variant={routeVariant('/onboarding')}
            className="w-full justify-start gap-2"
            onClick={() => handleNavigate('/onboarding')}
            data-tutorial="onboarding-nav"
          >
            <BookOpen className="h-4 w-4" />
            Help guide
          </Button>
          {canViewActivity && (
            <Button
              variant={routeVariant('/staff-activity')}
              className="w-full justify-start gap-2"
              onClick={() => handleNavigate('/staff-activity')}
            >
              <Activity className="h-4 w-4" />
              Staff activity
            </Button>
          )}
          {isSuperadmin && !isViewingAs && (
            <Button
              variant={routeVariant('/support-tickets')}
              className="w-full justify-start gap-2"
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

        {/* Security Notice - Compact on mobile */}
        <Card className="p-3 md:p-4 bg-medical-green-light/20 border-medical-green/20">
          <div className="flex items-start gap-2 md:gap-3">
            <Shield className="w-4 h-4 md:w-5 md:h-5 text-medical-green mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h4 className="font-medium text-xs md:text-sm text-medical-green">HIPAA Compliant</h4>
              <p className="text-xs text-medical-green/80 hidden md:block">
                All notes are encrypted and stored securely according to healthcare privacy standards.
              </p>
            </div>
          </div>
        </Card>

        {/* Advanced Tools (superadmin only) - pinned to bottom */}
        <div className="mt-auto space-y-2">
          <AdvancedTools />
          {/* Logout Button */}
          <Button 
            variant="outline"
            className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
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
