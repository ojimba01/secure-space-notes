import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useBilling } from '@/hooks/useBilling';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BillingOverview } from '@/components/billing/BillingOverview';
import { CycleDates } from '@/components/billing/CycleDates';
import { ClientBillingTimeline } from '@/components/billing/ClientBillingTimeline';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const Billing = () => {
  const { isAdmin, loading } = useIsAdmin();
  const navigate = useNavigate();
  const { loading: dataLoading, clients, cycles, refresh, regenerate } = useBilling();
  const [tab, setTab] = useState('overview');
  const [timelineClientId, setTimelineClientId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const autoRan = useRef(false);


  // Auto-generate all cycles once after initial load so deadlines and billing
  // details reflect every cycle (not just cycle 1) without a manual refresh.
  useEffect(() => {
    if (dataLoading || autoRan.current || clients.length === 0) return;
    autoRan.current = true;
    regenerate();
  }, [dataLoading, clients.length, regenerate]);

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading…</div>;
  if (!isAdmin) return <Navigate to="/" replace />;

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
            <h1 className="text-2xl font-bold">Billing and revenue</h1>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button onClick={handleRegenerate} disabled={regenerating} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`} />
              Regenerate cycles
            </Button>
            <p className="text-xs text-muted-foreground max-w-xs text-right">
              Regenerate cycles updates dates and missing cycle rows. It does not erase submitted claims or payment history.
            </p>
          </div>
        </div>


        {dataLoading ? (
          <p className="text-muted-foreground">Loading billing data…</p>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="deadlines">Deadlines</TabsTrigger>
              <TabsTrigger value="master">Case status</TabsTrigger>
              <TabsTrigger value="staff">By case manager</TabsTrigger>
              <TabsTrigger value="timeline" disabled={!timelineClientId}>Billing details</TabsTrigger>
            </TabsList>
            <TabsContent value="dashboard" className="mt-4">
              <RevenueDashboard clients={clients} cycles={cycles} refresh={refresh} onOpenDeadlines={() => setTab('deadlines')} />
            </TabsContent>
            <TabsContent value="deadlines" className="mt-4">
              <UpcomingDeadlines clients={clients} cycles={cycles} refresh={refresh} onOpenTimeline={openTimeline} />
            </TabsContent>
            <TabsContent value="master" className="mt-4">
              <BillingMasterList clients={clients} cycles={cycles} refresh={refresh} onOpenTimeline={openTimeline} />
            </TabsContent>
            <TabsContent value="staff" className="mt-4">
              <BillingByStaff clients={clients} cycles={cycles} onOpenTimeline={openTimeline} />
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
