import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { ClientCard } from '@/components/ClientCard';
import { ClientDetails } from '@/components/ClientDetails';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Search, CheckSquare, X, UserCog, Filter, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AddClientDialog } from '@/components/AddClientDialog';
import { BulkReassignDialog } from '@/components/BulkReassignDialog';
import { useIsAdmin } from '@/hooks/useIsAdmin';

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
}

interface ManagerOption {
  id: string;
  name: string;
  active: boolean;
}

export const ClientManagement: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();
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

  useEffect(() => {
    if (user) {
      fetchClients();
    }
  }, [user]);

  useEffect(() => {
    const fetchManagers = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, active');
      if (data) {
        const map = new Map<string, string>();
        const options: ManagerOption[] = [];
        data.forEach((p) => {
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
          setSelectedManagerIds(new Set(options.map((o) => o.id)));
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
        .order('created_at', { ascending: false });

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

    if (!isAdmin) return matchesSearch;

    const matchesManager = client.assigned_employee_id
      ? selectedManagerIds.has(client.assigned_employee_id)
      : includeUnassigned;

    return matchesSearch && matchesManager;
  });

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
    if (allFilterSelected) return 'All managers';
    if (noneFilterSelected) return 'None selected';
    if (selectedCount === 1) {
      if (includeUnassigned) return 'Unassigned only';
      const onlyId = Array.from(selectedManagerIds)[0];
      return managerMap.get(onlyId) ?? '1 manager';
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
          <p className="text-sm text-muted-foreground hidden md:block">Manage your client cases and information</p>
        </div>
        {isAdmin && !selectionMode && (
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setSelectionMode(true)}>
              <CheckSquare className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Select</span>
            </Button>
            <Button size="sm" className="md:size-default" onClick={() => setShowAddDialog(true)}>
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
            placeholder="Search clients by name, member ID, or email..."
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
                    <p className="text-xs text-muted-foreground">No active employees</p>
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
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
                ? 'No managers selected — pick at least one to see clients.'
                : searchTerm
                ? 'No clients found matching your search.'
                : 'No clients found. Add your first client to get started.'}
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
