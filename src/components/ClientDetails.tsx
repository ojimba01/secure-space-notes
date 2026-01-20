import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Calendar, FileText, Upload, Plus, Edit, Trash2, UserCog } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { FileManager } from '@/components/FileManager';
import { EditClientDialog } from '@/components/EditClientDialog';
import { ReassignClientDialog } from '@/components/ReassignClientDialog';
import { AssignmentHistory } from '@/components/AssignmentHistory';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { NotesSection } from '@/components/NotesSection';
import { CalendarView } from '@/components/CalendarView';

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  address?: string;
  case_number?: string;
  status: string;
  intake_date: string;
  date_of_birth?: string;
  notes?: string;
  assigned_employee_id?: string;
}

interface ClientDetailsProps {
  client: Client;
  onBack: () => void;
  onUpdate: () => void;
}

export const ClientDetails: React.FC<ClientDetailsProps> = ({ client, onBack, onUpdate }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [caseManagerName, setCaseManagerName] = useState<string | null>(null);

  useEffect(() => {
    checkAdminStatus();
    fetchCaseManager();
  }, [user, client.assigned_employee_id]);

  const checkAdminStatus = async () => {
    if (!user) return;
    
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      
      setIsAdmin(!!data);
    } catch (error) {
      // User is not admin
      setIsAdmin(false);
    }
  };

  const fetchCaseManager = async () => {
    if (!client.assigned_employee_id) {
      setCaseManagerName(null);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', client.assigned_employee_id)
        .maybeSingle();
      
      if (error) throw error;
      
      if (data) {
        setCaseManagerName(`${data.first_name || ''} ${data.last_name || ''} (${data.email})`.trim());
      } else {
        setCaseManagerName(null);
      }
    } catch (error) {
      setCaseManagerName(null);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', client.id);

      if (error) throw error;

      toast({
        title: "Client Deleted",
        description: "Client has been deleted successfully.",
      });

      onBack();
    } catch (error: any) {
      toast({
        title: "Error deleting client",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Clients
        </Button>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          {isAdmin && (
            <>
              <Button variant="outline" onClick={() => setReassignDialogOpen(true)}>
                <UserCog className="h-4 w-4 mr-2" />
                Reassign
              </Button>
              <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">
                  {client.first_name} {client.last_name}
                </CardTitle>
                {client.case_number && (
                  <p className="text-muted-foreground">Member ID: {client.case_number}</p>
                )}
              </div>
              <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                {client.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {client.email && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Email</p>
                <p>{client.email}</p>
              </div>
            )}
            {client.phone && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Phone</p>
                <p>{client.phone}</p>
              </div>
            )}
            {client.address && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Address</p>
                <p>{client.address}</p>
              </div>
            )}
            {client.date_of_birth && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Date of Birth</p>
                <p>{new Date(client.date_of_birth).toLocaleDateString()}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-muted-foreground">Intake Date</p>
              <p>{new Date(client.intake_date).toLocaleDateString()}</p>
            </div>
            {isAdmin && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Current Case Manager</p>
                <p>{caseManagerName || 'Unassigned'}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Client Information</CardTitle>
              </CardHeader>
              <CardContent>
                {client.notes ? (
                  <p>{client.notes}</p>
                ) : (
                  <p className="text-muted-foreground">No additional notes available.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes">
            <NotesSection clientId={client.id} />
          </TabsContent>

          <TabsContent value="files">
            <FileManager clientId={client.id} />
          </TabsContent>

          <TabsContent value="calendar">
            <CalendarView clientId={client.id} />
          </TabsContent>

          <TabsContent value="history">
            <AssignmentHistory clientId={client.id} />
          </TabsContent>
        </Tabs>
      </div>

      <EditClientDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        client={client}
        onClientUpdated={onUpdate}
      />

      <ReassignClientDialog
        open={reassignDialogOpen}
        onOpenChange={setReassignDialogOpen}
        clientId={client.id}
        clientName={`${client.first_name} ${client.last_name}`}
        currentEmployeeId={client.assigned_employee_id}
        onReassigned={onUpdate}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {client.first_name} {client.last_name}'s record
              and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};