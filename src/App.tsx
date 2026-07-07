import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./components/AuthProvider";
import { ViewAsProvider, useViewAs } from "./components/ViewAsProvider";
import { useIsAdmin } from "./hooks/useIsAdmin";
import { ViewAsBanner } from "./components/ViewAsBanner";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import Billing from "./pages/Billing";
import AuditLogs from "./pages/AuditLogs";
import ResetPassword from "./pages/ResetPassword";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// While a superadmin is previewing as an employee, superadmin-only routes are
// hidden from the employee view, so navigating to them redirects home.
const SuperadminRoute = ({ children }: { children: JSX.Element }) => {
  const { isViewingAs } = useViewAs();
  return isViewingAs ? <Navigate to="/" replace /> : children;
};

// Admin + Superadmin routes (Dashboard, Billing). Hidden while previewing as staff.
const AdminRoute = ({ children }: { children: JSX.Element }) => {
  const { isViewingAs } = useViewAs();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading } = useIsAdmin();
  if (authLoading || loading) return <div className="flex items-center justify-center min-h-screen">Loading…</div>;
  if (isViewingAs || !isAdmin) return <Navigate to="/" replace />;
  return children;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ViewAsProvider>
            <ViewAsBanner />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
              <Route path="/billing" element={<AdminRoute><Billing /></AdminRoute>} />
              <Route path="/audit-logs" element={<SuperadminRoute><AuditLogs /></SuperadminRoute>} />

              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ViewAsProvider>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
