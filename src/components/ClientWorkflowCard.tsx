import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { useViewAs } from '@/components/ViewAsProvider';
import { CheckCircle2, ClipboardList, FileText } from 'lucide-react';
import {
  INTAKE_STATUS_LABEL,
  PACKAGE_STATE_CLASS,
  PACKAGE_STATE_LABEL,
  STAGE_CLASS,
  STAGE_LABEL,
  continuationPackageState,
  nextAction,
  serviceStartDate,
  type WorkflowClient,
} from '@/lib/workflow';
import {
  EXTERNAL_STATUS_CLASS,
  EXTERNAL_STATUS_LABEL,
  FORM_STATUS_SHORT_LABEL,
} from '@/lib/formSigning';
import { PDF_TEMPLATES, TemplateFillDialog, type PdfTemplate } from '@/components/forms/TemplateFillDialog';
import { regenerateClientCycles } from '@/lib/billingSync';
import { regenerateTouchpointsForClient } from '@/lib/touchpoints';
import {
  AUTHORIZATION_TYPE_LABEL,
  currentAuthorization,
  daysUntilEnd,
  fetchClientAuthorizations,
  formatAuthDate,
  needsReauthorization,
  recordAuthorization,
  type AuthorizationType,
  type ClientAuthorization,
} from '@/lib/authorizations';

interface Props {
  client: WorkflowClient & {
    id: string;
    first_name: string;
    last_name: string;
    auth_30_number?: string | null;
    auth_150_number?: string | null;
    mco_housing_manager?: string | null;
  };
  onUpdate: () => void;
  /** Jumps to the Client Intake tab on the client record. */
  onOpenIntake?: () => void;
}

interface FormSummary {
  form_type: string;
  status: string;
  external_status: string | null;
  created_at: string;
}

const TRACKED_FORMS = [
  'Initial Assessment Tool',
  'Level of Need Assessment Tool',
  'Housing Stabilization Plan',
];

const AUTH_KIND: Record<string, AuthorizationType> = {
  initial: 'initial_30',
  continuation: 'continuation_150',
  reauthorization: 'reauthorization_180',
};

type AuthKind = keyof typeof AUTH_KIND;

const templateFor = (formType: string): PdfTemplate | undefined =>
  PDF_TEMPLATES.find((t) => t.formType === formType);

const fmt = (d?: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString() : '—');

/**
 * Which lifecycle step a form opened from this card belongs to. The IAT always
 * requests the initial authorization; LoN/HSP are the continuation packet the
 * first time and a reauthorization packet once a continuation already exists.
 */
const workflowPurposeFor = (
  formType: string,
  authorizations: ClientAuthorization[],
): string => {
  if (formType === 'Initial Assessment Tool') return 'initial_authorization';
  const hasContinuation = authorizations.some(
    (a) => a.authorization_type === 'continuation_150' || a.authorization_type === 'reauthorization_180',
  );
  return hasContinuation ? 'reauthorization' : 'continuation';
};

/**
 * The lifecycle panel on a client record: where the case sits, the single next
 * task, the continuation packet's internal and MCO status, and the
 * authorization entry that moves the case forward (and rebuilds billing when
 * it does).
 */
