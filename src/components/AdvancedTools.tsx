import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { setShowTestAccounts, showTestAccounts, visibleProfiles } from '@/lib/testAccounts';
import { useIsSuperadmin } from '@/hooks/useIsSuperadmin';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useViewAs } from '@/components/ViewAsProvider';
import { OPEN_CASE_STAGE_FILTER } from '@/lib/workflow';
import { Button } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Settings2, Eye, FolderUp, History, FileStack, FileSearch, UploadCloud, UserX, Type } from 'lucide-react';
import { TEXT_SCALES, loadTextScale, saveTextScale } from '@/lib/textScale';
import { TEXT_SCALE_CHANGED } from '@/components/TextScale';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface Employee {
  id: string;
  first_name: string | null;
  last_name: string | null;
  /** Highest role held, shown so it is obvious whose view you are borrowing. */
  role: string;
  clientCount: number;
}

const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  employee: 'Case manager',
};

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
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [inactive, setInactive] = useState<Employee[]>([]);
  const [reactivating, setReactivating] = useState<string | null>(null);
  // Text size: anyone active, superadmins included (it is about eyesight, not role).
  const [everyone, setEveryone] = useState<{ id: string; name: string }[]>([]);
  const [sizeFor, setSizeFor] = useState('');
  const [size, setSize] = useState<number | null>(null);

  // Read fresh every time the panel opens, so new, renamed and deactivated
  // staff show up without reloading the app.
  useEffect(() => {
    if (!isSuperadmin || !open) return;
    let cancelled = false;
    (async () => {
      // Every active team member, admins included: admins carry caseloads too.
      // Superadmins are not case managers, so there is nothing to preview.
      const { data: allProfs } = await supabase
        .from('profiles')
        .select('id, user_id, first_name, last_name, active')
        .order('last_name');
      if (cancelled || !allProfs?.length) return;
      const profs = allProfs.filter((p) => p.active !== false);

      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', allProfs.map((p) => p.user_id));

      // Someone can hold more than one role; show the highest.
      const rank: Record<string, number> = { superadmin: 3, admin: 2, employee: 1 };
      const bestRole = new Map<string, string>();
      for (const r of roleRows ?? []) {
        const cur = bestRole.get(r.user_id);
        if (!cur || (rank[r.role] ?? 0) > (rank[cur] ?? 0)) bestRole.set(r.user_id, r.role);
      }

      const { data: counts } = await supabase
        .from('clients')
        .select('assigned_employee_id')
        .eq('status', 'active')
        .or(OPEN_CASE_STAGE_FILTER)
        .not('assigned_employee_id', 'is', null);
      const clientCount = new Map<string, number>();
      for (const c of counts ?? []) {
        const k = c.assigned_employee_id as string;
        clientCount.set(k, (clientCount.get(k) ?? 0) + 1);
      }

      if (cancelled) return;
      setEveryone(
        visibleProfiles(profs).map((p) => ({ id: p.id, name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unnamed' })),
      );
      const toEmployee = (p: (typeof allProfs)[number]): Employee => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        role: bestRole.get(p.user_id) ?? 'employee',
        clientCount: clientCount.get(p.id) ?? 0,
      });
      setInactive(
        visibleProfiles(allProfs.filter((p) => p.active === false && bestRole.get(p.user_id) !== 'superadmin')).map(toEmployee),
      );
      setEmployees(
        visibleProfiles(profs)
          .filter((p) => bestRole.get(p.user_id) !== 'superadmin')
          .map(toEmployee),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [isSuperadmin, open]);

  useEffect(() => {
    setSize(null);
    if (!sizeFor) return;
    void loadTextScale(sizeFor).then(setSize);
  }, [sizeFor]);

  const setTextSize = async (value: number) => {
    const name = everyone.find((x) => x.id === sizeFor)?.name ?? 'This account';
    try {
      await saveTextScale(sizeFor, value);
      setSize(value);
      // Your own size changes at once; anyone else's on their next page load.
      window.dispatchEvent(new Event(TEXT_SCALE_CHANGED));
      toast({ title: 'Text size saved', description: `${name}: ${TEXT_SCALES.find((t) => t.value === value)?.label ?? value}` });
    } catch (e) {
      toast({ title: 'Unable to save text size', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const reactivate = async (e: Employee) => {
    setReactivating(e.id);
    const { error } = await supabase.rpc('activate_user', { _profile_id: e.id });
    setReactivating(null);
    if (error) {
      toast({ title: 'Unable to reactivate account', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Account reactivated', description: `${e.first_name ?? ''} ${e.last_name ?? ''} can sign in again. Reassign their clients if needed.`.trim() });
    setInactive((list) => list.filter((x) => x.id !== e.id));
    setEmployees((list) => [...list, e]);
  };

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
      <PopoverContent
        side="top"
        align="start"
        collisionPadding={8}
        // Never taller than the screen: the panel scrolls instead of running off the top.
        className="w-72 space-y-3 overflow-y-auto max-h-[var(--radix-popover-content-available-height)]"
      >
        {isSuperadmin && (
          <>
            <div className="flex items-center gap-2 text-sm font-medium"><Eye className="h-4 w-4" /> Preview as team member</div>
            <p className="text-xs text-muted-foreground">
              See the app with their caseload in front of you. Changes are not saved.
            </p>
            <Input placeholder="Search by name." value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="max-h-56 overflow-y-auto space-y-1">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1">Nobody active to preview.</p>
              ) : filtered.map((e) => (
                <button
                  key={e.id}
                  onClick={() => startSession(e)}
                  className="w-full text-left text-sm rounded-md px-2 py-1.5 hover:bg-accent"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span>{e.first_name} {e.last_name}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {ROLE_LABEL[e.role] ?? e.role}
                      {e.clientCount > 0 && ` · ${e.clientCount}`}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {isSuperadmin && (
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center gap-2 text-sm font-medium"><Type className="h-4 w-4" /> Text size</div>
            <select
              aria-label="Account"
              className="h-9 w-full rounded-md border bg-white px-2 text-sm"
              value={sizeFor}
              onChange={(e) => setSizeFor(e.target.value)}
            >
              <option value="">Choose an account</option>
              {everyone.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {sizeFor && (
              <div className="grid grid-cols-2 gap-1.5">
                {TEXT_SCALES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    disabled={size === null}
                    onClick={() => void setTextSize(t.value)}
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-sm',
                      size === t.value ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
                    )}
                  >
                    {t.label} <span className="text-xs opacity-75">{Math.round(t.value * 100)}%</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {isSuperadmin && inactive.length > 0 && (
          <div className="space-y-1 border-t pt-3">
            <div className="flex items-center gap-2 text-sm font-medium"><UserX className="h-4 w-4" /> Deactivated staff</div>
            <p className="text-xs text-muted-foreground">They cannot sign in and are hidden from staff lists.</p>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {inactive.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm">
                  <span className="truncate">{e.first_name} {e.last_name}</span>
                  <Button size="sm" variant="outline" className="h-7 shrink-0" disabled={reactivating === e.id} onClick={() => void reactivate(e)}>
                    Reactivate
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {canUseMigration && (
          <div className={isSuperadmin ? 'border-t pt-3 space-y-1' : 'space-y-1'}>
            <div className="text-sm font-medium">Data migration</div>
            <MigrationLink
              icon={<FolderUp className="h-4 w-4" />}
              label="Bulk document import"
              onClick={() => {
                setOpen(false);
                navigate('/advanced-tools?tab=import');
              }}
            />
            <MigrationLink
              icon={<UploadCloud className="h-4 w-4" />}
              label="Client details from documents"
              onClick={() => {
                setOpen(false);
                navigate('/advanced-tools?tab=clientfields');
              }}
            />
            <MigrationLink
              icon={<FileSearch className="h-4 w-4" />}
              label="Reading documents"
              onClick={() => {
                setOpen(false);
                navigate('/advanced-tools?tab=reading');
              }}
            />
            <MigrationLink
              icon={<History className="h-4 w-4" />}
              label="Import history"
              onClick={() => {
                setOpen(false);
                navigate('/advanced-tools?tab=history');
              }}
            />
            <MigrationLink
              icon={<FileStack className="h-4 w-4" />}
              label="Template management"
              onClick={() => {
                setOpen(false);
                navigate('/advanced-tools?tab=templates');
              }}
            />
          </div>
        )}

        {/* Hidden everywhere by default; this brings it back, in this browser. */}
        {(isAdmin || isSuperadmin) && (
          <label className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
            <span>
              <span className="block font-medium">Show test account</span>
              <span className="block text-xs text-muted-foreground">
                In staff lists, case logs and Team touchpoints.
              </span>
            </span>
            <Switch
              checked={showTestAccounts()}
              onCheckedChange={(on) => setShowTestAccounts(on)}
            />
          </label>
        )}
      </PopoverContent>
    </Popover>
  );
};
