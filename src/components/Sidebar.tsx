import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  FileText, 
  Plus, 
  Search, 
  Users, 
  Shield, 
  Clock,
  Stethoscope,
  LogOut
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

interface SidebarProps {
  activeView: 'clients' | 'notes';
  onViewChange: (view: 'clients' | 'notes') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange }) => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [recentNotes, setRecentNotes] = useState<Array<{ id: string; title: string; created_at: string }>>([]);

  useEffect(() => {
    if (user) {
      checkAdminStatus();
      fetchRecentNotes();
    }
  }, [user]);

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

  return (
    <div className="w-80 bg-card border-r border-border p-6 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-medical-blue rounded-lg">
            <Stethoscope className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-lg">ClinicalNotes</h2>
            <p className="text-sm text-muted-foreground">HIPAA Compliant</p>
          </div>
        </div>
        
        <Button className="w-full gap-2 bg-medical-blue hover:bg-medical-blue/90">
          <Plus className="w-4 h-4" />
          New Note
        </Button>
      </div>

      {/* Search */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search notes..." 
            className="pl-10"
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="space-y-2">
        <Button variant="ghost" className="w-full justify-start gap-3">
          <FileText className="w-4 h-4" />
          All Notes
        </Button>
        <Button variant="ghost" className="w-full justify-start gap-3">
          <Users className="w-4 h-4" />
          Shared with Me
        </Button>
        <Button variant="ghost" className="w-full justify-start gap-3">
          <Clock className="w-4 h-4" />
          Recent
        </Button>
      </div>

      {/* Recent Notes */}
      <div className="space-y-3">
        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Recent Notes
        </h3>
        <div className="space-y-2">
          {recentNotes.length > 0 ? (
            recentNotes.map(note => (
              <Card key={note.id} className="p-3 hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => onViewChange('notes')}>
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

      {/* Security Notice */}
      <Card className="p-4 bg-medical-green-light/20 border-medical-green/20">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-medical-green mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-medium text-sm text-medical-green">HIPAA Compliant</h4>
            <p className="text-xs text-medical-green/80">
              All notes are encrypted and stored securely according to healthcare privacy standards.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};