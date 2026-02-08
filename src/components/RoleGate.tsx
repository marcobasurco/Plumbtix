import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Loading } from './Loading';
import type { UserRole } from '@shared/types/enums';

interface RoleGateProps {
  /** Roles that are allowed to see this content */
  allowed: readonly UserRole[];
  /** Where to redirect if role doesn't match (default: role-based home) */
  fallback?: string;
  children: ReactNode;
}

/**
 * Role-based content gate. Wraps a route or section.
 * If the user's role is not in `allowed`, redirects to fallback or role home.
 */
export function RoleGate({ allowed, fallback, children }: RoleGateProps) {
  const { role, loading } = useAuth();

  if (loading) return <Loading message="Checking permissions…" />;

  if (!role || !allowed.includes(role)) {
    const destination = fallback ?? roleHome(role);
    return <Navigate to={destination} replace />;
  }

  return <>{children}</>;
}

/** Default home route for each role */
export function roleHome(role: UserRole | null): string {
  switch (role) {
    case 'proroto_admin':
      return '/admin';
    case 'pm_admin':
    case 'pm_user':
      return '/dashboard';
    case 'resident':
      return '/my';
    default:
      return '/login';
  }
}
