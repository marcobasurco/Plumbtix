import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { ROLE_LABELS } from '@shared/types/enums';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  LayoutDashboard, Ticket, Building2, Users2, Kanban,
  LogOut, Menu, Wrench, Briefcase, Moon, Sun, BarChart3,
  FileSpreadsheet,
} from 'lucide-react';

function roleRoot(role: string | null): string {
  if (role === 'proroto_admin') return '/admin';
  if (role === 'pm_admin' || role === 'pm_user') return '/dashboard';
  return '/my';
}

const ROLE_BADGE_VARIANT: Record<string, 'info' | 'urgent' | 'success' | 'secondary'> = {
  proroto_admin: 'info',
  pm_admin: 'urgent',
  pm_user: 'urgent',
  resident: 'success',
};

interface NavItem {
  label: string;
  path: string;
  matchSegment: string;
  icon: ReactNode;
}

const SHARED_NAV: NavItem[] = [
  { label: 'Overview',  path: '',          matchSegment: '__home__',
    icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
  { label: 'Tickets',   path: 'tickets',   matchSegment: 'tickets',
    icon: <Ticket className="h-[18px] w-[18px]" /> },
  { label: 'Buildings',  path: 'buildings', matchSegment: 'buildings',
    icon: <Building2 className="h-[18px] w-[18px]" /> },
  { label: 'Analytics', path: 'analytics', matchSegment: 'analytics',
    icon: <BarChart3 className="h-[18px] w-[18px]" /> },
];

const ADMIN_NAV: NavItem[] = [
  ...SHARED_NAV,
  { label: 'Companies', path: 'companies', matchSegment: 'companies',
    icon: <Briefcase className="h-[18px] w-[18px]" /> },
  { label: 'Users',     path: 'users',     matchSegment: 'users',
    icon: <Users2 className="h-[18px] w-[18px]" /> },
  { label: 'Dispatch',  path: 'dispatch',  matchSegment: 'dispatch',
    icon: <Kanban className="h-[18px] w-[18px]" /> },
  { label: 'Sync',      path: 'import',    matchSegment: 'import',
    icon: <FileSpreadsheet className="h-[18px] w-[18px]" /> },
];

interface Props { title: string; children: ReactNode; }

export function DashboardLayout({ title: _title, children }: Props) {
  const { profile, role, signOut } = useAuth();
  const location = useLocation();
  const root = roleRoot(role);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle('dark', next);
  };

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
    <TooltipProvider delayDuration={300}>
      <div className="app-shell">
        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-[39] md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
          <div className="sidebar-brand">
            <h1>
              <span className="logo-icon">
                <Wrench className="h-4 w-4" />
              </span>
              Work Orders
            </h1>
          </div>

          <div className="sidebar-user">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="sidebar-user-name">{profile?.full_name ?? 'User'}</div>
                <div className="sidebar-user-email">{profile?.email ?? ''}</div>
              </div>
            </div>
            <div className="mt-2">
              <Badge variant={ROLE_BADGE_VARIANT[role ?? ''] ?? 'secondary'}>
                {role ? ROLE_LABELS[role] : 'Unknown'}
              </Badge>
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
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground/60 hover:text-foreground gap-2.5"
              onClick={signOut}
            >
              <LogOut className="h-[18px] w-[18px]" />
              Sign Out
            </Button>
          </div>
        </aside>

        {/* Content */}
        <div className="content-area">
          <header className="content-header">
            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu-btn"
              onClick={() => setMobileOpen(true)}
              aria-label="Menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <span className="content-header-title">{activeLabel}</span>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={toggleDark} className="h-8 w-8">
                    {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{darkMode ? 'Light mode' : 'Dark mode'}</TooltipContent>
              </Tooltip>
              <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
                {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
            </div>
          </header>

          <main className="content-main">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
