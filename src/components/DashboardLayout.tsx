import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { ROLE_LABELS } from '@shared/types/enums';

const ROLE_BADGE_COLORS: Record<string, { bg: string; color: string }> = {
  proroto_admin: { bg: '#dbeafe', color: '#1e40af' },
  pm_admin:      { bg: '#fef3c7', color: '#92400e' },
  pm_user:       { bg: '#fef3c7', color: '#92400e' },
  resident:      { bg: '#d1fae5', color: '#065f46' },
};

function roleRoot(role: string | null): string {
  if (role === 'proroto_admin') return '/admin';
  if (role === 'pm_admin' || role === 'pm_user') return '/dashboard';
  return '/my';
}

interface NavTab {
  label: string;
  /** Path relative to role root, or '' for index */
  path: string;
  /** Path segment used to detect active state */
  matchSegment: string;
}

const SHARED_TABS: NavTab[] = [
  { label: 'Tickets', path: '', matchSegment: '' },
  { label: 'Buildings', path: 'buildings', matchSegment: 'buildings' },
];

const ADMIN_TABS: NavTab[] = [
  ...SHARED_TABS,
  { label: 'Companies', path: 'companies', matchSegment: 'companies' },
  { label: 'Users', path: 'users', matchSegment: 'users' },
  { label: 'Dispatch', path: 'dispatch', matchSegment: 'dispatch' },
];

interface DashboardLayoutProps {
  title: string;
  children: ReactNode;
}

export function DashboardLayout({ title, children }: DashboardLayoutProps) {
  const { profile, role, signOut } = useAuth();
  const location = useLocation();
  const badgeColor = ROLE_BADGE_COLORS[role ?? ''] ?? { bg: '#f3f4f6', color: '#374151' };
  const root = roleRoot(role);

  const tabs = role === 'proroto_admin' ? ADMIN_TABS : SHARED_TABS;

  // Determine active tab by matching the first path segment after root
  const pathAfterRoot = location.pathname.replace(root, '').replace(/^\//, '');
  const firstSegment = pathAfterRoot.split('/')[0] || '';

  function isActive(tab: NavTab): boolean {
    if (tab.matchSegment === '') {
      // "Tickets" tab is active when segment is empty or starts with 'tickets'
      return firstSegment === '' || firstSegment === 'tickets';
    }
    return firstSegment === tab.matchSegment;
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>{title}</h1>
          <p style={{ fontSize: '0.85rem', color: '#666' }}>
            {profile?.full_name} · {profile?.email}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            className="badge"
            style={{ background: badgeColor.bg, color: badgeColor.color }}
          >
            {role ? ROLE_LABELS[role] : 'Unknown'}
          </span>
          <button
            className="btn btn-danger"
            style={{ width: 'auto', padding: '6px 16px', fontSize: '0.85rem' }}
            onClick={signOut}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Navigation tabs */}
      <nav style={navStyle}>
        {tabs.map((tab) => (
          <Link
            key={tab.label}
            to={tab.path ? `${root}/${tab.path}` : root}
            style={{ ...tabStyle, ...(isActive(tab) ? activeTabStyle : {}) }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}

const navStyle: React.CSSProperties = {
  display: 'flex',
  gap: '4px',
  marginBottom: '20px',
  borderBottom: '2px solid #e5e7eb',
  paddingBottom: 0,
};

const tabStyle: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: '0.9rem',
  fontWeight: 500,
  color: '#6b7280',
  textDecoration: 'none',
  borderBottom: '2px solid transparent',
  marginBottom: '-2px',
  transition: 'color 0.15s, border-color 0.15s',
};

const activeTabStyle: React.CSSProperties = {
  color: '#2563eb',
  borderBottomColor: '#2563eb',
};
