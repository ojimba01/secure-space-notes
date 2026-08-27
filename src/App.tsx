import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./components/AuthProvider";
import { ViewAsProvider, useViewAs } from "./components/ViewAsProvider";
import { ViewAsBanner } from "./components/ViewAsBanner";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import Billing from "./pages/Billing";
import AuditLogs from "./pages/AuditLogs";
import ResetPassword from "./pages/ResetPassword";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { lazy, Suspense } from "react";

// The migration tooling pulls in ZIP/spreadsheet parsing, so it is only
// fetched when an admin actually opens Advanced Tools.
const AdvancedToolsPage = lazy(() => import("./pages/AdvancedToolsPage"));

const queryClient = new QueryClient();

// While a superadmin is previewing as an employee, superadmin-only routes are
// hidden from the employee view, so navigating to them redirects home.
const SuperadminRoute = ({ children }: { children: JSX.Element }) => {
  const { isViewingAs } = useViewAs();
  return isViewingAs ? <Navigate to="/" replace /> : children;
};

// Migration utilities are Admin/Superadmin only, and are hidden during an
// employee preview for the same reason.
const AdminRoute = ({ children }: { children: JSX.Element }) => {
  const { isViewingAs } = useViewAs();
  const { isAdmin, loading } = useIsAdmin();
  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  return isAdmin && !isViewingAs ? children : <Navigate to="/" replace />;
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
              <Route path="/admin" element={<SuperadminRoute><Admin /></SuperadminRoute>} />
              <Route path="/billing" element={<SuperadminRoute><Billing /></SuperadminRoute>} />
              <Route path="/audit-logs" element={<SuperadminRoute><AuditLogs /></SuperadminRoute>} />
              <Route
                path="/advanced-tools"
                element={
                  <AdminRoute>
                    <Suspense
                      fallback={
                        <div className="flex items-center justify-center min-h-screen">
                          Loading...
                        </div>
                      }
                    >
                      <AdvancedToolsPage />
                    </Suspense>
                  </AdminRoute>
                }
              />
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
