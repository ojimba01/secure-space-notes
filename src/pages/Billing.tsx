import { Navigate } from 'react-router-dom';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { BillingWorkspace } from '@/components/billing/BillingWorkspace';
import { PageShell } from '@/components/PageShell';

export default function Billing() {
  const { isAdmin, loading } = useIsAdmin();
  if (loading) return <PageShell>{null}</PageShell>;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <PageShell>
    <div className="mx-auto max-w-[1500px] p-4 md:p-8">
      <div className="mb-5"><h1 className="animate-rise text-2xl md:text-[32px] font-semibold tracking-tight text-foreground">Billing</h1></div>
      <BillingWorkspace />
    </div>
  </PageShell>;
}
