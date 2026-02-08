import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { ROLE_LABELS } from '@shared/types/enums';
import {
  LayoutDashboard, Ticket, Building2, Users2, Kanban,
  LogOut, Menu, Wrench, Briefcase,
} from 'lucide-react';

function roleRoot(role: string | null): string {
  if (role === 'proroto_admin') return '/admin';
  if (role === 'pm_admin' || role === 'pm_user') return '/dashboard';
  return '/my';
}

const ROLE_BADGE: Record<string, string> = {
  proroto_admin: 'badge-blue',
  pm_admin: 'badge-amber',
  pm_user: 'badge-amber',
  resident: 'badge-green',
};

interface NavItem {
  label: string;
  path: string;
  matchSegment: string;
  icon: ReactNode;
}

const SHARED_NAV: NavItem[] = [
  { label: 'Overview',  path: '',          matchSegment: '__home__',
    icon: <LayoutDashboard size={18} /> },
  { label: 'Tickets',   path: 'tickets',   matchSegment: 'tickets',
    icon: <Ticket size={18} /> },
  { label: 'Buildings',  path: 'buildings', matchSegment: 'buildings',
    icon: <Building2 size={18} /> },
];

const ADMIN_NAV: NavItem[] = [
  ...SHARED_NAV,
  { label: 'Companies', path: 'companies', matchSegment: 'companies',
    icon: <Briefcase size={18} /> },
  { label: 'Users',     path: 'users',     matchSegment: 'users',
    icon: <Users2 size={18} /> },
  { label: 'Dispatch',  path: 'dispatch',  matchSegment: 'dispatch',
    icon: <Kanban size={18} /> },
];

interface Props { title: string; children: ReactNode; }

export function DashboardLayout({ title: _title, children }: Props) {
  const { profile, role, signOut } = useAuth();
  const location = useLocation();
  const root = roleRoot(role);
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = role === 'proroto_admin' ? ADMIN_NAV : SHARED_NAV;
  const pathAfterRoot = location.pathname.replace(root, '').replace(/^\//, '');
  const firstSegment = pathAfterRoot.split('/')[0] || '';

  function isActive(item: NavItem): boolean {
    if (item.matchSegment === '__home__') return firstSegment === '';
    return firstSegment === item.matchSegment;
  }

  const activeLabel = nav.find(isActive)?.label ?? 'Dashboard';

  // User initials for avatar
  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <div className="app-shell">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 39 }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <h1>
            <span className="logo-icon">
              <Wrench size={16} />
            </span>
            PlumbTix
          </h1>
        </div>

        <div className="sidebar-user">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(135deg, var(--blue-400), var(--blue-600))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 'var(--text-xs)', fontWeight: 700, color: '#fff',
              flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="sidebar-user-name">{profile?.full_name ?? 'User'}</div>
              <div className="sidebar-user-email">{profile?.email ?? ''}</div>
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <span className={`badge ${ROLE_BADGE[role ?? ''] ?? 'badge-slate'}`}>
              {role ? ROLE_LABELS[role] : 'Unknown'}
            </span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {nav.map((item) => (
            <Link
              key={item.label}
              to={item.path ? `${root}/${item.path}` : root}
              className={`sidebar-link ${isActive(item) ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button onClick={signOut} className="btn btn-ghost w-full" style={{ justifyContent: 'flex-start', color: 'var(--slate-400)', gap: '10px' }}>
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Content */}
      <div className="content-area">
        <header className="content-header">
          {/* Mobile hamburger */}
          <button
            className="btn btn-ghost btn-icon mobile-menu-btn"
            onClick={() => setMobileOpen(true)}
            aria-label="Menu"
          >
            <Menu size={20} />
          </button>
          <span className="content-header-title">{activeLabel}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="text-xs text-muted" style={{ fontFamily: 'var(--font-mono)' }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>
        </header>

        <main className="content-main">
          {children}
        </main>
      </div>

      <style>{`
        .mobile-menu-btn { display: none !important; }
        @media (max-width: 768px) {
          .mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
