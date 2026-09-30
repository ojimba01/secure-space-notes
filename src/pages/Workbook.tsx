// The billing Workbook as its own page in the left menu: every client and
// billing cycle in one sheet. Admins only.
import { Navigate } from 'react-router-dom';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useBilling } from '@/hooks/useBilling';
import { BillingWorkbook } from '@/components/billing/workbook/BillingWorkbook';
import { PageShell } from '@/components/PageShell';

export default function Workbook() {
  const { isAdmin, loading } = useIsAdmin();
  const { cycles, refresh } = useBilling();
  if (loading) return <div className="grid min-h-screen place-items-center">Loading…</div>;
  if (!isAdmin) return <Navigate to="/" replace />;
  return (
    <PageShell>
      <BillingWorkbook cycles={cycles} onChanged={() => void refresh()} />
    </PageShell>
  );
}
