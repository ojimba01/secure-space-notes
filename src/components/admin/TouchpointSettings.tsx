// Admin control over the "start today" behaviour.
//
// The launch date is the floor for staff urgency: cases that began before it
// are shown for reference but never made overdue, so switching the app on
// mid-cycle does not hand staff a backlog of touchpoints nobody could have
// made. Historical cases stay hidden from Team performance unless an admin asks.
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  loadTouchpointSettings, setGoLiveDate, setShowHistorical,
  clearTouchpointSettingsCache,
} from '@/lib/touchpointSettings';
import { todayAgency } from '@/lib/compliance';

export const TouchpointSettings: React.FC = () => {
  const { toast } = useToast();
  const [date, setDate] = useState('');
  const [explicit, setExplicit] = useState(false);
  const [historical, setHistorical] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    clearTouchpointSettingsCache();
    const s = await loadTouchpointSettings();
    setDate(s.goLiveDate);
    setExplicit(s.goLiveIsExplicit);
    setHistorical(s.showHistorical);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const saveDate = async () => {
    setSaving(true);
    await setGoLiveDate(date || null);
    await refresh();
    setSaving(false);
    toast({ title: 'Launch date saved', description: 'Earlier cases will not be marked overdue.' });
  };

  const resetDate = async () => {
    setSaving(true);
    await setGoLiveDate(null);
    await refresh();
    setSaving(false);
    toast({ title: 'Launch date reset', description: 'Back to the install date.' });
  };

  const toggleHistorical = async (checked: boolean) => {
    setHistorical(checked);
    await setShowHistorical(checked);
    clearTouchpointSettingsCache();
    toast({
      title: checked ? 'Historical data shown' : 'Historical data hidden',
      description: checked
        ? 'Team performance now lists cases that started before the launch date.'
        : 'Only cases from the launch date forward drive follow-up.',
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Launch date</CardTitle>
        <p className="text-sm text-muted-foreground">
          Touchpoint work begins on this date. Cases that started earlier are kept for reference,
          but never appear in a staff work queue or count as overdue.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="go-live" className="sr-only">Launch date</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="go-live"
              type="date"
              value={date}
              max={todayAgency()}
              onChange={(e) => setDate(e.target.value)}
              className="w-44"
              disabled={loading}
            />
            <Button size="sm" onClick={saveDate} disabled={saving || loading || !date}>Save</Button>
            {explicit && (
              <Button size="sm" variant="ghost" onClick={resetDate} disabled={saving}>
                Reset
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {explicit
              ? 'Set by an admin.'
              : 'Defaults to the install date. Saving replaces it.'}
          </p>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-md border p-3">
          <div>
            <Label htmlFor="show-historical" className="text-sm">Show historical data</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Lists cases that started before {date || 'the launch date'} in Team performance. Off by
              default — staff should not be chased for work that predates the agency using this.
            </p>
          </div>
          <Switch
            id="show-historical"
            checked={historical}
            onCheckedChange={toggleHistorical}
            disabled={loading}
          />
        </div>
      </CardContent>
    </Card>
  );
};
