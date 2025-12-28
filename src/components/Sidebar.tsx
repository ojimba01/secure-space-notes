import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Users, 
  FileText, 
  Clock, 
  Stethoscope, 
  LogOut, 
  Shield, 
  ClipboardList,
  Plus,
  Search,
  Calendar,
  BookOpen,
  Play,
  Menu,
  X
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTutorial } from '@/components/TutorialProvider';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface SidebarProps {
  activeView: 'clients' | 'notes' | 'calendar';
  onViewChange: (view: 'clients' | 'notes' | 'calendar') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange }) => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { startTutorial } = useTutorial();
  const [isAdmin, setIsAdmin] = useState(false);
  const [recentNotes, setRecentNotes] = useState<Array<{ id: string; title: string; created_at: string }>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (user) {
      checkAdminStatus();
      fetchRecentNotes();
    }
  }, [user]);

  // Close sidebar when view changes on mobile
  const handleViewChange = (view: 'clients' | 'notes' | 'calendar') => {
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
        .eq('role', 'admin')
        .single();
      
      setIsAdmin(!!data);
    } catch (error) {
      setIsAdmin(false);
    }
  };

  const fetchRecentNotes = async () => {
    try {
      const { data } = await supabase
        .from('client_notes')
        .select('id, title, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentNotes(data || []);
    } catch (error) {
      console.error('Error fetching recent notes:', error);
    }
  };

  // Mobile toggle button - flush to edge
  const MobileToggle = () => (
    <Button
      variant="ghost"
      size="icon"
      className="fixed top-2 left-2 z-50 md:hidden bg-card/95 backdrop-blur-sm shadow-sm border border-border/50 h-10 w-10"
      onClick={() => setIsOpen(!isOpen)}
    >
      {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
    </Button>
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
      <MobileToggle />
      <Overlay />
      <div className={cn(
        "bg-card border-r border-border p-3 md:p-6 space-y-3 md:space-y-6 flex flex-col overflow-y-auto",
        "fixed md:relative inset-y-0 left-0 z-40",
        "w-[85vw] max-w-72 md:w-80 md:max-w-none",
        "transform transition-transform duration-300 ease-in-out",
        isMobile && !isOpen ? "-translate-x-full" : "translate-x-0"
      )}>
        {/* Header */}
        <div className="space-y-3 pt-10 md:pt-0">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer">
            <div className="p-2 bg-medical-blue rounded-lg">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">ClinicalNotes</h2>
              <p className="text-sm text-muted-foreground">HIPAA Compliant</p>
            </div>
          </Link>
          
          <Button 
            className="w-full gap-2 bg-medical-blue hover:bg-medical-blue/90"
            onClick={() => handleViewChange('notes')}
            data-tutorial="new-note-btn"
          >
            <Plus className="w-4 h-4" />
            New Note
          </Button>
        </div>

        {/* Search */}
        <div className="space-y-2" data-tutorial="search-notes">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search notes..." 
              className="pl-10"
            />
          </div>
        </div>

        {/* Navigation */}
        <div className="space-y-1 md:space-y-2">
          <Button 
            variant={activeView === 'clients' ? 'default' : 'ghost'}
            className="w-full justify-start gap-2"
            onClick={() => handleViewChange('clients')}
            data-tutorial="clients-nav"
          >
            <Users className="h-4 w-4" />
            Clients
          </Button>
          <Button 
            variant={activeView === 'notes' ? 'default' : 'ghost'}
            className="w-full justify-start gap-2"
            onClick={() => handleViewChange('notes')}
          >
            <FileText className="h-4 w-4" />
            Notes
          </Button>
          <Button 
            variant={activeView === 'calendar' ? 'default' : 'ghost'}
            className="w-full justify-start gap-2"
            onClick={() => handleViewChange('calendar')}
            data-tutorial="calendar-nav"
          >
            <Calendar className="h-4 w-4" />
            Calendar
          </Button>
          {isAdmin && (
            <Button 
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={() => handleNavigate('/admin')}
              data-tutorial="admin-nav"
            >
              <Shield className="h-4 w-4" />
              Admin Dashboard
            </Button>
          )}
          {isAdmin && (
            <Button 
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={() => handleNavigate('/audit-logs')}
              data-tutorial="audit-nav"
            >
              <ClipboardList className="h-4 w-4" />
              Audit Logs
            </Button>
          )}
          <Button 
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={() => handleNavigate('/onboarding')}
            data-tutorial="onboarding-nav"
          >
            <BookOpen className="h-4 w-4" />
            Onboarding Guide
          </Button>
          <Button 
            variant="ghost"
            className="w-full justify-start gap-2 text-primary"
            onClick={() => startTutorial()}
          >
            <Play className="h-4 w-4" />
            Start Tutorial
          </Button>
        </div>

        {/* Recent Notes - Hidden on mobile to save space */}
        <div className="space-y-3 hidden md:block" data-tutorial="recent-notes">
          <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Recent Notes
          </h3>
          <div className="space-y-2">
            {recentNotes.length > 0 ? (
              recentNotes.map(note => (
                <Card key={note.id} className="p-3 hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => handleViewChange('notes')}>
                  <div className="space-y-1">
                    <h4 className="font-medium text-sm line-clamp-2">{note.title}</h4>
                    <p className="text-xs text-muted-foreground">{new Date(note.created_at).toLocaleDateString()}</p>
                  </div>
                </Card>
              ))
            ) : (
              <p className="text-xs text-muted-foreground px-2 py-2">No recent notes</p>
            )}
          </div>
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

        {/* Logout Button */}
        <Button 
          variant="outline"
          className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 mt-auto"
          onClick={async () => {
            await signOut();
            navigate('/auth');
          }}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </>
  );
};
