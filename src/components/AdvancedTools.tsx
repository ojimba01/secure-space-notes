import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useIsSuperadmin } from '@/hooks/useIsSuperadmin';
import { useViewAs } from '@/components/ViewAsProvider';
import { Button } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Settings2, Eye } from 'lucide-react';

interface Employee {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

export const AdvancedTools: React.FC = () => {
  const { isSuperadmin } = useIsSuperadmin();
  const { startViewAs } = useViewAs();
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

  if (!isSuperadmin) return null;

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
        <div className="flex items-center gap-2 text-sm font-medium"><Eye className="h-4 w-4" /> View as Employee</div>
        <p className="text-xs text-muted-foreground">Preview the app as a case manager sees it (read-only).</p>
        <Input placeholder="Search case managers…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
      </PopoverContent>
    </Popover>
  );
};
