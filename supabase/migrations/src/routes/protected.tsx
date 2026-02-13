import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Loading } from '@/components/Loading';

/**
 * Route guard that requires an authenticated session with a loaded profile.
 * Wrap protected routes with this as a layout route.
 *
 * If not authenticated → redirect to /login (preserves intended destination).
 * If authenticated but profile not loaded yet → show loading.
 */
export function ProtectedRoute() {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Loading message="Authenticating…" />;
  }

  // No session → go to login, remember where they wanted to go
  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Session exists but profile hasn't loaded (shouldn't persist, but handle gracefully)
  if (!profile) {
    return <Loading message="Loading profile…" />;
  }

  // Authenticated + profile loaded → render child routes
  return <Outlet />;
}
