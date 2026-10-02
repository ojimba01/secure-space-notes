import { TextScale } from "./components/TextScale";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./components/AuthProvider";
import { ViewAsProvider, useViewAs } from "./components/ViewAsProvider";
import { ViewAsBanner } from "./components/ViewAsBanner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import Billing from "./pages/Billing";
import Workbook from "./pages/Workbook";
import ClinicalNotes from "./pages/ClinicalNotes";
import ResetPassword from "./pages/ResetPassword";
import HelpGuide from "./pages/HelpGuide";
import NotFound from "./pages/NotFound";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { lazy, Suspense } from "react";
import { usePageActivity } from "@/hooks/useStaffActivity";
import { SupportButton } from "@/components/support/SupportButton";

// The migration tooling pulls in ZIP/spreadsheet parsing, so it is only
// fetched when an admin actually opens Advanced Tools.
const AdvancedToolsPage = lazy(() => import("./pages/AdvancedToolsPage"));
const StaffActivity = lazy(() => import("./pages/StaffActivity"));
const SupportTickets = lazy(() => import("./pages/SupportTickets"));

/** Records which page each signed-in person has open, for Staff activity. */
const PageActivityTracker = () => {
  usePageActivity();
  return null;
};

const queryClient = new QueryClient();

// Each of these pages checks access itself, and those checks follow a preview:
// previewing an admin opens Billing, previewing a case manager is sent home.
// Nothing is saved during a preview (src/lib/previewGuard.ts).
const SuperadminRoute = ({ children }: { children: JSX.Element }) => children;

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
            <TextScale />
            <PageActivityTracker />
            <SupportButton />
            <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/admin" element={<SuperadminRoute><Admin /></SuperadminRoute>} />
              <Route path="/billing" element={<SuperadminRoute><Billing /></SuperadminRoute>} />
              <Route path="/workbook" element={<SuperadminRoute><Workbook /></SuperadminRoute>} />
              <Route path="/clinical-notes" element={<ClinicalNotes />} />
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
              <Route
                path="/staff-activity"
                element={
                  <SuperadminRoute>
                    <Suspense
                      fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}
                    >
                      <StaffActivity />
                    </Suspense>
                  </SuperadminRoute>
                }
              />
              <Route
                path="/support-tickets"
                element={
                  <SuperadminRoute>
                    <Suspense
                      fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}
                    >
                      <SupportTickets />
                    </Suspense>
                  </SuperadminRoute>
                }
              />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/onboarding" element={<HelpGuide />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </ErrorBoundary>
          </ViewAsProvider>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
