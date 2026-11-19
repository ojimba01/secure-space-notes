import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, FileUp, Edit, UserCog, MoreHorizontal, FileText, Archive, RotateCcw, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { StatusPill, statusWord } from '@/components/StatusPill';
import { formatDay } from '@/lib/dates';
import { useToast } from '@/hooks/use-toast';
import { ClientOverview } from '@/components/ClientOverview';
import { ReassignClientDialog } from '@/components/ReassignClientDialog';
import { CaseHistory } from '@/components/CaseHistory';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { CalendarView } from '@/components/CalendarView';
import { ClientWorkflowCard } from '@/components/ClientWorkflowCard';
import { AuthorizationsSection } from '@/components/AuthorizationsSection';
import { FromDocuments } from '@/components/FromDocuments';

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
import { MoveInDetailsCard } from '@/components/MoveInDetailsCard';
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
  billing_round?: number | null;
  restart_pending_at?: string | null;
}

interface ClientDetailsProps {
  client: Client;
  onBack: () => void;
  onUpdate: () => void | Promise<void>;
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
  const [recordVersion, setRecordVersion] = useState(0);
  const recordChanged = async () => {
    await onUpdate();
    setRecordVersion((v) => v + 1);
  };
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
        .select('first_name, last_name')
        .eq('id', client.assigned_employee_id)
        .maybeSingle();
      
      if (error) throw error;
      
      if (data) {
        setCaseManagerName(`${data.first_name || ''} ${data.last_name || ''}`.trim() || null);
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
    { value: 'documents', label: 'Suggested updates' },
  ];

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 p-4 md:px-9 md:py-8">
      <div className="space-y-4">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <button
            type="button"
            onClick={onBack}
            className="group inline-flex items-center gap-2 rounded px-1 -ml-1 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Clients
          </button>
          <span aria-hidden>/</span>
          <span className="text-muted-foreground/80">Client overview</span>
        </nav>

        {/* Whose record this is, above the bar and therefore on screen whichever
            section is open. Three clicks into Billing is exactly where somebody
            stops being sure. */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 animate-rise">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground md:text-[32px]">
                {client.first_name} {client.last_name}
              </h2>
              {client.restart_pending_at && client.status !== 'closed' ? (
                <StatusPill tone="waiting">Restart pending</StatusPill>
              ) : (
                <StatusPill tone={client.status === 'active' ? 'active' : 'closed'}>{statusWord(client.status)}</StatusPill>
              )}
              {(client.billing_round ?? 1) > 1 && (
                <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">Round {client.billing_round}</span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {[client.member_id && `Member ID: ${client.member_id}`, client.intake_date && `Client since ${formatDay(client.intake_date)}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {client.status === 'closed' && (
              <Button onClick={() => setReopenOpen(true)}>
                <RotateCcw className="h-4 w-4" />
                Reopen case
              </Button>
            )}
            {isAdmin && (
              <Button variant="outline" onClick={() => setReassignDialogOpen(true)}>
                <UserCog className="h-4 w-4" />
                Reassign
              </Button>
            )}
            {/* Edit turns Overview into its own form, so it also has to be the
                section you are looking at. */}
            <Button
              onClick={() => {
                setActiveTab('overview');
                setEditDialogOpen(true);
              }}
            >
              <Edit className="h-4 w-4" />
              {editDialogOpen ? 'Editing' : 'Edit client'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={() => setHmisOpen(true)}>
                  <FileText className="mr-2 h-4 w-4" />
                  HMIS
                </DropdownMenuItem>
                {client.workflow_stage !== 'closed' && (
                  <DropdownMenuItem onSelect={() => setCloseDialogOpen(true)} className="text-destructive focus:text-destructive">
                    <Archive className="mr-2 h-4 w-4" />
                    Close case
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b border-border bg-transparent p-0">
          {sections.map((s) => (
            <TabsTrigger
              key={s.value}
              value={s.value}
              className="relative rounded-none px-0 pb-3 pt-1 text-sm font-normal text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-none after:absolute after:inset-x-0 after:-bottom-px after:h-[3px] after:origin-left after:scale-x-0 after:rounded-full after:bg-primary after:transition-transform after:duration-300 data-[state=active]:after:scale-x-100"
            >
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <ClientOverview
            client={client as unknown as React.ComponentProps<typeof ClientOverview>['client']}
            editing={editDialogOpen}
            onDone={() => setEditDialogOpen(false)}
            onSaved={recordChanged}
            caseManagerName={caseManagerName}
            showCaseManager={isAdmin}
            refreshKey={formsVersion + recordVersion}
          />

          <ClientWorkflowCard
            key={`workflow-${client.id}-${formsVersion}-${recordVersion}`}
            client={client}
            onUpdate={() => {
              formsChanged();
              recordChanged();
            }}
            forms={
              <ClientFormsDocuments
                embedded
                clientId={client.id}
                clientFirstName={client.first_name}
                clientLastName={client.last_name}
                refreshKey={formsVersion}
                onChanged={formsChanged}
                onRecordChanged={recordChanged}
                actions={
                  <Button variant="outline" size="sm" onClick={() => setIntakeOpen(true)}>
                    <FileUp className="h-4 w-4 mr-2" />
                    <span className="sm:hidden">Upload</span>
                    <span className="hidden sm:inline">Upload documents</span>
                  </Button>
                }
              />
            }
          />

          {/* Where they are moving to, which a submitted Move-in Supports
              Request fills in and anybody can write in by hand. */}
          <MoveInDetailsCard
            clientId={client.id}
            refreshKey={recordVersion}
            readOnly={isViewingAs}
          />


          {isAdmin && !editDialogOpen && (
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
          <AuthorizationsSection key={`authorizations-${client.id}-${recordVersion}`} clientId={client.id} clientName={`${client.first_name} ${client.last_name}`} onUpdate={recordChanged} />
        </TabsContent>

        <TabsContent value="documents">
          <FromDocuments
            key={`documents-${client.id}-${recordVersion}`}
            clientId={client.id}
            onApplied={recordChanged}
          />
        </TabsContent>

        <TabsContent value="touchpoints">
          {client.status === 'active' ? (
            <ComplianceCard
              key={`compliance-${client.id}-${recordVersion}`}
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

        {/* The same list as the Forms card on the Overview, on its own tab. */}
        <TabsContent value="forms" className="space-y-4">
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setIntakeOpen(true)}>
              <FileUp className="h-4 w-4 mr-2" />
              Upload documents
            </Button>
          </div>
          <ClientFormsDocuments
            clientId={client.id}
            clientFirstName={client.first_name}
            clientLastName={client.last_name}
            refreshKey={formsVersion}
            onChanged={formsChanged}
            onRecordChanged={recordChanged}
          />
        </TabsContent>

        <TabsContent value="calendar">
          {/* Keyed on the record too: accepting a document change rebuilds the
              touchpoint schedule, and this view would otherwise still be showing
              the events that were replaced. */}
          <CalendarView key={`calendar-${client.id}-${recordVersion}`} clientId={client.id} />
        </TabsContent>

        <TabsContent value="history">
          <CaseHistory clientId={client.id} />
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
        currentEmployeeId={client.assigned_employee_id}
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
        onApplied={recordChanged}
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