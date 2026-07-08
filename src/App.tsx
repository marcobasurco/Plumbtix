// =============================================================================
// Work Orders — App Router
// =============================================================================
// Code splitting (v0.9.x): the three role dashboards and secondary routes are
// lazy-loaded. A resident's phone no longer downloads admin dashboards,
// recharts, or the xlsx parser just to render the login page. Login stays
// eager for instant first paint; everything else loads on demand.
// =============================================================================

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ToastProvider } from '@/components/Toast';
import { Toaster } from 'sonner';
import { Loading } from '@/components/Loading';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RoleGate, roleHome } from '@/components/RoleGate';
import { ProtectedRoute } from '@/routes/protected';
import { LoginPage } from '@/routes/login';
import { WelcomeTour } from '@/components/WelcomeTour';

// ── Lazy routes (each becomes its own chunk in the build) ──
const AdminDashboard = lazy(() =>
  import('@/routes/dashboard-admin').then((m) => ({ default: m.AdminDashboard })));
const PMDashboard = lazy(() =>
  import('@/routes/dashboard-pm').then((m) => ({ default: m.PMDashboard })));
const ResidentDashboard = lazy(() =>
  import('@/routes/dashboard-resident').then((m) => ({ default: m.ResidentDashboard })));
const PublicTicketView = lazy(() =>
  import('@/routes/public-ticket').then((m) => ({ default: m.PublicTicketView })));
const AcceptInvitePage = lazy(() =>
  import('@/routes/accept-invite').then((m) => ({ default: m.AcceptInvitePage })));
const ClaimAccountPage = lazy(() =>
  import('@/routes/claim-account').then((m) => ({ default: m.ClaimAccountPage })));
const ForgotPasswordPage = lazy(() =>
  import('@/routes/forgot-password').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() =>
  import('@/routes/reset-password').then((m) => ({ default: m.ResetPasswordPage })));

function RootRedirect() {
  const { role, loading, session } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to={roleHome(role)} replace />;
}

/** Short link redirect: /t/:ticketId → /{roleRoot}/tickets/:ticketId */
function TicketShortLink() {
  const { role, loading, session } = useAuth();
  const { ticketId } = useParams();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />;

  const base = roleHome(role);
  return <Navigate to={`${base}/tickets/${ticketId}`} replace />;
}

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Toaster position="bottom-right" richColors closeButton />
            <WelcomeTour />
            <Suspense fallback={<Loading />}>
              <Routes>
                {/* Public */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/accept-invite" element={<AcceptInvitePage />} />
                <Route path="/claim-account" element={<ClaimAccountPage />} />

                {/* Short link for SMS/email ticket links (requires login) */}
                <Route path="/t/:ticketId" element={<TicketShortLink />} />

                {/* Public ticket view — QR code / shareable link (no login) */}
                <Route path="/p/:token" element={<PublicTicketView />} />

                {/* Protected */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/admin/*" element={<RoleGate allowed={['proroto_admin']}><AdminDashboard /></RoleGate>} />
                  <Route path="/dashboard/*" element={<RoleGate allowed={['pm_admin', 'pm_user']}><PMDashboard /></RoleGate>} />
                  <Route path="/my/*" element={<RoleGate allowed={['resident']}><ResidentDashboard /></RoleGate>} />
                </Route>

                <Route path="/" element={<RootRedirect />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
