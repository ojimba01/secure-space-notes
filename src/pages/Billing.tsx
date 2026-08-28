import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { BillingWorkspace } from '@/components/billing/BillingWorkspace';

export default function Billing() {
  const navigate = useNavigate();
  const { isAdmin, loading } = useIsAdmin();
  if (loading) return <div className="min-h-screen grid place-items-center">Loading…</div>;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <main className="min-h-screen bg-slate-50">
    <div className="mx-auto max-w-[1500px] p-4 md:p-8">
      <div className="mb-5 flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => navigate('/')}><ArrowLeft className="h-5 w-5" /></Button><div><h1 className="text-2xl font-bold">Billing</h1><p className="text-sm text-muted-foreground">Submit claims in Availity, record what each payer returned, then review revenue.</p></div></div>
      <BillingWorkspace />
    </div>
  </main>;
}
