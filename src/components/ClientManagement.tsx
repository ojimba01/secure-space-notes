import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { isTestAccount, showTestAccounts } from '@/lib/testAccounts';
import { ClientRow, ClientTableHeader } from '@/components/ClientRow';
import { RestartAuthorizationDialog } from '@/components/RestartAuthorizationDialog';
import { ClientDetails } from '@/components/ClientDetails';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Search, CheckSquare, X, UserCog, Filter, ChevronDown, Flag, Users, PhoneMissed } from 'lucide-react';
import { AwaitingIntakeCalls } from '@/components/intakeCalls/AwaitingIntakeCalls';
import { ReportCallDialog, type ReportCallFor } from '@/components/intakeCalls/ReportCallDialog';
import { markIntakeCallReached } from '@/lib/intakeCalls';
import { NewRibbon, useNewRibbon } from '@/components/WhatsNew';
import { useToast } from '@/hooks/use-toast';
import { AddClientDialog } from '@/components/AddClientDialog';
import { AddTouchpointDialog } from '@/components/AddTouchpointDialog';
import { STAGE_LABEL, WORKFLOW_STAGES, displayStage, isCaseClosed } from '@/lib/workflow';
import { BulkReassignDialog } from '@/components/BulkReassignDialog';
import { CloseCaseDialog } from '@/components/CloseCaseDialog';
import { ReopenCaseDialog } from '@/components/ReopenCaseDialog';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useMyCompliance } from '@/hooks/useMyCompliance';
import { useViewAs } from '@/components/ViewAsProvider';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { PDF_TEMPLATES, TemplateFillDialog } from '@/components/forms/TemplateFillDialog';
import { TouchpointReminderPopup } from '@/components/TouchpointReminderPopup';

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  address?: string;
  member_id?: string;
  status: string;
  intake_date: string;
  date_of_birth?: string;
  notes?: string;
  assigned_employee_id?: string | null;
  iat_date?: string | null;
  hsp_150_date?: string | null;
  hsp_180_date?: string | null;
  level_of_need?: string | null;
  workflow_stage?: string | null;
  created_at?: string;
  /** 'awaiting' until the intake call reaches them (src/lib/intakeCalls.ts). */
  intake_call_status?: string | null;
}

interface ManagerOption {
  id: string;
  name: string;
  active: boolean;
}

type MilestoneStatusKey = 'overdue' | 'due_soon' | 'on_track' | 'finished' | 'none';

const MILESTONE_STATUS_OPTIONS: { key: MilestoneStatusKey; label: string }[] = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'due_soon', label: 'Due soon' },
  { key: 'on_track', label: 'On track' },
  { key: 'finished', label: 'Finished' },
  { key: 'none', label: 'No authorization dates' },
];

const addDaysTo = (dateStr: string, days: number) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d;
};

const startOfToday = () => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
};

// Returns the milestone status bucket for a client, mirroring ClientCard/MilestoneTracker logic.
const getMilestoneStatus = (client: Client): MilestoneStatusKey => {
  const milestones = [
    { start: client.iat_date, offset: 30, finished: !!client.hsp_150_date },
    { start: client.hsp_150_date, offset: 150, finished: !!client.hsp_180_date },
    { start: client.hsp_180_date, offset: 180, finished: false },
  ].filter((m) => !!m.start);

  if (milestones.length === 0) return 'none';

  // Active = not finished milestones
  const active = milestones.filter((m) => !m.finished);
  if (active.length === 0) return 'finished';

  const today = startOfToday().getTime();
  let due_soon = false;
  for (const m of active) {
    const due = addDaysTo(m.start as string, m.offset).getTime();
    const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'overdue';
    if (diffDays <= 14) due_soon = true;
  }
  return due_soon ? 'due_soon' : 'on_track';
};

interface ClientManagementProps {
  initialClientId?: string | null;
  /** Tab to open the client record on, e.g. 'intake'. */
  initialTab?: string;
  onConsumeInitialClient?: () => void;
  /** Fires whenever the open record changes, so the page can remember it. */
  onOpenClientChange?: (clientId: string | null) => void;
}

