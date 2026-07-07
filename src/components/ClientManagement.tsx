import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { ClientCard } from '@/components/ClientCard';
import { ClientDetails } from '@/components/ClientDetails';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Search, CheckSquare, X, UserCog, Filter, ChevronDown, Flag, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AddClientDialog } from '@/components/AddClientDialog';
import { BulkReassignDialog } from '@/components/BulkReassignDialog';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useMyCompliance } from '@/hooks/useMyCompliance';
import { useViewAs } from '@/components/ViewAsProvider';

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
  { key: 'finished', label: 'Complete' },
  { key: 'none', label: 'No milestone' },
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
  onConsumeInitialClient?: () => void;
}

export const ClientManagement: React.FC<ClientManagementProps> = ({ initialClientId, onConsumeInitialClient }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();
  const { isViewingAs, viewAsEmployeeId } = useViewAs();
  const { behindCount } = useMyCompliance();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
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



  useEffect(() => {
    if (user) {
      fetchClients();
    }
  }, [user]);

  useEffect(() => {
    if (initialClientId && clients.length) {
      const match = clients.find((c) => c.id === initialClientId);
      if (match) {
        setSelectedClient(match);
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
              map.set(p.id, name);
              options.push({ id: p.id, name, active: p.active });
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

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      const list = data || [];
      setClients(list);
      // Keep the currently open client detail in sync with the latest data
      setSelectedClient((current) =>
        current ? list.find((c) => c.id === current.id) || current : current
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

  const activeManagerOptions = useMemo(
    () => managerOptions.filter((m) => m.active),
    [managerOptions],
  );

  const filteredClients = clients.filter((client) => {
    const matchesSearch =
      `${client.first_name} ${client.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.member_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = selectedStatuses.has(getMilestoneStatus(client));

    const lon = client.level_of_need;
    const matchesLevel =
      levelFilter === 'all' ||
      (levelFilter === 'missing' ? lon !== 'Low Level' && lon !== 'High Level' : lon === levelFilter);

    // View-as: show only the previewed employee's caseload.
    if (isViewingAs) {
      return matchesSearch && matchesStatus && matchesLevel && client.assigned_employee_id === viewAsEmployeeId;
    }

    if (!isAdmin) return matchesSearch && matchesStatus && matchesLevel;


    // A client counts as "assigned" only if its manager is a valid, selectable
    // manager option. Clients assigned to removed/superadmin accounts (e.g. the
    // old admin) are treated as unassigned so they remain filterable & visible.
    const hasValidManager =
      !!client.assigned_employee_id && managerMap.has(client.assigned_employee_id);
    const matchesManager = hasValidManager
      ? selectedManagerIds.has(client.assigned_employee_id as string)
      : includeUnassigned;

    return matchesSearch && matchesManager && matchesStatus && matchesLevel;
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
    if (allStatusesSelected) return 'All statuses';
    if (noStatusSelected) return 'No status';
    if (selectedStatuses.size === 1) {
      const key = Array.from(selectedStatuses)[0];
      return MILESTONE_STATUS_OPTIONS.find((o) => o.key === key)?.label ?? '1 status';
    }
    return `${selectedStatuses.size} statuses`;
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
        onBack={() => setSelectedClient(null)}
        onUpdate={fetchClients}
      />
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl md:text-3xl font-bold truncate">Clients</h1>
          <p className="text-sm text-muted-foreground hidden md:block">View client records, assignments, milestones, and documentation.</p>
        </div>
        {isAdmin && !selectionMode && !isViewingAs && (
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setSelectionMode(true)}>
              <CheckSquare className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Select</span>
            </Button>
            <Button
              size="sm"
              data-tutorial="add-client-btn"
              className="md:size-default"
              onClick={() => setShowAddDialog(true)}
              disabled={!isAdmin && behindCount >= 5}
              title={!isAdmin && behindCount >= 5 ? "You have 5 or more clients needing attention. Complete those touchpoints to drop below 5 before adding new clients." : undefined}
            >
              <Plus className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Add Client</span>
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
          <SelectTrigger className="w-auto min-w-[150px] shrink-0" data-tutorial="lon-filter">
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


      <div className="flex items-center gap-3">
        <div className="inline-flex items-center gap-2 bg-secondary/40 border rounded-full px-4 py-1.5 text-sm font-medium">
          <Users className="h-4 w-4 text-primary" />
          <span>
            {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''}
            {searchTerm || !allFilterSelected || !allStatusesSelected ? ' matched' : ' total'}
          </span>
        </div>
        {filteredClients.length === 0 && !loading && (
          <span className="text-xs text-muted-foreground">Adjust your filters or search to see results</span>
        )}
      </div>

      {loading ? (
        <div className="text-center py-8">Loading clients...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
          {filteredClients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              onSelect={setSelectedClient}
              selectionMode={selectionMode}
              selected={selectedIds.has(client.id)}
              onToggleSelect={toggleSelect}
              showManager={isAdmin}
              assignedManagerName={
                client.assigned_employee_id
                  ? managerMap.get(client.assigned_employee_id) ?? null
                  : null
              }
            />
          ))}
          {filteredClients.length === 0 && (
            <div className="col-span-full text-center py-8 text-muted-foreground">
              {isAdmin && noneFilterSelected
                ? 'Select at least one case manager to view results.'
                : noStatusSelected
                ? 'No milestone statuses selected — pick at least one to see clients.'
                : searchTerm
                ? 'No results match your search.'
                : 'No clients found matching the selected filters.'}
            </div>
          )}
        </div>
      )}

      <AddClientDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onClientAdded={fetchClients}
      />

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
