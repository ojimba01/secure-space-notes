import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useIsSuperadmin } from '@/hooks/useIsSuperadmin';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useViewAs } from '@/components/ViewAsProvider';
import { Button } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Settings2, Eye, FolderUp, History, FileStack } from 'lucide-react';

interface Employee {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

const MigrationLink: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}> = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="flex w-full items-center gap-2 text-left text-sm rounded-md px-2 py-1.5 hover:bg-accent"
  >
    {icon}
    {label}
  </button>
);

export const AdvancedTools: React.FC = () => {
  const navigate = useNavigate();
  const { isSuperadmin } = useIsSuperadmin();
  const { isAdmin } = useIsAdmin();
  const { startViewAs, isViewingAs } = useViewAs();
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isSuperadmin || !open || employees.length) return;
    (async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'employee');
      const userIds = (roles ?? []).map((r) => r.user_id);
      if (!userIds.length) return;
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('user_id', userIds)
        .eq('active', true)
        .order('last_name');
      setEmployees((profs as Employee[]) ?? []);
    })();
  }, [isSuperadmin, open, employees.length]);

  // Admins get the migration utilities; previewing as a case manager shows
  // exactly what staff see, which is nothing.
  const canUseMigration = isAdmin && !isViewingAs;
  if (!isSuperadmin && !canUseMigration) return null;

  const startSession = async (e: Employee) => {
    const name = `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim();
    try {
      const { data: auth } = await supabase.auth.getUser();
      await supabase.rpc('create_audit_log', {
        _action: 'ACCESS',
        _table_name: 'view_as',
        _record_id: e.id,
        _new_data: { viewed_employee_id: e.id, viewed_name: name, superadmin_id: auth?.user?.id ?? null, action: 'view_as_started' },
      });
    } catch {
      // non-blocking
    }
    startViewAs(e.id, name);
    setOpen(false);
  };

  const filtered = employees.filter((e) =>
    `${e.first_name ?? ''} ${e.last_name ?? ''}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start gap-2 text-muted-foreground">
          <Settings2 className="h-4 w-4" />
          Advanced Tools
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 space-y-3">
        {isSuperadmin && (
          <>
            <div className="flex items-center gap-2 text-sm font-medium"><Eye className="h-4 w-4" /> Preview as case manager</div>
            <p className="text-xs text-muted-foreground">Preview the case manager experience. Changes are not saved.</p>
            <Input placeholder="Search case managers." value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="max-h-56 overflow-y-auto space-y-1">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1">No active case managers.</p>
              ) : filtered.map((e) => (
                <button
                  key={e.id}
                  onClick={() => startSession(e)}
                  className="w-full text-left text-sm rounded-md px-2 py-1.5 hover:bg-accent"
                >
                  {e.first_name} {e.last_name}
                </button>
              ))}
            </div>
          </>
        )}

        {canUseMigration && (
          <div className={isSuperadmin ? 'border-t pt-3 space-y-1' : 'space-y-1'}>
            <div className="text-sm font-medium">Data migration</div>
            <MigrationLink
              icon={<FolderUp className="h-4 w-4" />}
              label="Bulk document import"
              onClick={() => {
                setOpen(false);
                navigate('/advanced-tools');
              }}
            />
            <MigrationLink
              icon={<History className="h-4 w-4" />}
              label="Import history"
              onClick={() => {
                setOpen(false);
                navigate('/advanced-tools');
              }}
            />
            <MigrationLink
              icon={<FileStack className="h-4 w-4" />}
              label="Template management"
              onClick={() => {
                setOpen(false);
                navigate('/advanced-tools');
              }}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
