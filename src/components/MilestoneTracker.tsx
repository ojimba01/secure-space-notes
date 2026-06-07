import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Lock, CheckCircle2, Circle, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsAdmin } from '@/hooks/useIsAdmin';

interface MilestoneTrackerProps {
  clientId: string;
  iatDate?: string | null;
  hsp150Date?: string | null;
  hsp180Date?: string | null;
  onUpdate: () => void;
}

const addDays = (dateStr: string, days: number) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d;
};

const today = () => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
};

const statusBadge = (dueDate: Date) => {
  const diff = Math.ceil((dueDate.getTime() - today().getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: `Overdue by ${Math.abs(diff)} days`, variant: 'destructive' as const };
  if (diff === 0) return { label: 'Due today', variant: 'destructive' as const };
  if (diff <= 14) return { label: `Due in ${diff} days`, variant: 'default' as const };
  return { label: `Due in ${diff} days`, variant: 'secondary' as const };
};

export const MilestoneTracker: React.FC<MilestoneTrackerProps> = ({
  clientId,
  iatDate,
  hsp150Date,
  hsp180Date,
  onUpdate,
}) => {
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();
  const [draft150, setDraft150] = useState('');
  const [draft180, setDraft180] = useState('');
  const [saving, setSaving] = useState(false);

  const [adminEditing, setAdminEditing] = useState(false);
  const [adminIat, setAdminIat] = useState(iatDate ?? '');
  const [adminHsp150, setAdminHsp150] = useState(hsp150Date ?? '');
  const [adminHsp180, setAdminHsp180] = useState(hsp180Date ?? '');

  const iatDue = iatDate ? addDays(iatDate, 30) : null;
  const iatPassed = iatDue ? today() >= iatDue : false;

  const hsp150Due = hsp150Date ? addDays(hsp150Date, 150) : null;
  const hsp150Passed = hsp150Due ? today() >= hsp150Due : false;

  const hsp180Due = hsp180Date ? addDays(hsp180Date, 180) : null;
  const hsp180Passed = hsp180Due ? today() >= hsp180Due : false;

  const saveMilestone = async (field: 'hsp_150_date' | 'hsp_180_date', value: string) => {
    if (!value) {
      toast({ title: 'Pick a date first', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('clients')
      .update({ [field]: value })
      .eq('id', clientId);
    setSaving(false);

    if (error) {
      toast({ title: 'Error saving milestone', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Milestone saved' });
    onUpdate();
  };

  const saveAdminDates = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('clients')
      .update({
        iat_date: adminIat || null,
        hsp_150_date: adminHsp150 || null,
        hsp_180_date: adminHsp180 || null,
      })
      .eq('id', clientId);
    setSaving(false);

    if (error) {
      toast({ title: 'Error saving dates', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Milestone dates updated' });
    setAdminEditing(false);
    onUpdate();
  };

  const adminPanel = isAdmin ? (
    <div className="rounded-md border border-dashed p-3 space-y-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Pencil className="h-4 w-4" /> Admin: Edit Milestone Dates
        </p>
        {!adminEditing && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAdminIat(iatDate ?? '');
              setAdminHsp150(hsp150Date ?? '');
              setAdminHsp180(hsp180Date ?? '');
              setAdminEditing(true);
            }}
          >
            Edit dates
          </Button>
        )}
      </div>
      {adminEditing && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">IAT Start Date</label>
              <Input type="date" value={adminIat} onChange={(e) => setAdminIat(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">HSP 150 Start Date</label>
              <Input type="date" value={adminHsp150} onChange={(e) => setAdminHsp150(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">HSP 180 Start Date</label>
              <Input type="date" value={adminHsp180} onChange={(e) => setAdminHsp180(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={saving} onClick={saveAdminDates}>
              {saving ? 'Saving...' : 'Save dates'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdminEditing(false)}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  ) : null;

  if (!iatDate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>IAT & HSP Milestones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            No IAT start date set. Edit this client to add one.
          </p>
          {adminPanel}
        </CardContent>
      </Card>
    );
  }

  const finishedBadge = { label: 'Finished', variant: 'secondary' as const };

  // A milestone is considered finished once the next milestone's date is entered
  const iatStatus = hsp150Date ? finishedBadge : iatDue ? statusBadge(iatDue) : null;
  const hsp150Status = hsp180Date ? finishedBadge : hsp150Due ? statusBadge(hsp150Due) : null;
  const hsp180Status = hsp180Due ? statusBadge(hsp180Due) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>IAT & HSP Milestones</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {adminPanel}
        {hsp180Passed && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>WARNING</AlertTitle>
            <AlertDescription>Patient is now pending next action.</AlertDescription>
          </Alert>
        )}

        {/* IAT */}
        <div className="flex items-start gap-3 p-3 rounded-md border">
          {iatPassed ? (
            <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
          ) : (
            <Circle className="h-5 w-5 text-primary mt-0.5" />
          )}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <p className="text-sm font-semibold">IAT (30-day)</p>
              <p className="text-xs text-muted-foreground">Initial Assessment Tool</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Start Date</p>
              <p className="text-sm">{new Date(iatDate).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Due Date</p>
              <p className="text-sm">{iatDue!.toLocaleDateString()}</p>
              {iatStatus && <Badge variant={iatStatus.variant} className="mt-1">{iatStatus.label}</Badge>}
            </div>
          </div>
        </div>

        {/* HSP 150 */}
        <div className="flex items-start gap-3 p-3 rounded-md border">
          {hsp150Date && hsp150Passed ? (
            <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
          ) : iatPassed ? (
            <Circle className="h-5 w-5 text-primary mt-0.5" />
          ) : (
            <Lock className="h-5 w-5 text-muted-foreground mt-0.5" />
          )}
          <div className="flex-1">
            <p className="text-sm font-semibold">HSP 150-day</p>
            <p className="text-xs text-muted-foreground mb-2">Housing Stabilization Plan</p>

            {!iatPassed && (
              <p className="text-xs text-muted-foreground">
                Unlocks on {iatDue!.toLocaleDateString()} (after IAT due date)
              </p>
            )}

            {iatPassed && !hsp150Date && (
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">Set Start Date</label>
                  <Input
                    type="date"
                    value={draft150}
                    onChange={(e) => setDraft150(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() => saveMilestone('hsp_150_date', draft150)}
                >
                  Save
                </Button>
              </div>
            )}

            {hsp150Date && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Start Date</p>
                  <p className="text-sm">{new Date(hsp150Date).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due Date (+150)</p>
                  <p className="text-sm">{hsp150Due!.toLocaleDateString()}</p>
                  {hsp150Status && <Badge variant={hsp150Status.variant} className="mt-1">{hsp150Status.label}</Badge>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* HSP 180 */}
        <div className="flex items-start gap-3 p-3 rounded-md border">
          {hsp180Date && hsp180Passed ? (
            <CheckCircle2 className="h-5 w-5 text-destructive mt-0.5" />
          ) : hsp150Passed ? (
            <Circle className="h-5 w-5 text-primary mt-0.5" />
          ) : (
            <Lock className="h-5 w-5 text-muted-foreground mt-0.5" />
          )}
          <div className="flex-1">
            <p className="text-sm font-semibold">HSP 180-day</p>
            <p className="text-xs text-muted-foreground mb-2">Housing Stabilization Plan</p>

            {!hsp150Passed && (
              <p className="text-xs text-muted-foreground">
                {hsp150Due
                  ? `Unlocks on ${hsp150Due.toLocaleDateString()} (after 150-day due date)`
                  : 'Locked until 150-day milestone is set and passes'}
              </p>
            )}

            {hsp150Passed && !hsp180Date && (
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">Set Start Date</label>
                  <Input
                    type="date"
                    value={draft180}
                    onChange={(e) => setDraft180(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() => saveMilestone('hsp_180_date', draft180)}
                >
                  Save
                </Button>
              </div>
            )}

            {hsp180Date && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Start Date</p>
                  <p className="text-sm">{new Date(hsp180Date).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due Date (+180)</p>
                  <p className="text-sm">{hsp180Due!.toLocaleDateString()}</p>
                  {hsp180Status && <Badge variant={hsp180Status.variant} className="mt-1">{hsp180Status.label}</Badge>}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
