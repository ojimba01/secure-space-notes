import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { formatDay } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { AuthorizationsFromDocuments } from '@/components/AuthorizationsFromDocuments';

import { isCaseClosed, serviceStartDate } from '@/lib/workflow';
import { CloseCaseDialog } from '@/components/CloseCaseDialog';
import { ComplianceCard } from '@/components/ComplianceCard';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useIsSuperadmin } from '@/hooks/useIsSuperadmin';
import { ClientBillingTimeline } from '@/components/billing/ClientBillingTimeline';
import { ClientFormsDocuments } from '@/components/forms/ClientFormsDocuments';
import { DocumentIntakeDialog } from '@/components/DocumentIntakeDialog';
import { HmisDialog } from '@/components/HmisDialog';
import { ReopenCaseDialog } from '@/components/ReopenCaseDialog';
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
  const [hmisOpen, setHmisOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  /**
   * Bumped whenever a form is filed or removed anywhere on this record.
   *
   * The case lifecycle card and the Forms tab both read client_forms and both
   * keep their own copy, so marking a form complete in one left the other
   * saying it had not been.
   */
  const [formsVersion, setFormsVersion] = useState(0);
  const formsChanged = () => setFormsVersion((v) => v + 1);
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { isViewingAs } = useViewAs();
  const { isSuperadmin } = useIsSuperadmin();
  const [caseManagerName, setCaseManagerName] = useState<string | null>(null);

  useEffect(() => {
    fetchCaseManager();
  }, [user, client.assigned_employee_id]);

  // A closed case belongs to Admin and Superadmin. Staff can reach this record
  // for a moment - it is open on screen when they close it themselves, and a
  // link can still point at it - so the record shows them the way out rather
  // than the client. Everything under it is closed to them in the database;
  // this is what stops them staring at a page of empty tabs wondering why.
  //
  // It waits on the role rather than assuming staff: an administrator opening a
  // closed record would otherwise be thrown off it before their role resolved.
  const closedToThisViewer = isCaseClosed(client) && !adminLoading && !isAdmin;
  useEffect(() => {
    if (closedToThisViewer) onBack();
  }, [closedToThisViewer, onBack]);
  if (closedToThisViewer) return null;

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

  /**
   * The record's sections, as a bar rather than a scroll.
   *
   * Everything here used to sit one under another, so the only way to learn
   * that a client had an authorizations panel was to scroll past the case
   * overview and hope. A bar says what a record holds before you go looking.
   */
  const sections = [
    { value: 'overview', label: 'Overview' },
    { value: 'authorizations', label: 'Authorizations' },
    { value: 'touchpoints', label: 'Touchpoints' },
    { value: 'forms', label: 'Forms' },
    { value: 'calendar', label: 'Calendar' },
    { value: 'history', label: 'History' },
    ...(isSuperadmin ? [{ value: 'billing', label: 'Billing' }] : []),
  ];

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Clients
        </Button>

        <div className="flex flex-wrap gap-2">
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

      {/* Whose record this is, above the bar and therefore on screen whichever
          section is open. Three clicks into Billing is exactly where somebody
          stops being sure. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold leading-tight">
            {client.first_name} {client.last_name}
          </h2>
          {client.member_id && (
            <p className="text-sm text-muted-foreground">Member ID: {client.member_id}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {client.status === 'closed' && (
            <Button size="sm" onClick={() => setReopenOpen(true)}>
              Reopen case
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setHmisOpen(true)}>
            HMIS
          </Button>
          <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
            {client.status}
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent p-0">
          {sections.map((s) => (
            <TabsTrigger
              key={s.value}
              value={s.value}
              className="rounded-none border-b-2 border-transparent px-3 py-2 text-sm font-medium data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardContent className="grid grid-cols-1 gap-4 pt-6 md:grid-cols-2 lg:grid-cols-3">
              {client.notes && (
                <div className="md:col-span-2 lg:col-span-3">
                  <p className="text-sm font-medium text-muted-foreground">Notes</p>
                  <p className="whitespace-pre-wrap">{client.notes}</p>
                </div>
              )}
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
                  <p>{formatDay(client.date_of_birth)}</p>
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-muted-foreground">Intake Date</p>
                <p>{formatDay(client.intake_date)}</p>
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

          <ClientWorkflowCard
            key={`workflow-${formsVersion}`}
            client={client}
            onUpdate={() => {
              formsChanged();
              onUpdate();
            }}
          />

          {isAdmin && !isViewingAs && (
            <div className="border-t pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Delete this record</p>
                  <p className="text-sm text-muted-foreground">
                    Permanently removes the client and everything attached to them. To stop working
                    a case while keeping its history, close it instead.
                  </p>
                </div>
                <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="authorizations" className="space-y-6">
          <AuthorizationsFromDocuments clientId={client.id} onApplied={onUpdate} />
          <AuthorizationsSection clientId={client.id} onUpdate={onUpdate} />
        </TabsContent>

        <TabsContent value="touchpoints">
          {client.status === 'active' ? (
            <ComplianceCard
              clientId={client.id}
              clientName={`${client.first_name} ${client.last_name}`}
              levelOfNeed={client.level_of_need}
              hspStartDate={serviceStartDate(client)}
              assignedEmployeeId={client.assigned_employee_id}
              clientCreatedAt={(client as any).created_at}
              onChanged={onUpdate}
            />
          ) : (
            <p className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
              Touchpoints are only tracked while a case is open. Nothing logged has been deleted.
            </p>
          )}
        </TabsContent>

        <TabsContent value="forms" className="space-y-4">
          {/* Both ways of getting a document onto a record live here now. They
              were one button apart in wording and a whole screen apart in
              place: "Upload forms" in the header read documents to fill in the
              record, while the identical-sounding button in this section filed
              one against a form type. */}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setIntakeOpen(true)}>
              <FileUp className="h-4 w-4 mr-2" />
              Read documents to fill in this record
            </Button>
          </div>

          <ClientFormsDocuments
            clientId={client.id}
            clientFirstName={client.first_name}
            clientLastName={client.last_name}
            refreshKey={formsVersion}
            onChanged={formsChanged}
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

      <CloseCaseDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        clientId={client.id}
        clientName={`${client.first_name} ${client.last_name}`}
        // A closed case is not on the client list any more, so staying on
        // its record leaves somebody looking at a page they cannot get back
        // to. Refresh the list and go to it.
        onClosed={() => {
          onUpdate();
          onBack();
        }}
      />

      <ReopenCaseDialog
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        clientId={client.id}
        clientName={`${client.first_name} ${client.last_name}`.trim()}
        onReopened={onUpdate}
      />

      <HmisDialog
        open={hmisOpen}
        onOpenChange={setHmisOpen}
        clientId={client.id}
        client={client as unknown as import("@/lib/hmis").HmisClient}
        caseManager={caseManagerName}
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