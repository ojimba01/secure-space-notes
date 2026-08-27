import React, { useState, useEffect } from 'react';
import { ComplianceEscalations } from '@/components/ComplianceEscalations';
import { TutorialProvider } from '@/components/TutorialProvider';
import { Sidebar } from '@/components/Sidebar';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Users, FileText, Calendar, Shield, UserX, UserCheck, ClipboardList, Stethoscope } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

interface Employee {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  created_at: string;
  active: boolean;
  user_roles: Array<{ role: string }>;
}

interface Stats {
  totalClients: number;
  totalNotes: number;
  totalEvents: number;
  totalEmployees: number;
  activeEmployees: number;
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'An unexpected error occurred';

const Admin = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [pendingDeactivation, setPendingDeactivation] = useState<Employee | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [stats, setStats] = useState<Stats>({
    totalClients: 0,
    totalNotes: 0,
    totalEvents: 0,
    totalEmployees: 0,
    activeEmployees: 0,
  });

  useEffect(() => {
    if (user) {
      checkAdminStatus();
    }
  }, [user]);

  const checkAdminStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user?.id)
        .in('role', ['admin', 'superadmin']);

      if (error) throw error;

      const roles = (data || []).map((r) => r.role);
      const admin = roles.length > 0;
      const superadmin = roles.includes('superadmin');

      setIsAdmin(admin);
      setIsSuperadmin(superadmin);

      if (admin) {
        fetchEmployees();
        fetchStats();
      }
    } catch (error) {
      toast({
        title: "Error checking permissions",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setCheckingAdmin(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      // Fetch profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch user roles separately
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Combine the data
      const employeesWithRoles = (profilesData || []).map(profile => {
        const roles = (rolesData || [])
          .filter(r => r.user_id === profile.user_id)
          .map(r => ({ role: r.role }));
        
        return {
          ...profile,
          user_roles: roles,
        };
      });

      // Defense-in-depth: never list hidden super-admin accounts
      const visibleEmployees = employeesWithRoles.filter(
        (e) => !e.user_roles?.some((r) => r.role === 'superadmin'),
      );

      setEmployees(visibleEmployees);
    } catch (error) {
      toast({
        title: "Could not load staff list.",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const handleToggleUserStatus = async (employee: Employee) => {
    try {
      const functionName = employee.active ? 'deactivate_user' : 'activate_user';
      const { error } = await supabase.rpc(functionName, { 
        _profile_id: employee.id 
      });

      if (error) throw error;

      toast({
        title: employee.active ? "Staff account deactivated" : "Staff account activated",
        description: `${employee.first_name} ${employee.last_name} has been ${employee.active ? 'deactivated' : 'activated'}.`,
      });

      fetchEmployees();
      fetchStats();
    } catch (error) {
      toast({
        title: "Error updating user status",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const handleStatusSwitch = (employee: Employee) => {
    if (employee.active) {
      // Deactivating is destructive — require typed confirmation
      setConfirmText('');
      setPendingDeactivation(employee);
    } else {
      handleToggleUserStatus(employee);
    }
  };

  const confirmDeactivation = async () => {
    if (!pendingDeactivation) return;
    await handleToggleUserStatus(pendingDeactivation);
    setPendingDeactivation(null);
    setConfirmText('');
  };

  const handleToggleAdmin = async (employee: Employee) => {
    const makeAdmin = !employee.user_roles?.some((r) => r.role === 'admin');
    try {
      const { error } = await supabase.rpc('set_employee_admin', {
        _profile_id: employee.id,
        _make_admin: makeAdmin,
      });

      if (error) throw error;

      toast({
        title: makeAdmin ? 'Admin granted' : 'Admin removed',
        description: `${employee.first_name} ${employee.last_name} is ${makeAdmin ? 'now an admin' : 'no longer an admin'}.`,
      });

      fetchEmployees();
    } catch (error) {
      toast({
        title: 'Error updating admin role',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };


  const fetchStats = async () => {
    try {
      const [clientsRes, notesRes, eventsRes, profilesRes, rolesRes] = await Promise.all([
        supabase.from('clients').select('id', { count: 'exact', head: true }),
        supabase.from('client_notes').select('id', { count: 'exact', head: true }),
        supabase.from('calendar_events').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id, user_id, active'),
        supabase.from('user_roles').select('user_id, role'),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;

      const superadminUserIds = new Set(
        (rolesRes.data || [])
          .filter((role) => role.role === 'superadmin')
          .map((role) => role.user_id),
      );
      const employeeProfiles = (profilesRes.data || []).filter(
        (profile) => !superadminUserIds.has(profile.user_id),
      );

      setStats({
        totalClients: clientsRes.count || 0,
        totalNotes: notesRes.count || 0,
        totalEvents: eventsRes.count || 0,
        totalEmployees: employeeProfiles.length,
        activeEmployees: employeeProfiles.filter((profile) => profile.active).length,
      });
    } catch (error) {
      toast({
        title: "Could not load dashboard metrics.",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  if (loading || checkingAdmin) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <TutorialProvider>
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar
        activeView={'clients'}
        onViewChange={(view) => navigate('/', { state: { view } })}
        onOpenNote={(noteId) => navigate('/', { state: { view: 'notes', noteId } })}
      />
      <div className="min-w-0 flex-1 space-y-6 p-6 pt-16 md:pt-6">

        {/* Header with Logo */}
        <div className="flex items-center justify-between border-b pb-4">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="p-2 bg-medical-blue rounded-lg">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">Case Notes</h2>
              <p className="text-xs text-muted-foreground">HIPAA Compliant</p>
            </div>
          </Link>
          <Button onClick={() => navigate('/audit-logs')} variant="outline">
            <ClipboardList className="h-4 w-4 mr-2" />
            View Audit Logs
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Admin dashboard</h1>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalClients}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Notes</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalNotes}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Events</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalEvents}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active staff</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeEmployees}</div>
            </CardContent>
          </Card>
        </div>

        {/* Compliance escalations */}
        <ComplianceEscalations />

        {/* Employees List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{showActiveOnly ? 'Active staff' : 'All staff'}</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show active only</span>
              <Switch checked={showActiveOnly} onCheckedChange={setShowActiveOnly} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(showActiveOnly ? employees.filter((e) => e.active) : employees).map((employee) => (
                <div key={employee.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">
                        {employee.first_name} {employee.last_name}
                      </p>
                      {!employee.active && (
                        <Badge variant="destructive" className="text-xs">
                          <UserX className="h-3 w-3 mr-1" />
                          Inactive
                        </Badge>
                      )}
                      {employee.active && (
                        <Badge variant="outline" className="text-xs">
                          <UserCheck className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{employee.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Joined: {new Date(employee.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      {employee.user_roles?.map((ur) => (
                        <Badge key={ur.role} variant={ur.role === 'admin' ? 'default' : 'secondary'}>
                          {ur.role}
                        </Badge>
                      ))}
                    </div>
                    {isSuperadmin && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Admin</span>
                        <Switch
                          checked={employee.user_roles?.some((r) => r.role === 'admin')}
                          onCheckedChange={() => handleToggleAdmin(employee)}
                        />
                      </div>
                    )}
                    {isSuperadmin && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {employee.active ? 'Active' : 'Inactive'}
                        </span>
                        <Switch
                          checked={employee.active}
                          onCheckedChange={() => handleStatusSwitch(employee)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {(showActiveOnly ? employees.filter((e) => e.active) : employees).length === 0 && (
                <p className="text-center text-muted-foreground py-8">No staff found</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={!!pendingDeactivation}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeactivation(null);
            setConfirmText('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate account?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to deactivate{' '}
              <span className="font-semibold">
                {pendingDeactivation?.first_name} {pendingDeactivation?.last_name}
              </span>
              . All clients currently assigned to them will become unassigned and
              will need to be reassigned. This preserves their records but removes
              their access. Type <span className="font-semibold">Confirm</span> to
              proceed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="confirm-deactivate">Type "Confirm"</Label>
            <Input
              id="confirm-deactivate"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Confirm"
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText !== 'Confirm'}
              onClick={(e) => {
                e.preventDefault();
                confirmDeactivation();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deactivate account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TutorialProvider>
  );
};

export default Admin;