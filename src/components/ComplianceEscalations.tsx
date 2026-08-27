import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AlertTriangle, ClipboardCheck, CheckCircle2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const PAGE_SIZE = 10;
const AUDIT_PREVIEW = 5;
/** Beyond this many names the row stops being scannable, so the rest collapse. */
const CHIP_LIMIT = 6;

/**
 * A labelled row of client chips. The contact count rides on the chip so
 * "(3)" is never left to the reader to interpret.
 */
const ClientChips: React.FC<{
  label: string;
  clients: { name: string; contacts: number }[];
  tone: 'amber' | 'muted';
}> = ({ label, clients, tone }) => {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? clients : clients.slice(0, CHIP_LIMIT);
  const hidden = clients.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground w-[104px] shrink-0">{label}</span>
      {shown.map((c, i) => (
        <Badge
          key={`${c.name}-${i}`}
          variant="secondary"
          className={tone === 'amber' ? 'bg-amber-100 text-amber-900 font-normal' : 'font-normal'}
        >
          {c.name}
          <span className="ml-1 opacity-70">
            {c.contacts} contact{c.contacts !== 1 ? 's' : ''}
          </span>
        </Badge>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-xs text-muted-foreground underline"
        >
          +{hidden} more
        </button>
      )}
    </div>
  );
};


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
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const [showAllAudits, setShowAllAudits] = useState(false);


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


  /**
   * What is still owed, as short chips rather than a sentence. Counting up
   * across entries means "2 touchpoints, 1 in-person" reads at a glance
   * instead of repeating "remaining" once per item.
   */
  const outstandingChips = (outstanding: any): string[] => {
    const items = Array.isArray(outstanding)
      ? outstanding
      : outstanding && typeof outstanding === 'object'
        ? [outstanding]
        : [];

    let touchpoints = 0;
    let inPerson = 0;
    let summaryNote = false;
    items.forEach((item: any) => {
      if (!item || typeof item !== 'object') return;
      touchpoints += item.touchpoints ?? 0;
      inPerson += item.in_person ?? 0;
      if (item.summary_note) summaryNote = true;
    });

    const chips: string[] = [];
    if (touchpoints > 0) chips.push(`${touchpoints} touchpoint${touchpoints !== 1 ? 's' : ''}`);
    if (inPerson > 0) chips.push(`${inPerson} in-person`);
    if (summaryNote) chips.push('Summary note');
    return chips;
  };

  /** Client entries on a weekly audit, as `{ name, contacts }`. */
  const auditClients = (value: any): { name: string; contacts: number }[] =>
    Array.isArray(value)
      ? value.map((c: any) => ({
          name: names[c?.client_id] || 'Client',
          contacts: c?.contacts ?? 0,
        }))
      : [];

  const emergencies = escalations.filter((e) => e.kind === 'emergency_incomplete');
  const audits = escalations.filter((e) => e.kind === 'weekly_audit');

  const pageCount = Math.max(1, Math.ceil(emergencies.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = emergencies.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="space-y-4">
      {emergencies.length > 0 && (
        <Card className="border-red-500">
          <CardHeader className="py-3">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left"
              onClick={() => setExpanded((v) => !v)}
            >
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" /> Month-end compliance issues ({emergencies.length})
              </CardTitle>
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                {expanded ? 'Hide' : 'Show'}
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </button>
          </CardHeader>
          {expanded && (
          <CardContent className="space-y-3">
            {pageItems.map((e) => (
              <div key={e.id} className="rounded-md border border-red-200 bg-red-50 p-3 flex items-start justify-between gap-3">
                <div className="text-sm space-y-1.5">
                  <div>
                    <span className="font-medium">{names[e.client_id ?? ''] || 'Client'}</span>
                    <span className="text-muted-foreground">
                      {' · '}
                      {(() => { try { const [y,m] = String(e.period).slice(0,7).split('-'); return new Date(Number(y), Number(m)-1, 1).toLocaleString('default', {month:'long', year:'numeric'}); } catch { return String(e.period).slice(0,7); } })()}
                      {' · '}
                      {names[e.employee_id ?? ''] || 'Unassigned'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {outstandingChips(e.outstanding).length === 0 ? (
                      <span className="text-xs text-muted-foreground">Nothing outstanding</span>
                    ) : (
                      outstandingChips(e.outstanding).map((chip) => (
                        <Badge key={chip} variant="secondary" className="bg-red-100 text-red-900">
                          {chip}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => resolve(e.id)}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Mark resolved
                </Button>
              </div>
            ))}
            {pageCount > 1 && (
              <div className="flex items-center justify-between pt-1">
                <Button size="sm" variant="outline" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Showing {safePage * PAGE_SIZE + 1}–{Math.min(emergencies.length, safePage * PAGE_SIZE + PAGE_SIZE)} of {emergencies.length}
                </span>
                <Button size="sm" variant="outline" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" /> Weekly HMIS audits
            </CardTitle>
            {/* Said once here rather than repeated on every case manager's row. */}
            <p className="text-xs text-muted-foreground">
              Check HMIS to confirm records marked complete were entered correctly.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Label htmlFor="audit-switch" className="text-sm">Weekly audit</Label>
            <Switch id="audit-switch" checked={auditEnabled} onCheckedChange={toggleAudit} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!auditEnabled && <p className="text-sm text-muted-foreground">Weekly audits are off. Month-end compliance escalations will still run.</p>}
          {audits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open audits.</p>
          ) : (
            <>
            {(showAllAudits ? audits : audits.slice(0, AUDIT_PREVIEW)).map((e) => {
              const complete = auditClients(e.claimed_complete);
              const outstanding = auditClients(e.outstanding);
              return (
                <div key={e.id} className="rounded-md border p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{names[e.employee_id ?? ''] || 'Case manager'}</span>
                      <span className="text-xs text-muted-foreground">
                        week of {String(e.period).slice(0, 10)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-green-700">{complete.length} complete</span>
                      <span className={outstanding.length ? 'text-amber-700' : 'text-muted-foreground'}>
                        {outstanding.length} outstanding
                      </span>
                    </div>
                  </div>

                  {/* Names sit under the counts so the numbers read first. */}
                  {outstanding.length > 0 && (
                    <ClientChips label="Outstanding" clients={outstanding} tone="amber" />
                  )}
                  {complete.length > 0 && (
                    <ClientChips label="Marked complete" clients={complete} tone="muted" />
                  )}

                  <Button size="sm" variant="outline" onClick={() => resolve(e.id)}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Mark reviewed
                  </Button>
                </div>
              );
            })}
            {audits.length > AUDIT_PREVIEW && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => setShowAllAudits((v) => !v)}>
                {showAllAudits ? (
                  <><ChevronUp className="h-4 w-4 mr-1" /> Show fewer</>
                ) : (
                  <><ChevronDown className="h-4 w-4 mr-1" /> View more ({audits.length - AUDIT_PREVIEW} more)</>
                )}
              </Button>
            )}
            </>
          )}

        </CardContent>
      </Card>
    </div>
  );
};
