import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DIGITS_ONLY_HINT, digitsOnly } from '@/lib/ids';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useViewAs } from '@/components/ViewAsProvider';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { ShieldCheck, Plus } from 'lucide-react';
import {
  AUTHORIZATION_STATUSES,
  AUTHORIZATION_STATUS_CLASS,
  AUTHORIZATION_STATUS_LABEL,
  AUTHORIZATION_TYPES,
  AUTHORIZATION_TYPE_LABEL,
  fetchClientAuthorizations,
  formatAuthDate,
  recordAuthorization,
  resyncDerivedSchedules,
  updateAuthorization,
  type AuthorizationType,
  type ClientAuthorization,
  cleanAuthorizationNumber,
} from '@/lib/authorizations';

interface Props {
  clientId: string;
  onUpdate?: () => void;
}

interface FormState {
  authorization_type: AuthorizationType;
  authorization_number: string;
  start_date: string;
  end_date: string;
  status: string;
  mco: string;
  service_type: string;
  level_of_need: string;
  billing_modifier: string;
}

const blank = (): FormState => ({
  authorization_type: 'reauthorization_180',
  authorization_number: '',
  start_date: '',
  end_date: '',
  status: 'active',
  mco: '',
  service_type: '',
  level_of_need: '',
  billing_modifier: '',
});

/**
 * The full authorization history for a case. Every period the MCO has granted
 * lives here — including repeat 180-day reauthorizations — so staff can see
 * what covers today and what has lapsed.
 */