export const ClientManagement: React.FC<ClientManagementProps> = ({ initialClientId, initialTab, onConsumeInitialClient, onOpenClientChange }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { isViewingAs, viewAsEmployeeId } = useViewAs();
  const { overdueCount: behindCount } = useMyCompliance();
  const [clients, setClients] = useState<Client[]>([]);
  /** client id -> documents on that client this viewer can open. */
  const [documentCounts, setDocumentCounts] = useState<Map<string, number>>(new Map());
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  /** A client just created, waiting for the list to reload before opening. */
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null);
  const [selectedClientTab, setSelectedClientTab] = useState<string | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  /** The client just created, waiting for their first touchpoint. */
  /** The client whose case the list is closing, if any. */
  const [closingClient, setClosingClient] = useState<Client | null>(null);
  const [reopeningClient, setReopeningClient] = useState<Client | null>(null);
  const [restartingClient, setRestartingClient] = useState<Client | null>(null);
  const [touchpointFor, setTouchpointFor] = useState<
    { id: string; name: string; levelOfNeed: string | null } | null
  >(null);
  const myProfileId = useEffectiveProfileId();
  /** A Client Intake opened with Start intake: the client it is for. */
  const [intakeFor, setIntakeFor] = useState<{ id: string; name: string } | null>(null);
  const [myName, setMyName] = useState('');
  useEffect(() => {
    if (!myProfileId) return;
    void supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', myProfileId)
      .maybeSingle()
      .then(({ data }) => setMyName(`${data?.first_name ?? ''} ${data?.last_name ?? ''}`.trim()));
  }, [myProfileId]);
  /** An unanswered intake call being reported: for a new client, or one already waiting. */
  const [reportFor, setReportFor] = useState<ReportCallFor | null>(null);
  const [callsKey, setCallsKey] = useState(0);
  const callsRibbon = useNewRibbon('intake-calls');
  /** Bumped after a reminder's touchpoint is handled, so the rest show again. */
  const [reminderRound, setReminderRound] = useState(0);
  const [fromReminder, setFromReminder] = useState(false);
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkReassign, setShowBulkReassign] = useState(false);
  const [managerMap, setManagerMap] = useState<Map<string, string>>(new Map());
  const [managerOptions, setManagerOptions] = useState<ManagerOption[]>([]);
  const [selectedManagerIds, setSelectedManagerIds] = useState<Set<string>>(new Set());
  const [includeUnassigned, setIncludeUnassigned] = useState(true);
  const [filterInitialized, setFilterInitialized] = useState(false);
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [selectedStatuses, setSelectedStatuses] = useState<Set<MilestoneStatusKey>>(
    new Set(MILESTONE_STATUS_OPTIONS.map((o) => o.key)),
  );



  // Wait for the role to resolve: the list is filtered by it, and fetching
  // before it is known would leave an admin looking at a staff-shaped list.
  useEffect(() => {
    if (user && !adminLoading) {
      fetchClients();
      fetchDocumentCounts();
    }
  }, [user, adminLoading, isAdmin, stageFilter]);

  useEffect(() => {
    if (!pendingOpenId) return;
    const match = clients.find((c) => c.id === pendingOpenId);
    if (match) {
      setSelectedClient(match);
      onOpenClientChange?.(match.id);
      setPendingOpenId(null);
    }
  }, [pendingOpenId, clients]);

  useEffect(() => {
    if (initialClientId && clients.length) {
      const match = clients.find((c) => c.id === initialClientId);
      if (match) {
        setSelectedClient(match);
        onOpenClientChange?.(match.id);
        onConsumeInitialClient?.();
      }
    }
  }, [initialClientId, clients]);

  useEffect(() => {
    const fetchManagers = async () => {
      const [{ data }, { data: roleRows }] = await Promise.all([
        supabase.from('profiles').select('id, user_id, first_name, last_name, active'),
        supabase.from('user_roles').select('user_id, role'),
      ]);
      if (data) {
        const superAdminUserIds = new Set(
          (roleRows ?? [])
            .filter((r) => r.role === 'superadmin')
            .map((r) => r.user_id),
        );
        const map = new Map<string, string>();
        const options: ManagerOption[] = [];
        data
          .filter((p) => !superAdminUserIds.has(p.user_id))
          .forEach((p) => {
            const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
            if (name) {
              // Still named on a card it holds; just not offered as a filter.
              map.set(p.id, name);
              if (showTestAccounts() || !isTestAccount(p)) {
                options.push({ id: p.id, name, active: p.active });
              }
            }
          });
        options.sort((a, b) => a.name.localeCompare(b.name));
        setManagerMap(map);
        setManagerOptions(options);
        if (!filterInitialized) {
          setSelectedManagerIds(new Set(options.filter((o) => o.active).map((o) => o.id)));
          setIncludeUnassigned(true);
          setFilterInitialized(true);
        }
      }
    };

    if (isAdmin) fetchManagers();
  }, [isAdmin]);

  /**
   * How many documents sit on each client, counted through the same policies
   * that decide the Forms tab — so the paperclip counts what this person can
   * actually open, not what exists.
   *
   * A failure here leaves the counts empty and no paperclip anywhere. That is
   * the right way round: the list still works, and nothing claims a document
   * that is not there.
   */
  const fetchDocumentCounts = async () => {
    const { data, error } = await supabase.from('client_forms').select('client_id');
    if (error) return;
    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      counts.set(row.client_id, (counts.get(row.client_id) ?? 0) + 1);
    }
    setDocumentCounts(counts);
  };

  // Ended authorizations this person has acknowledged, so their cards lose
  // the red outline (authorization_end_acknowledgements).
  const [acknowledgedEnds, setAcknowledgedEnds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!user) return;
    // Newer than the generated types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void Promise.resolve((supabase.from as any)('authorization_end_acknowledgements').select('client_id, end_date'))
      .then(({ data }: { data: { client_id: string; end_date: string }[] | null }) =>
        setAcknowledgedEnds(new Set((data ?? []).map((r) => `${r.client_id}:${r.end_date}`))),
      )
      .catch(() => undefined);
  }, [user]);
  const acknowledgeEnd = async (client: Client, endDate: string) => {
    setAcknowledgedEnds((prev) => new Set(prev).add(`${client.id}:${endDate}`));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from as any)('authorization_end_acknowledgements')
      .upsert({ client_id: client.id, end_date: endDate, user_id: user?.id }, { onConflict: 'user_id,client_id,end_date', ignoreDuplicates: true });
    if (error) {
      setAcknowledgedEnds((prev) => {
        const next = new Set(prev);
        next.delete(`${client.id}:${endDate}`);
        return next;
      });
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    }
  };

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      // A case manager sees every client assigned to them.
      //
      // They used not to: the list showed setup-complete clients only, on the
      // reasoning that a client missing an HSP submission, a start date or a
      // level of need is Admin work and staff could not act on it. What that
      // actually did was hide 22 clients from the people carrying them —
      // Anie was assigned 30 and could see 23 — with nothing on screen to say
      // why, or even that anyone was missing.
      //
      // So they are shown, and what each one still needs is shown with them.
      // Hiding a client does not get their paperwork finished; it only stops
      // the person who would chase it from knowing they exist.
      const all = data || [];
      // A closed case is not work, so it is out of the list entirely - out of
      // the default view and out of All case stages - and comes back only when
      // somebody asks for the closed stage by name. One control instead of a
      // filter and a toggle that had to agree with each other.
      //
      // And only an administrator can ask. A closed case is theirs to see:
      // staff lose sight of it the moment it closes, here and everywhere else.
      // The database says the same thing, so this is the list agreeing with it
      // rather than the only thing enforcing it.
      const list =
        isAdmin && stageFilter === 'closed' ? all : all.filter((c) => !isCaseClosed(c));
      setClients(list);
      // Keep the currently open client detail in sync with the latest data,
      // even when a change (closing, undoing a restart) takes it off the list.
      setSelectedClient((current) =>
        current ? all.find((c) => c.id === current.id) || current : current
      );
    } catch (error: any) {
      toast({
        title: "Error fetching clients",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Closed is an administrator's filter. Offering it to staff would be a
  // control that can only ever come back empty.
  const stageOptions = useMemo(
    () => WORKFLOW_STAGES.filter((st) => st !== 'closed' || isAdmin),
    [isAdmin],
  );

  const activeManagerOptions = useMemo(
    () => managerOptions.filter((m) => m.active),
    [managerOptions],
  );

  /**
   * Waiting for their intake call: shown together at the top, whatever the
   * filters say, so none of them is missed.
   */
  const awaitingClients = clients.filter(
    (c) =>
      c.intake_call_status === 'awaiting' &&
      !isCaseClosed(c) &&
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const filteredClients = clients.filter((client) => client.intake_call_status !== 'awaiting').filter((client) => {
    const matchesSearch =
      `${client.first_name} ${client.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.member_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = selectedStatuses.has(getMilestoneStatus(client));

    const matchesStage = stageFilter === 'all' || displayStage(client) === stageFilter;

    const lon = client.level_of_need;
    const matchesLevel =
      levelFilter === 'all' ||
      (levelFilter === 'missing' ? lon !== 'Low Level' && lon !== 'High Level' : lon === levelFilter);

    // View-as: show only the previewed employee's caseload.
    if (isViewingAs) {
      return matchesSearch && matchesStatus && matchesLevel && matchesStage && client.assigned_employee_id === viewAsEmployeeId;
    }

    if (!isAdmin) return matchesSearch && matchesStatus && matchesLevel && matchesStage;


    // A client counts as "assigned" only if its manager is a valid, selectable
    // manager option. Clients assigned to removed/superadmin accounts (e.g. the
    // old admin) are treated as unassigned so they remain filterable & visible.
    const hasValidManager =
      !!client.assigned_employee_id && managerMap.has(client.assigned_employee_id);
    const matchesManager = hasValidManager
      ? selectedManagerIds.has(client.assigned_employee_id as string)
      : includeUnassigned;

    return matchesSearch && matchesManager && matchesStatus && matchesLevel && matchesStage;
  });

  const allStatusesSelected = selectedStatuses.size === MILESTONE_STATUS_OPTIONS.length;
  const noStatusSelected = selectedStatuses.size === 0;

  const toggleStatus = (key: MilestoneStatusKey) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllStatuses = () => {
    setSelectedStatuses((prev) =>
      prev.size === MILESTONE_STATUS_OPTIONS.length
        ? new Set()
        : new Set(MILESTONE_STATUS_OPTIONS.map((o) => o.key)),
    );
  };

  const statusButtonLabel = (() => {
    if (allStatusesSelected) return 'All authorizations';
    if (noStatusSelected) return 'None chosen';
    if (selectedStatuses.size === 1) {
      const key = Array.from(selectedStatuses)[0];
      return MILESTONE_STATUS_OPTIONS.find((o) => o.key === key)?.label ?? '1 chosen';
    }
    return `${selectedStatuses.size} chosen`;
  })();


  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allFilteredSelected =
    filteredClients.length > 0 && filteredClients.every((c) => selectedIds.has(c.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredClients.map((c) => c.id)));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const totalFilterOptions = activeManagerOptions.length + 1; // +1 for "Unassigned"
  const selectedCount =
    activeManagerOptions.filter((o) => selectedManagerIds.has(o.id)).length +
    (includeUnassigned ? 1 : 0);
  const allFilterSelected = selectedCount === totalFilterOptions;

  /**
   * What the number beside the list is counting, said in full.
   *
   * It used to read "N clients total", and "total" is a claim about the whole
   * agency. It was not one: closed cases are out of this list, and picking a
   * stage narrowed it further while the word stayed, so a stage of 12 read as
   * an agency of 12. Now the number says which of the three it is -- the open
   * caseload, what a search or filter matched, or the closed cases an
   * administrator asked for by name.
   */
  const countPhrase = (() => {
    const n = filteredClients.length;
    const plural = n === 1 ? '' : 's';
    if (stageFilter === 'closed') return `${n} closed client${plural}`;
    const narrowed =
      !!searchTerm || !allFilterSelected || !allStatusesSelected || stageFilter !== 'all';
    return narrowed ? `${n} client${plural} matched` : `${n} open client${plural}`;
  })();

  const noneFilterSelected = selectedCount === 0;

  const toggleAllFilter = () => {
    if (allFilterSelected) {
      setSelectedManagerIds(new Set());
      setIncludeUnassigned(false);
    } else {
      setSelectedManagerIds(new Set(activeManagerOptions.map((o) => o.id)));
      setIncludeUnassigned(true);
    }
  };

  const toggleManager = (id: string) => {
    setSelectedManagerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filterButtonLabel = (() => {
    if (allFilterSelected) return 'All case managers';
    if (noneFilterSelected) return 'None selected';
    if (selectedCount === 1) {
      if (includeUnassigned) return 'Unassigned only';
      const onlyId = activeManagerOptions
        .map((o) => o.id)
        .find((id) => selectedManagerIds.has(id));
      return (onlyId && managerMap.get(onlyId)) ?? '1 manager';
    }
    return `${selectedCount} selected`;
  })();

  if (selectedClient) {
    return (
      <ClientDetails 
        client={selectedClient} 
        onBack={() => { setSelectedClient(null); onOpenClientChange?.(null); }}
        onUpdate={fetchClients}
        initialTab={selectedClientTab ?? initialTab}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-5 p-4 md:px-9 md:py-8">
      <TouchpointReminderPopup
        key={reminderRound}
        employeeId={myProfileId}
        onCompleteNow={(r) => {
          setFromReminder(true);
          setTouchpointFor({ id: r.client_id, name: r.clientName, levelOfNeed: r.levelOfNeed });
        }}
      />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground md:text-[32px]">Clients</h1>
            {!loading && (
              <span key={countPhrase} className="animate-pop rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                {countPhrase}
              </span>
            )}
          </div>
        </div>
        {!selectionMode && (
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setSelectionMode(true)}>
                <CheckSquare className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Select</span>
              </Button>
            )}
            <span className="relative">
              <Button
                size="sm"
                variant="outline"
                className="md:size-default border-amber-400"
                onClick={() => setReportFor({ kind: 'new' })}
              >
                <PhoneMissed className="h-4 w-4 md:mr-2 text-amber-600" />
                <span className="hidden md:inline">Report unanswered call</span>
              </Button>
              {callsRibbon && <NewRibbon />}
            </span>
            <Button
              size="sm"
              className="md:size-default"
              onClick={() => setShowAddDialog(true)}
              disabled={!isAdmin && behindCount >= 5}
              title={!isAdmin && behindCount >= 5 ? "You have 5 or more clients needing attention. Complete those touchpoints to drop below 5 before taking on new clients." : undefined}
            >
              <Plus className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Add new client</span>
              <span className="md:hidden">Add</span>
            </Button>
          </div>
        )}
        {isAdmin && selectionMode && (
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button size="sm" variant="outline" onClick={toggleSelectAll}>
              {allFilteredSelected ? 'Clear All' : 'Select All'}
            </Button>
            <Button
              size="sm"
              onClick={() => setShowBulkReassign(true)}
              disabled={selectedIds.size === 0}
            >
              <UserCog className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Reassign</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={exitSelectionMode}>
              <X className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Cancel</span>
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, member ID, or email."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        {isAdmin && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="shrink-0">
                <Filter className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">{filterButtonLabel}</span>
                <ChevronDown className="h-4 w-4 md:ml-1 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-0">
              <div className="p-3 border-b">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={allFilterSelected}
                    onCheckedChange={toggleAllFilter}
                  />
                  <span className="text-sm font-medium">All</span>
                </label>
              </div>
              <ScrollArea className="max-h-72">
                <div className="p-3 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={includeUnassigned}
                      onCheckedChange={(v) => setIncludeUnassigned(!!v)}
                    />
                    <span className="text-sm text-red-600 dark:text-red-500">Unassigned</span>
                  </label>
                  {activeManagerOptions.map((opt) => (
                    <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={selectedManagerIds.has(opt.id)}
                        onCheckedChange={() => toggleManager(opt.id)}
                      />
                      <span className="text-sm">{opt.name}</span>
                    </label>
                  ))}
                  {activeManagerOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">No active case managers</p>
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        )}
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[210px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All case stages</SelectItem>
            {stageOptions.map((st) => (
              <SelectItem key={st} value={st}>{STAGE_LABEL[st]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="shrink-0">
              <Flag className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">{statusButtonLabel}</span>
              <ChevronDown className="h-4 w-4 md:ml-1 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-0">
            <div className="p-3 border-b">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={allStatusesSelected}
                  onCheckedChange={toggleAllStatuses}
                />
                <span className="text-sm font-medium">All statuses</span>
              </label>
            </div>
            <div className="p-3 space-y-2">
              {MILESTONE_STATUS_OPTIONS.map((opt) => (
                <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selectedStatuses.has(opt.key)}
                    onCheckedChange={() => toggleStatus(opt.key)}
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-auto min-w-[150px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            <SelectItem value="Low Level">Low Level</SelectItem>
            <SelectItem value="High Level">High Level</SelectItem>
            <SelectItem value="missing">Missing level of need</SelectItem>
          </SelectContent>
        </Select>
      </div>


      {!loading && (
        <AwaitingIntakeCalls
          clients={awaitingClients}
          refreshKey={callsKey}
          managerName={isAdmin ? (id) => (id ? managerMap.get(id) ?? null : null) : undefined}
          onClosedOut={() => void fetchClients()}
          onOpen={(c) => {
            setSelectedClient(clients.find((x) => x.id === c.id) ?? null);
            onOpenClientChange?.(c.id);
          }}
          onReportCall={(c) => setReportFor({ kind: 'existing', clientId: c.id, clientName: `${c.first_name} ${c.last_name}` })}
          onStartIntake={async (c) => {
            if (!myProfileId) return;
            try {
              await markIntakeCallReached(c.id, myProfileId);
            } catch (e) {
              toast({ title: 'Could not start the intake', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
              return;
            }
            // Straight into the Client Intake for this person.
            setIntakeFor({ id: c.id, name: `${c.first_name} ${c.last_name}` });
          }}
        />
      )}

      {intakeFor && myProfileId && (
        <TemplateFillDialog
          template={PDF_TEMPLATES.find((t) => t.formType === 'Client Intake' && !t.mco) ?? null}
          profileId={myProfileId}
          signerName={myName || 'Staff'}
          lockedClientId={intakeFor.id}
          lockedClientName={intakeFor.name}
          onClose={() => {
            const id = intakeFor.id;
            setIntakeFor(null);
            // Back to the client's record, on its Forms tab.
            void fetchClients().then(() => {
              setSelectedClientTab('forms');
              setPendingOpenId(id);
            });
          }}
          onSubmitted={() => void fetchClients()}
        />
      )}

      <ReportCallDialog
        target={reportFor}
        onClose={() => setReportFor(null)}
        onSaved={async () => {
          await fetchClients();
          setCallsKey((k) => k + 1);
        }}
      />

      {loading ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-6 border-b border-border px-6 py-5 last:border-0">
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="animate-rise rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Search className="mx-auto mb-3 h-8 w-8 animate-float text-muted-foreground/60" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            {isAdmin && noneFilterSelected
              ? 'Select at least one case manager to view results.'
              : noStatusSelected
              ? 'Nothing chosen. Pick at least one to see clients.'
              : searchTerm
              ? 'No results match your search.'
              : 'No clients found matching the selected filters.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <ClientTableHeader showManager={isAdmin} selectionMode={selectionMode} />
          <div className="stagger divide-y divide-border/70">
            {filteredClients.map((client) => (
              <ClientRow
                key={client.id}
                client={client}
                onSelect={(c) => { setSelectedClient(c); onOpenClientChange?.(c?.id ?? null); }}
                selectionMode={selectionMode}
                selected={selectedIds.has(client.id)}
                onToggleSelect={toggleSelect}
                showManager={isAdmin}
                onCloseCase={setClosingClient}
                // Closed cases only appear on an administrator's own filter, and
                // reopening one is an administrator's update, so the item is
                // never offered to somebody who could not carry it out.
                onReopenCase={isAdmin ? setReopeningClient : undefined}
                onRestart={isAdmin ? setRestartingClient : undefined}
                acknowledgedEnds={acknowledgedEnds}
                onAcknowledgeEnd={acknowledgeEnd}
                assignedManagerName={
                  client.assigned_employee_id
                    ? managerMap.get(client.assigned_employee_id) ?? null
                    : null
                }
              />
            ))}
          </div>
        </div>
      )}

      <AddClientDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onClientAdded={async (created, next) => {
          await fetchClients();
          // Both jobs start on the client's Forms tab: the intake is the first
          // row of its checklist, and Upload forms sits at the top of the
          // record. Dropping somebody back on the client list to find their
          // way there is the step worth removing.
          if (created && next) {
            setSelectedClientTab('forms');
            setPendingOpenId(created.id);
          }
        }}
        onAddTouchpoint={async (created) => {
          await fetchClients();
          setTouchpointFor(created);
        }}
        onNoAnswer={() => setReportFor({ kind: 'new' })}
      />

      <AddTouchpointDialog
        open={!!touchpointFor}
        onOpenChange={(open) => {
          if (open) return;
          setTouchpointFor(null);
          if (fromReminder) {
            setFromReminder(false);
            setReminderRound((n) => n + 1);
          }
        }}
        context={
          touchpointFor
            ? {
                clientId: touchpointFor.id,
                clientName: touchpointFor.name,
                levelOfNeed: touchpointFor.levelOfNeed,
                // Locked: a client created a moment ago is not yet
                // setup-complete, so it would not appear in the picker.
                locked: true,
              }
            : null
        }
        onSaved={() => {
          setTouchpointFor(null);
          if (fromReminder) {
            setFromReminder(false);
            setReminderRound((n) => n + 1);
          }
          fetchClients();
        }}
      />




      {closingClient && (
        <CloseCaseDialog
          open
          onOpenChange={(o) => !o && setClosingClient(null)}
          clientId={closingClient.id}
          clientName={`${closingClient.first_name} ${closingClient.last_name}`}
          onClosed={() => {
            setClosingClient(null);
            fetchClients();
          }}
        />
      )}

      {restartingClient && (
        <RestartAuthorizationDialog
          open
          onOpenChange={(o) => !o && setRestartingClient(null)}
          clientId={restartingClient.id}
          clientName={`${restartingClient.first_name} ${restartingClient.last_name}`}
          onStarted={() => {
            setRestartingClient(null);
            fetchClients();
          }}
        />
      )}

      {reopeningClient && (
        <ReopenCaseDialog
          open
          onOpenChange={(o) => !o && setReopeningClient(null)}
          clientId={reopeningClient.id}
          currentEmployeeId={reopeningClient.assigned_employee_id}
          clientName={`${reopeningClient.first_name} ${reopeningClient.last_name}`}
          onReopened={() => {
            setReopeningClient(null);
            fetchClients();
          }}
        />
      )}

      <BulkReassignDialog
        open={showBulkReassign}
        onOpenChange={setShowBulkReassign}
        clientIds={Array.from(selectedIds)}
        onReassigned={() => {
          fetchClients();
          exitSelectionMode();
        }}
      />
    </div>
  );
};