export const ClientWorkflowCard: React.FC<Props> = ({ client, onUpdate, onOpenIntake }) => {
  const { toast } = useToast();
  const profileId = useEffectiveProfileId();
  const { isViewingAs } = useViewAs();
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [authorizations, setAuthorizations] = useState<ClientAuthorization[]>([]);
  const [filling, setFilling] = useState<PdfTemplate | null>(null);
  const [authOpen, setAuthOpen] = useState<AuthKind | null>(null);
  const [authNumber, setAuthNumber] = useState('');
  const [authStart, setAuthStart] = useState('');
  const [saving, setSaving] = useState(false);
  const [signerName, setSignerName] = useState('Case manager');

  const loadForms = useCallback(async () => {
    const { data, error } = await supabase
      .from('client_forms')
      .select('form_type, status, external_status, created_at')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false });
    if (error) {
      toast({
        title: 'Could not load the assessment packet',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    setForms((data as FormSummary[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  const loadAuthorizations = useCallback(async () => {
    try {
      setAuthorizations(await fetchClientAuthorizations(client.id));
    } catch (err: any) {
      toast({
        title: 'Could not load authorizations',
        description: err.message,
        variant: 'destructive',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  useEffect(() => {
    loadForms();
    loadAuthorizations();
  }, [loadForms, loadAuthorizations]);

  useEffect(() => {
    if (!profileId) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', profileId)
        .maybeSingle();
      setSignerName(
        `${data?.first_name ?? ''} ${data?.last_name ?? ''}`.trim() || data?.email || 'Case manager',
      );
    })();
  }, [profileId]);

  const stage = client.workflow_stage ?? 'referred';
  const action = nextAction(client, forms);
  const latest = (type: string) => forms.find((f) => f.form_type === type);
  const packet = continuationPackageState(forms);
  const current = currentAuthorization(authorizations);
  const daysLeft = daysUntilEnd(current);
  const reauthDue = needsReauthorization(authorizations);

  const guard = () => {
    if (isViewingAs) {
      toast({ title: 'Preview only', description: 'Changes are not saved while viewing as an employee.' });
      return true;
    }
    return false;
  };

  const markIntakeComplete = async () => {
    if (guard()) return;
    const { error } = await supabase
      .from('clients')
      .update({ intake_status: 'complete', intake_completed_at: new Date().toISOString() })
      .eq('id', client.id);
    if (error) {
      toast({ title: 'Could not update the intake', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Intake marked complete', description: 'The assessment packet is now the next step.' });
    onUpdate();
  };

  const openAuth = (kind: AuthKind) => {
    setAuthNumber(
      kind === 'initial'
        ? client.auth_30_number ?? ''
        : kind === 'continuation'
          ? client.auth_150_number ?? ''
          : '',
    );
    setAuthStart('');
    setAuthOpen(kind);
  };

  const saveAuthorization = async () => {
    if (guard()) return;
    if (!authOpen) return;
    if (!authStart) {
      toast({ title: 'Enter the authorization start date', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // The authorization record is the source of truth; the legacy columns on
      // the client are mirrored inside recordAuthorization so billing and
      // touchpoint generation keep working unchanged.
      const { sequenceNumber } = await recordAuthorization({
        clientId: client.id,
        type: AUTH_KIND[authOpen],
        startDate: authStart,
        authorizationNumber: authNumber || null,
        mco: client.mco_housing_manager ?? null,
        levelOfNeed: client.level_of_need ?? null,
        receivedAt: new Date().toISOString().slice(0, 10),
        createdBy: profileId ?? null,
      });

      // The authorization is what creates billable cycles and starts the
      // touchpoint clock, so rebuild both and say so if either fails.
      try {
        await regenerateClientCycles(client.id);
      } catch (err: any) {
        toast({
          title: 'Billing cycles were not rebuilt',
          description: `${err.message} — reopen this panel and save again to retry.`,
          variant: 'destructive',
        });
      }
      try {
        await regenerateTouchpointsForClient(client.id);
      } catch (err: any) {
        toast({ title: 'Touchpoints were not scheduled', description: err.message, variant: 'destructive' });
      }

      toast({
        title: `${AUTHORIZATION_TYPE_LABEL[AUTH_KIND[authOpen]]} #${sequenceNumber} recorded`,
        description: 'Billing cycles have been updated.',
      });
      setAuthOpen(null);
      await loadAuthorizations();
      onUpdate();
    } catch (err: any) {
      toast({ title: 'Could not save the authorization', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const actionButton = () => {
    switch (action.kind) {
      case 'submit_iat':
        return (
          <Button onClick={() => setFilling(templateFor('Initial Assessment Tool') ?? null)}>
            <FileText className="mr-2 h-4 w-4" />
            Open the IAT
          </Button>
        );
      case 'complete_lon':
        return (
          <Button onClick={() => setFilling(templateFor('Level of Need Assessment Tool') ?? null)}>
            <FileText className="mr-2 h-4 w-4" />
            Open the LoN assessment
          </Button>
        );
      case 'submit_hsp':
        return (
          <Button onClick={() => setFilling(templateFor('Housing Stabilization Plan') ?? null)}>
            <FileText className="mr-2 h-4 w-4" />
            Open the HSP
          </Button>
        );
      case 'schedule_intake':
        // The intake form completes this step when it is signed. The manual
        // button stays for intakes taken by phone without the form.
        return (
          <>
            {onOpenIntake && (
              <Button onClick={onOpenIntake}>
                <ClipboardList className="mr-2 h-4 w-4" />
                Open the Client Intake form
              </Button>
            )}
            <Button variant="outline" onClick={markIntakeComplete}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Mark intake complete
            </Button>
          </>
        );
      case 'record_authorization':
        return (
          <Button onClick={() => openAuth(stage === 'initial_30_active' ? 'continuation' : 'initial')}>
            Record authorization
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
            Case lifecycle
          </CardTitle>
          <Badge variant="secondary" className={STAGE_CLASS[stage] ?? ''}>
            {STAGE_LABEL[stage] ?? stage}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Next step</p>
          <p className="font-medium">{action.label}</p>
          <p className="text-sm text-muted-foreground">{action.detail}</p>
          <div className="mt-3 flex flex-wrap gap-2">{actionButton()}</div>
        </div>

        {reauthDue && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">
              The current authorization ends {formatAuthDate(current?.end_date)}
              {daysLeft !== null && ` (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)`}.
            </p>
            <p className="text-sm text-amber-900/80">
              Record the next 180-day period as soon as the MCO approves it.
            </p>
            <Button size="sm" className="mt-3" onClick={() => openAuth('reauthorization')}>
              Record new reauthorization
            </Button>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Intake conversation</p>
            <p>{INTAKE_STATUS_LABEL[client.intake_status ?? 'not_started'] ?? client.intake_status}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Services started</p>
            <p>{fmt(serviceStartDate(client))}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Current authorization</p>
            <p>
              {current
                ? `${AUTHORIZATION_TYPE_LABEL[current.authorization_type] ?? current.authorization_type} — ends ${formatAuthDate(current.end_date)}`
                : 'None active'}
            </p>
          </div>
        </div>

        <div className="rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              Continuation package (LoN + HSP)
            </p>
            <Badge variant="secondary" className={PACKAGE_STATE_CLASS[packet.state]}>
              {PACKAGE_STATE_LABEL[packet.state]}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {packet.missing.length
              ? `Still needs internal approval: ${packet.missing.join(', ')}.`
              : 'Both documents are internally approved.'}
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Assessment packet</p>
          <div className="divide-y rounded-md border">
            {TRACKED_FORMS.map((type) => {
              const f = latest(type);
              return (
                <div key={type} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span className="text-sm">{type}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {f ? FORM_STATUS_SHORT_LABEL[f.status] ?? f.status : 'Not started'}
                    </Badge>
                    {f && (
                      <Badge
                        variant="secondary"
                        className={EXTERNAL_STATUS_CLASS[f.external_status ?? 'not_sent'] ?? ''}
                      >
                        {EXTERNAL_STATUS_LABEL[f.external_status ?? 'not_sent']}
                      </Badge>
                    )}
                    {(!f || f.status === 'changes_requested') && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setFilling(templateFor(type) ?? null)}
                      >
                        {f ? 'Redo' : 'Fill out'}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => openAuth('initial')}>
            Record initial 30-day authorization
          </Button>
          <Button variant="outline" size="sm" onClick={() => openAuth('continuation')}>
            Record continuation authorization
          </Button>
          <Button variant="outline" size="sm" onClick={() => openAuth('reauthorization')}>
            Record new reauthorization
          </Button>
        </div>
      </CardContent>

      {filling && profileId && (
        <TemplateFillDialog
          template={filling}
          profileId={profileId}
          signerName={signerName}
          lockedClientId={client.id}
          lockedClientName={`${client.last_name}, ${client.first_name}`}
          workflowPurpose={workflowPurposeFor(filling.formType, authorizations)}
          authorizationId={currentAuthorization(authorizations)?.id ?? null}
          onClose={() => setFilling(null)}
          onSubmitted={() => {
            loadForms();
            onUpdate();
          }}
        />
      )}

      <Dialog open={!!authOpen} onOpenChange={(o) => !o && setAuthOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {authOpen ? AUTHORIZATION_TYPE_LABEL[AUTH_KIND[authOpen]] : ''} authorization
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="auth-number">Authorization number</Label>
              <Input
                id="auth-number"
                value={authNumber}
                onChange={(e) => setAuthNumber(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-start">Start date</Label>
              <Input
                id="auth-start"
                type="date"
                value={authStart}
                onChange={(e) => setAuthStart(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Saving this adds an authorization record, rebuilds the billing cycles and the
                touchpoint schedule. End dates are calculated automatically.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuthOpen(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveAuthorization} disabled={saving}>
              {saving ? 'Saving...' : 'Save authorization'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default ClientWorkflowCard;
