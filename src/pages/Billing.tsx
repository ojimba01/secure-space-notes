import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useIsSuperadmin } from '@/hooks/useIsSuperadmin';
import { useBilling } from '@/hooks/useBilling';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { RevenueDashboard } from '@/components/billing/RevenueDashboard';
import { BillingMasterList } from '@/components/billing/BillingMasterList';
import { ClientBillingTimeline } from '@/components/billing/ClientBillingTimeline';
import { UpcomingDeadlines } from '@/components/billing/UpcomingDeadlines';
import { BillingByStaff } from '@/components/billing/BillingByStaff';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const Billing = () => {
  const { isSuperadmin, loading } = useIsSuperadmin();
  const navigate = useNavigate();
  const { loading: dataLoading, clients, cycles, refresh, regenerate } = useBilling();
  const [tab, setTab] = useState('deadlines');
  const [timelineClientId, setTimelineClientId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading…</div>;
  if (!isSuperadmin) return <Navigate to="/" replace />;

  const handleRegenerate = async () => {
    setRegenerating(true);
    const r = await regenerate();
    setRegenerating(false);
    toast.success(`Regenerated: ${r.created} created, ${r.updated} updated`);
  };

  const openTimeline = (id: string) => {
    setTimelineClientId(id);
    setTab('timeline');
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}><ArrowLeft className="h-5 w-5" /></Button>
            <h1 className="text-2xl font-bold">Billing &amp; Revenue</h1>
          </div>
          <Button onClick={handleRegenerate} disabled={regenerating} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`} />
            Regenerate cycles
          </Button>
        </div>

        {dataLoading ? (
          <p className="text-muted-foreground">Loading billing data…</p>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="dashboard">Revenue Dashboard</TabsTrigger>
              <TabsTrigger value="master">Master List</TabsTrigger>
              <TabsTrigger value="timeline" disabled={!timelineClientId}>Client Timeline</TabsTrigger>
            </TabsList>
            <TabsContent value="dashboard" className="mt-4">
              <RevenueDashboard clients={clients} cycles={cycles} />
            </TabsContent>
            <TabsContent value="master" className="mt-4">
              <BillingMasterList clients={clients} cycles={cycles} refresh={refresh} onOpenTimeline={openTimeline} />
            </TabsContent>
            <TabsContent value="timeline" className="mt-4">
              {timelineClientId && <ClientBillingTimeline clientId={timelineClientId} />}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default Billing;
