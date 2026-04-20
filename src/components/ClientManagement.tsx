import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { ClientCard } from '@/components/ClientCard';
import { ClientDetails } from '@/components/ClientDetails';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, CheckSquare, X, UserCog } from 'lucide-react';
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

  useEffect(() => {
    if (user) {
      fetchClients();
    }
  }, [user]);

  useEffect(() => {
    const fetchManagers = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, first_name, last_name');
      if (data) {
        const map = new Map<string, string>();
        data.forEach((p) => {
          const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
          if (name) map.set(p.id, name);
        });
        setManagerMap(map);
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
      setClients(data || []);
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

  const filteredClients = clients.filter(client =>
    `${client.first_name} ${client.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.member_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search clients by name, member ID, or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
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
              {searchTerm ? 'No clients found matching your search.' : 'No clients found. Add your first client to get started.'}
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
