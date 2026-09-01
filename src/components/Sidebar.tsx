import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Users, 
  Clock, 
  Stethoscope, 
  LogOut, 
  Shield, 
  ClipboardList,
  Calendar,
  BookOpen,
  Play,
  Menu,
  X,
  DollarSign,
  FilePlus2,
  UserCircle,
} from "lucide-react";
import { useTutorial } from '@/components/TutorialProvider';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIsSuperadmin } from '@/hooks/useIsSuperadmin';
import { useViewAs } from '@/components/ViewAsProvider';
import { AdvancedTools } from '@/components/AdvancedTools';
import { AccountDialog } from '@/components/AccountDialog';
import { cn } from '@/lib/utils';

interface SidebarProps {
  /** Which in-page view is showing. Only meaningful on "/". */
  activeView?: 'compliance' | 'clients' | 'calendar' | 'forms';
  onViewChange: (view: 'compliance' | 'clients' | 'calendar' | 'forms') => void;
}

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
  const { user, signOut } = useAuth();
  const { startTutorial } = useTutorial();
  const [accountOpen, setAccountOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();
  const { isSuperadmin } = useIsSuperadmin();
  const { isViewingAs } = useViewAs();

  useEffect(() => {
    if (user) {
      checkAdminStatus();
    }
  }, [user]);

  // Close sidebar when view changes on mobile
  const handleViewChange = (view: 'compliance' | 'clients' | 'calendar' | 'forms') => {
    onViewChange(view);
    if (isMobile) setIsOpen(false);
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    if (isMobile) setIsOpen(false);
  };

  const checkAdminStatus = async () => {
    if (!user) return;
    
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['admin', 'superadmin']);
      
      setIsAdmin(!!data && data.length > 0);
    } catch (error) {
      setIsAdmin(false);
    }
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
      <div className="flex items-center gap-2 min-w-0">
        <div className="p-1.5 bg-medical-blue rounded-md">
          <Stethoscope className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold truncate">Case Notes</span>
      </div>
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
          <div className="hidden md:block">
            <button
              type="button"
              onClick={() => handleViewChange('clients')}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer w-full text-left"
            >
              <div className="p-2 bg-medical-blue rounded-lg">
                <Stethoscope className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">Case Notes</h2>
                <p className="text-sm text-muted-foreground">HIPAA Compliant</p>
              </div>
            </button>
          </div>
            
        </div>

        {/* Navigation */}
        <div className="space-y-1 md:space-y-2">
          {isAdmin && !isViewingAs && (
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
            Forms
          </Button>
          {isAdmin && !isViewingAs && (
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
            data-tutorial="touchpoints-nav"
            variant={viewVariant('compliance')}
            className="w-full justify-start gap-2"
            onClick={() => handleViewChange('compliance')}
          >
            <ClipboardList className="h-4 w-4" />
            Touchpoints
          </Button>

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
          {/* One walkthrough, not two. The spotlight tour and the new-features
              steps were separate buttons that a person had to choose between
              without knowing the difference. */}
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-primary"
            onClick={() => window.dispatchEvent(new Event('show-new-features'))}
          >
            <Play className="h-4 w-4" />
            Start walkthrough
          </Button>
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
          {/* Your own account, where a signature can be changed without
              starting a form you did not mean to submit. */}
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => setAccountOpen(true)}
          >
            <UserCircle className="h-4 w-4" />
            Your account
          </Button>
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
