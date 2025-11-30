import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { History, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

interface AssignmentRecord {
  id: string;
  created_at: string;
  reason?: string;
  from_employee: {
    first_name?: string;
    last_name?: string;
    email: string;
  } | null;
  to_employee: {
    first_name?: string;
    last_name?: string;
    email: string;
  };
  reassigned_by_user: {
    first_name?: string;
    last_name?: string;
    email: string;
  };
}

interface AssignmentHistoryProps {
  clientId: string;
}

export const AssignmentHistory: React.FC<AssignmentHistoryProps> = ({ clientId }) => {
  const { toast } = useToast();
  const [history, setHistory] = useState<AssignmentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, [clientId]);

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('client_assignments_history')
        .select(`
          id,
          created_at,
          reason,
          from_employee:profiles!client_assignments_history_from_employee_id_fkey(first_name, last_name, email),
          to_employee:profiles!client_assignments_history_to_employee_id_fkey(first_name, last_name, email),
          reassigned_by_user:profiles!client_assignments_history_reassigned_by_fkey(first_name, last_name, email)
        `)
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setHistory(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading assignment history",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatEmployeeName = (employee: { first_name?: string; last_name?: string; email: string } | null) => {
    if (!employee) return 'Unassigned';
    return employee.first_name && employee.last_name
      ? `${employee.first_name} ${employee.last_name}`
      : employee.email;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Assignment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Assignment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No assignment changes recorded yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Assignment History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {history.map((record) => (
            <div key={record.id} className="border-l-2 border-primary pl-4 pb-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span>{formatEmployeeName(record.from_employee)}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span>{formatEmployeeName(record.to_employee)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(record.created_at), 'PPp')}
              </p>
              <p className="text-xs text-muted-foreground">
                Reassigned by: {formatEmployeeName(record.reassigned_by_user)}
              </p>
              {record.reason && (
                <p className="text-sm mt-2 p-2 bg-muted rounded">
                  <span className="font-medium">Reason: </span>
                  {record.reason}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};