export const AuthorizationsSection: React.FC<Props> = ({ clientId, onUpdate }) => {
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();
  const { isViewingAs } = useViewAs();
  const profileId = useEffectiveProfileId();
  const canEdit = isAdmin && !isViewingAs;

  const [rows, setRows] = useState<ClientAuthorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ClientAuthorization | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(blank());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchClientAuthorizations(clientId));
    } catch (err: any) {
      toast({
        title: 'Could not load authorizations',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setForm(blank());
    setEditing(null);
    setAdding(true);
  };

  const openEdit = (row: ClientAuthorization) => {
    setForm({
      authorization_type: row.authorization_type as AuthorizationType,
      authorization_number: row.authorization_number ?? '',
      start_date: row.start_date ?? '',
      end_date: row.end_date ?? '',
      status: row.status,
      mco: row.mco ?? '',
      service_type: row.service_type ?? '',
      level_of_need: row.level_of_need ?? '',
      billing_modifier: row.billing_modifier ?? '',
    });
    setAdding(false);
    setEditing(row);
  };

  const close = () => {
    setAdding(false);
    setEditing(null);
  };

  const save = async () => {
    if (!form.start_date) {
      toast({ title: 'Enter the authorization start date', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { mirrored } = await updateAuthorization({
          id: editing.id,
          clientId,
          type: form.authorization_type,
          startDate: form.start_date,
          endDate: form.end_date || null,
          authorizationNumber: form.authorization_number || null,
          status: form.status,
          mco: form.mco || null,
          serviceType: form.service_type || null,
          levelOfNeed: form.level_of_need || null,
          billingModifier: form.billing_modifier || null,
        });

        // Billing reads the legacy columns, so a correction that reached them
        // has to rebuild the cycles as well — otherwise the dates and the
        // cycles disagree with no sign that anything is wrong.
        if (mirrored) {
          try {
            await resyncDerivedSchedules(clientId);
          } catch (err: any) {
            toast({
              title: 'Billing and touchpoints were not rebuilt',
              description: `${err.message} — save the authorization again to retry.`,
              variant: 'destructive',
            });
          }
        }
        toast({
          title: 'Authorization updated',
          description: mirrored
            ? 'Billing cycles and touchpoint windows were updated to match.'
            : 'History corrected. The authorization currently in force was left unchanged.',
        });
      } else {
        await recordAuthorization({
          clientId,
          type: form.authorization_type,
          startDate: form.start_date,
          endDate: form.end_date || null,
          authorizationNumber: form.authorization_number || null,
          mco: form.mco || null,
          serviceType: form.service_type || null,
          levelOfNeed: form.level_of_need || null,
          createdBy: profileId ?? null,
        });
        try {
          await resyncDerivedSchedules(clientId);
        } catch (err: any) {
          toast({
            title: 'Billing and touchpoints were not rebuilt',
            description: `${err.message} — save the authorization again to retry.`,
            variant: 'destructive',
          });
        }
        toast({ title: 'Authorization recorded' });
      }
      close();
      await load();
      onUpdate?.();
    } catch (err: any) {
      toast({
        title: 'Could not save the authorization',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            Authorizations
          </CardTitle>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={openAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add authorization
            </Button>
          )}
        </div>
        {/* The case this is most often needed for, said out loud. A client who
            goes quiet during their first 30 days and comes back afterwards
            needs a second 30-day authorization, not an edit to the first: the
            first one really did happen and its dates are what was billed. */}
        {canEdit && rows.some((r) => r.authorization_type === 'initial_30') && (
          <p className="text-xs text-muted-foreground">
            A client who came back after their first 30 days gets a second 30-day
            authorization here — add one and choose "Initial 30-day". The earlier one is kept and
            marked superseded, so what was already billed against it is not disturbed.
          </p>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading authorizations...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No authorizations recorded yet. They appear here as soon as the MCO responds.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Authorization&nbsp;#</th>
                  <th className="px-3 py-2 font-medium">Period</th>
                  <th className="px-3 py-2 font-medium">MCO</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  {canEdit && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">
                      {AUTHORIZATION_TYPE_LABEL[r.authorization_type] ?? r.authorization_type}
                    </td>
                    <td className="px-3 py-2">{r.sequence_number}</td>
                    <td className="px-3 py-2">
                      {cleanAuthorizationNumber(r.authorization_number) || '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatAuthDate(r.start_date)} – {formatAuthDate(r.end_date)}
                    </td>
                    <td className="px-3 py-2">{r.mco || '—'}</td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary" className={AUTHORIZATION_STATUS_CLASS[r.status] ?? ''}>
                        {AUTHORIZATION_STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </td>
                    {canEdit && (
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                          Edit
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog open={adding || !!editing} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit authorization' : 'Add authorization'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Type</Label>
              <Select
                value={form.authorization_type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, authorization_type: v as AuthorizationType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTHORIZATION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {AUTHORIZATION_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-num">Authorization number</Label>
              <Input
                id="auth-num"
                value={form.authorization_number}
                inputMode="numeric"
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    authorization_number: cleanAuthorizationNumber(e.target.value),
                  }))
                }
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-mco">MCO</Label>
              <Input
                id="auth-mco"
                value={form.mco}
                onChange={(e) => setForm((f) => ({ ...f, mco: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-start">Start date</Label>
              <Input
                id="auth-start"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-end">End date</Label>
              <Input
                id="auth-end"
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Left blank, this is calculated.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-service">Service type</Label>
              <Input
                id="auth-service"
                value={form.service_type}
                onChange={(e) => setForm((f) => ({ ...f, service_type: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label>Level of need</Label>
              <Select
                value={form.level_of_need || 'unset'}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, level_of_need: v === 'unset' ? '' : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">Not set</SelectItem>
                  <SelectItem value="Low Level">Low Level</SelectItem>
                  <SelectItem value="High Level">High Level</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-modifier">Billing modifier</Label>
              <Input
                id="auth-modifier"
                value={form.billing_modifier}
                onChange={(e) => setForm((f) => ({ ...f, billing_modifier: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            {editing && (
              <div className="space-y-2 sm:col-span-2">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUTHORIZATION_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {AUTHORIZATION_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save authorization'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default AuthorizationsSection;
