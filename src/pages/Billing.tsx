import { Navigate } from 'react-router-dom';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { BillingWorkspace } from '@/components/billing/BillingWorkspace';
import { PageShell } from '@/components/PageShell';

export default function Billing() {
  const { isAdmin, loading } = useIsAdmin();
  if (loading) return <div className="min-h-screen grid place-items-center">Loading…</div>;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <PageShell>
    <div className="mx-auto max-w-[1500px] p-4 md:p-8">
      <div className="mb-5"><h1 className="text-2xl font-bold">Billing</h1></div>
      <BillingWorkspace />
    </div>
  </PageShell>;
}
