import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AlertTriangle, ClipboardCheck, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Escalation {
  id: string;
  employee_id: string | null;
  client_id: string | null;
  kind: 'emergency_incomplete' | 'weekly_audit';
  period: string;
  outstanding: any;
  claimed_complete: any;
  status: string;
  created_at: string;
}

export const ComplianceEscalations: React.FC = () => {
  const { toast } = useToast();
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [auditEnabled, setAuditEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: esc }, { data: setting }] = await Promise.all([
      supabase.from('compliance_escalations').select('*').eq('status', 'open').order('created_at', { ascending: false }),
      supabase.from('compliance_settings').select('value').eq('key', 'weekly_audit_enabled').maybeSingle(),
    ]);
    setEscalations((esc as Escalation[]) ?? []);
    setAuditEnabled(setting?.value !== false);

    const ids = new Set<string>();
    (esc ?? []).forEach((e: any) => { if (e.employee_id) ids.add(e.employee_id); if (e.client_id) ids.add(e.client_id); });
    if (ids.size) {
      const [{ data: profs }, { data: cls }] = await Promise.all([
        supabase.from('profiles').select('id, first_name, last_name').in('id', Array.from(ids)),
        supabase.from('clients').select('id, first_name, last_name').in('id', Array.from(ids)),
      ]);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p) => { map[p.id] = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(); });
      (cls ?? []).forEach((c) => { map[c.id] = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(); });
      setNames(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resolve = async (id: string) => {
    await supabase.from('compliance_escalations').update({ status: 'resolved' }).eq('id', id);
    toast({ title: 'Marked resolved' });
    load();
  };

  const toggleAudit = async (checked: boolean) => {
    setAuditEnabled(checked);
    await supabase.from('compliance_settings').update({ value: checked as any }).eq('key', 'weekly_audit_enabled');
    toast({ title: checked ? 'Weekly audit enabled' : 'Weekly audit turned off' });
  };


  const formatOutstanding = (outstanding: any): string => {
    if (!outstanding) return 'None.';
    if (Array.isArray(outstanding) && outstanding.length === 0) return 'None.';
    if (!Array.isArray(outstanding) && typeof outstanding === 'object') {
      const parts: string[] = [];
      if ((outstanding.touchpoints ?? 0) > 0)
        parts.push(`${outstanding.touchpoints} touchpoint${outstanding.touchpoints !== 1 ? 's' : ''} remaining`);
      if ((outstanding.in_person ?? 0) > 0)
        parts.push(`${outstanding.in_person} in-person visit${outstanding.in_person !== 1 ? 's' : ''} remaining`);
      if (outstanding.summary_note)
        parts.push('Monthly summary note missing');
      return parts.length ? parts.join(', ') + '.' : 'None.';
    }
    if (Array.isArray(outstanding) && outstanding.length > 0) {
      const parts: string[] = [];
      outstanding.forEach((item: any) => {
        if (typeof item === 'object') {
          if ((item.touchpoints ?? 0) > 0)
            parts.push(`${item.touchpoints} touchpoint${item.touchpoints !== 1 ? 's' : ''} remaining`);
          if ((item.in_person ?? 0) > 0)
            parts.push(`${item.in_person} in-person visit${item.in_person !== 1 ? 's' : ''} remaining`);
          if (item.summary_note)
            parts.push('Monthly summary note missing');
        }
      });
      return parts.length ? parts.join(', ') + '.' : 'None.';
    }
    return 'None.';
  };

  const emergencies = escalations.filter((e) => e.kind === 'emergency_incomplete');
  const audits = escalations.filter((e) => e.kind === 'weekly_audit');

  return (
    <div className="space-y-4">
      {emergencies.length > 0 && (
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> Month-end compliance issues ({emergencies.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {emergencies.map((e) => (
              <div key={e.id} className="rounded-md border border-red-200 bg-red-50 p-3 flex items-start justify-between gap-3">
                <div className="text-sm">
                  <div className="font-medium">
                    {names[e.client_id ?? ''] || 'Client'} · Case manager: {names[e.employee_id ?? ''] || 'Unassigned'}
                  </div>
                  <div className="text-muted-foreground">{(() => { try { const [y,m] = String(e.period).slice(0,7).split('-'); return new Date(Number(y), Number(m)-1, 1).toLocaleString('default', {month:'long', year:'numeric'}); } catch { return String(e.period).slice(0,7); } })()}</div>
                  <div className="text-xs mt-1">Outstanding: {formatOutstanding(e.outstanding)}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => resolve(e.id)}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Mark resolved
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" /> Weekly HMIS audits
          </CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="audit-switch" className="text-sm">Weekly audit</Label>
            <Switch id="audit-switch" checked={auditEnabled} onCheckedChange={toggleAudit} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!auditEnabled && <p className="text-sm text-muted-foreground">Weekly audits are off. Month-end compliance escalations will still run.</p>}
          {audits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open audits.</p>
          ) : (
            audits.map((e) => (
              <div key={e.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{names[e.employee_id ?? ''] || 'Case manager'}</div>
                  <Badge variant="secondary">Week of {String(e.period).slice(0, 10)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Review HMIS to confirm that records marked complete were entered correctly.
                </p>
                <div className="text-xs">
                  <span className="font-medium">Marked complete:</span> {Array.isArray(e.claimed_complete) && e.claimed_complete.length
                    ? e.claimed_complete.map((c: any) => `${names[c.client_id] || 'Client'} (${c.contacts})`).join(', ')
                    : 'None'}
                </div>
                <div className="text-xs">
                  <span className="font-medium">Outstanding:</span> {Array.isArray(e.outstanding) && e.outstanding.length
                    ? e.outstanding.map((c: any) => `${names[c.client_id] || 'Client'} (${c.contacts})`).join(', ')
                    : 'None.'}
                </div>
                <Button size="sm" variant="outline" onClick={() => resolve(e.id)}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Mark reviewed
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};
