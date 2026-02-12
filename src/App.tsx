// =============================================================================
// Work Orders — App Router
// =============================================================================

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ToastProvider } from '@/components/Toast';
import { Toaster } from 'sonner';
import { Loading } from '@/components/Loading';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RoleGate, roleHome } from '@/components/RoleGate';
import { ProtectedRoute } from '@/routes/protected';
import { LoginPage } from '@/routes/login';
import { AcceptInvitePage } from '@/routes/accept-invite';
import { ClaimAccountPage } from '@/routes/claim-account';
import { ForgotPasswordPage } from '@/routes/forgot-password';
import { ResetPasswordPage } from '@/routes/reset-password';
import { AdminDashboard } from '@/routes/dashboard-admin';
import { PMDashboard } from '@/routes/dashboard-pm';
import { ResidentDashboard } from '@/routes/dashboard-resident';
import { WelcomeTour } from '@/components/WelcomeTour';

function RootRedirect() {
  const { role, loading, session } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to={roleHome(role)} replace />;
}

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Toaster position="bottom-right" richColors closeButton />
            <WelcomeTour />
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/accept-invite" element={<AcceptInvitePage />} />
              <Route path="/claim-account" element={<ClaimAccountPage />} />

              {/* Protected */}
              <Route element={<ProtectedRoute />}>
                <Route path="/admin/*" element={<RoleGate allowed={['proroto_admin']}><AdminDashboard /></RoleGate>} />
                <Route path="/dashboard/*" element={<RoleGate allowed={['pm_admin', 'pm_user']}><PMDashboard /></RoleGate>} />
                <Route path="/my/*" element={<RoleGate allowed={['resident']}><ResidentDashboard /></RoleGate>} />
              </Route>

              <Route path="/" element={<RootRedirect />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
