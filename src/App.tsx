import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./components/AuthProvider";
import { ViewAsProvider } from "./components/ViewAsProvider";
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
              <Route path="/admin" element={<Admin />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/audit-logs" element={<AuditLogs />} />
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
