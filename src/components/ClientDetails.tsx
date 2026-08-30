import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Calendar, FileText, FileUp, Upload, Plus, Edit, Trash2, UserCog, Archive } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { FileManager } from '@/components/FileManager';
import { EditClientDialog } from '@/components/EditClientDialog';
import { ReassignClientDialog } from '@/components/ReassignClientDialog';
import { AssignmentHistory } from '@/components/AssignmentHistory';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { CalendarView } from '@/components/CalendarView';
import { ClientWorkflowCard } from '@/components/ClientWorkflowCard';
import { AuthorizationsSection } from '@/components/AuthorizationsSection';

import { serviceStartDate } from '@/lib/workflow';
import { CloseCaseDialog } from '@/components/CloseCaseDialog';
import { ComplianceCard } from '@/components/ComplianceCard';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useIsSuperadmin } from '@/hooks/useIsSuperadmin';
import { ClientBillingTimeline } from '@/components/billing/ClientBillingTimeline';
import { ClientFormsDocuments } from '@/components/forms/ClientFormsDocuments';
import { DocumentIntakeDialog } from '@/components/DocumentIntakeDialog';
import { useViewAs } from '@/components/ViewAsProvider';

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  address?: string;
  member_id?: string;
  insurance?: string;
  level_of_need?: string;
  county?: string;
  status: string;
  intake_date: string;
  date_of_birth?: string;
  housing_stabilization_plan_date?: string;
  iat_date?: string;
  hsp_150_date?: string;
  hsp_180_date?: string;
  workflow_stage?: string | null;
  intake_status?: string | null;
  auth_30_start?: string | null;
  auth_30_number?: string | null;
  auth_150_start?: string | null;
  auth_150_number?: string | null;
  hsp_submitted?: boolean | null;
  notes?: string;
  assigned_employee_id?: string;
}

interface ClientDetailsProps {
  client: Client;
  onBack: () => void;
  onUpdate: () => void;
  /** Tab to open on. Defaults to the overview. */
  initialTab?: string;
}

export const ClientDetails: React.FC<ClientDetailsProps> = ({ client, onBack, onUpdate, initialTab }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState(initialTab ?? 'overview');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { isAdmin } = useIsAdmin();
  const { isViewingAs } = useViewAs();
  const { isSuperadmin } = useIsSuperadmin();
  const [caseManagerName, setCaseManagerName] = useState<string | null>(null);

  useEffect(() => {
    fetchCaseManager();
  }, [user, client.assigned_employee_id]);


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
          {client.workflow_stage !== 'closed' && (
            <Button variant="outline" onClick={() => setCloseDialogOpen(true)}>
              <Archive className="h-4 w-4 mr-2" />
              Close case
            </Button>
          )}
          {isAdmin && !isViewingAs && (
            <Button variant="outline" onClick={() => setReassignDialogOpen(true)}>
              <UserCog className="h-4 w-4 mr-2" />
              Reassign
            </Button>
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
                {client.member_id && (
                  <p className="text-muted-foreground">Member ID: {client.member_id}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setIntakeOpen(true)}>
                  <FileUp className="h-4 w-4 mr-2" />
                  Upload forms
                </Button>
                <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                  {client.status}
                </Badge>
              </div>
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
            {client.insurance && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Insurance</p>
                <p>{client.insurance}</p>
              </div>
            )}
            {client.level_of_need && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Level of Need (LoN)</p>
                <p>{client.level_of_need}</p>
              </div>
            )}
            {client.county && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">County</p>
                <p>{client.county}</p>
              </div>
            )}
            {isAdmin && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Current Case Manager</p>
                <p>{caseManagerName || 'Unassigned'}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <ClientWorkflowCard client={client} onUpdate={onUpdate} />

        <AuthorizationsSection clientId={client.id} onUpdate={onUpdate} />


        {client.status === 'active' && (
          <ComplianceCard
            clientId={client.id}
            clientName={`${client.first_name} ${client.last_name}`}
            levelOfNeed={client.level_of_need}
            hspStartDate={serviceStartDate(client)}
            assignedEmployeeId={client.assigned_employee_id}
            clientCreatedAt={(client as any).created_at}
            onChanged={onUpdate}
          />
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className={`grid w-full ${isSuperadmin ? 'grid-cols-5' : 'grid-cols-4'}`}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="forms">Forms</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            {isSuperadmin && <TabsTrigger value="billing">Billing</TabsTrigger>}
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent>
                {client.notes ? (
                  <p>{client.notes}</p>
                ) : (
                  <p className="text-muted-foreground">No additional notes have been added.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="forms" className="space-y-4">
            <ClientFormsDocuments
              clientId={client.id}
              clientFirstName={client.first_name}
              clientLastName={client.last_name}
            />
            <FileManager clientId={client.id} />
          </TabsContent>

          <TabsContent value="calendar">
            <CalendarView clientId={client.id} />
          </TabsContent>


          <TabsContent value="history">
            <AssignmentHistory clientId={client.id} />
          </TabsContent>

          {isSuperadmin && (
            <TabsContent value="billing">
              <ClientBillingTimeline clientId={client.id} />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {isAdmin && !isViewingAs && (
        <div className="mt-10 border-t pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Delete this record</p>
              <p className="text-sm text-muted-foreground">
                Permanently removes the client and everything attached to them. To stop working a
                case while keeping its history, close it instead.
              </p>
            </div>
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      )}

      <CloseCaseDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        clientId={client.id}
        clientName={`${client.first_name} ${client.last_name}`}
        onClosed={onUpdate}
      />

      <DocumentIntakeDialog
        open={intakeOpen}
        onOpenChange={setIntakeOpen}
        clientId={client.id}
        clientName={`${client.first_name} ${client.last_name}`}
        current={client as unknown as Record<string, unknown>}
        onApplied={onUpdate}
      />

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
            <AlertDialogTitle>Delete record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this record, including associated notes, files, calendar events, and history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Permanently delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};