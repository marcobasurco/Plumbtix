// =============================================================================
// PlumbTix — App Router
// =============================================================================
// Route structure:
//   Public:
//     /login                  → Login page
//     /accept-invite?token=   → PM onboarding
//     /claim-account?token=   → Resident onboarding
//
//   Protected (requires auth):
//     /admin                  → proroto_admin dashboard
//     /dashboard              → pm_admin / pm_user dashboard
//     /my                     → resident dashboard
//
//   Root (/) redirects to role-appropriate dashboard after login.
// =============================================================================

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth';
import { Loading } from '@/components/Loading';
import { RoleGate, roleHome } from '@/components/RoleGate';
import { ProtectedRoute } from '@/routes/protected';
import { LoginPage } from '@/routes/login';
import { AcceptInvitePage } from '@/routes/accept-invite';
import { ClaimAccountPage } from '@/routes/claim-account';
import { AdminDashboard } from '@/routes/dashboard-admin';
import { PMDashboard } from '@/routes/dashboard-pm';
import { ResidentDashboard } from '@/routes/dashboard-resident';

function RootRedirect() {
  const { role, loading, session } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to={roleHome(role)} replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ── Public routes ── */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="/claim-account" element={<ClaimAccountPage />} />

          {/* ── Protected routes ── */}
          <Route element={<ProtectedRoute />}>
            {/* Pro Roto Admin */}
            <Route
              path="/admin/*"
              element={
                <RoleGate allowed={['proroto_admin']}>
                  <AdminDashboard />
                </RoleGate>
              }
            />

            {/* PM Admin / PM User */}
            <Route
              path="/dashboard/*"
              element={
                <RoleGate allowed={['pm_admin', 'pm_user']}>
                  <PMDashboard />
                </RoleGate>
              }
            />

            {/* Resident */}
            <Route
              path="/my/*"
              element={
                <RoleGate allowed={['resident']}>
                  <ResidentDashboard />
                </RoleGate>
              }
            />
          </Route>

          {/* ── Root redirect ── */}
          <Route path="/" element={<RootRedirect />} />

          {/* ── Catch-all → root ── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
