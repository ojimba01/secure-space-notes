import React, { useState, useEffect } from 'react';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Users, FileText, Calendar, Shield, UserX, UserCheck, ClipboardList, Stethoscope } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

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
}

const Admin = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalClients: 0,
    totalNotes: 0,
    totalEvents: 0,
    totalEmployees: 0,
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
        .eq('role', 'admin')
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      setIsAdmin(!!data);
      
      if (data) {
        fetchEmployees();
        fetchStats();
      }
    } catch (error: any) {
      toast({
        title: "Error checking permissions",
        description: error.message,
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

      setEmployees(employeesWithRoles);
    } catch (error: any) {
      toast({
        title: "Error fetching employees",
        description: error.message,
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
        title: employee.active ? "User Deactivated" : "User Activated",
        description: `${employee.first_name} ${employee.last_name} has been ${employee.active ? 'deactivated' : 'activated'}.`,
      });

      fetchEmployees();
    } catch (error: any) {
      toast({
        title: "Error updating user status",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchStats = async () => {
    try {
      const [clientsRes, notesRes, eventsRes] = await Promise.all([
        supabase.from('clients').select('id', { count: 'exact', head: true }),
        supabase.from('client_notes').select('id', { count: 'exact', head: true }),
        supabase.from('calendar_events').select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        totalClients: clientsRes.count || 0,
        totalNotes: notesRes.count || 0,
        totalEvents: eventsRes.count || 0,
        totalEmployees: employees.length,
      });
    } catch (error: any) {
      toast({
        title: "Error fetching stats",
        description: error.message,
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
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with Logo */}
        <div className="flex items-center justify-between border-b pb-4">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="p-2 bg-medical-blue rounded-lg">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">ClinicalNotes</h2>
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
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
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
              <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalEmployees}</div>
            </CardContent>
          </Card>
        </div>

        {/* Employees List */}
        <Card>
          <CardHeader>
            <CardTitle>All Employees</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {employees.map((employee) => (
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
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {employee.active ? 'Active' : 'Inactive'}
                      </span>
                      <Switch
                        checked={employee.active}
                        onCheckedChange={() => handleToggleUserStatus(employee)}
                        disabled={employee.user_roles?.some(r => r.role === 'admin') && employee.active}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {employees.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No employees found</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Admin;