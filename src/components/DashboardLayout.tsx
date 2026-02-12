// =============================================================================
// PlumbTix — App Shell (DashboardLayout v3)
// =============================================================================
// Modern SaaS layout:
//   • Left sidebar: logo, nav grouped by section, user card, sign-out
//   • Top header: breadcrumb title, notification bell, dark mode, user dropdown
//   • Mobile: sidebar as sheet overlay with hamburger trigger
// =============================================================================

import { useState, type ReactNode, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { ROLE_LABELS } from '@shared/types/enums';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LayoutDashboard, Ticket, Building2, Users2, Kanban,
  LogOut, Menu, Wrench, Briefcase, Moon, Sun, BarChart3,
  FileSpreadsheet, ChevronRight, Settings,
} from 'lucide-react';
import { NotificationBell } from '@/components/NotificationBell';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Nav config
// ---------------------------------------------------------------------------

interface NavItem {
  label: string;
  path: string;
  matchSegment: string;
  icon: ReactNode;
  section?: string;
}

const CORE_NAV: NavItem[] = [
  { label: 'Overview', path: '', matchSegment: '__home__', icon: <LayoutDashboard className="h-[18px] w-[18px]" />, section: 'Main' },
  { label: 'Tickets', path: 'tickets', matchSegment: 'tickets', icon: <Ticket className="h-[18px] w-[18px]" />, section: 'Main' },
  { label: 'Buildings', path: 'buildings', matchSegment: 'buildings', icon: <Building2 className="h-[18px] w-[18px]" />, section: 'Main' },
  { label: 'Analytics', path: 'analytics', matchSegment: 'analytics', icon: <BarChart3 className="h-[18px] w-[18px]" />, section: 'Main' },
];

const ADMIN_EXTRA: NavItem[] = [
  { label: 'Companies', path: 'companies', matchSegment: 'companies', icon: <Briefcase className="h-[18px] w-[18px]" />, section: 'Management' },
  { label: 'Users', path: 'users', matchSegment: 'users', icon: <Users2 className="h-[18px] w-[18px]" />, section: 'Management' },
  { label: 'Dispatch', path: 'dispatch', matchSegment: 'dispatch', icon: <Kanban className="h-[18px] w-[18px]" />, section: 'Management' },
  { label: 'Sync', path: 'import', matchSegment: 'import', icon: <FileSpreadsheet className="h-[18px] w-[18px]" />, section: 'Tools' },
  { label: 'Reports', path: 'reports', matchSegment: 'reports', icon: <BarChart3 className="h-[18px] w-[18px]" />, section: 'Tools' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props { title: string; children: ReactNode; }

export function DashboardLayout({ title: _title, children }: Props) {
  const { profile, role, signOut } = useAuth();
  const location = useLocation();
  const root = roleRoot(role);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Dark mode from localStorage
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem('plumbtix-theme');
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('plumbtix-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Build nav
  const nav = role === 'proroto_admin' ? [...CORE_NAV, ...ADMIN_EXTRA] : CORE_NAV;
  const pathAfterRoot = location.pathname.replace(root, '').replace(/^\//, '');
  const firstSegment = pathAfterRoot.split('/')[0] || '';

  function isActive(item: NavItem): boolean {
    if (item.matchSegment === '__home__') return firstSegment === '';
    return firstSegment === item.matchSegment;
  }

  const activeLabel = nav.find(isActive)?.label ?? 'Dashboard';

  // Group nav by section
  const sections = new Map<string, NavItem[]>();
  for (const item of nav) {
    const section = item.section ?? 'Main';
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section)!.push(item);
  }

  // User initials
  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  const firstName = profile?.full_name?.split(' ')[0] ?? 'User';

  // Close mobile on nav
  const closeMobile = () => setMobileOpen(false);

  // Sidebar content (shared between desktop and mobile)
  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="sidebar-brand">
        <h1>
          <span className="logo-icon">
            <Wrench className="h-4 w-4" />
          </span>
          PlumbTix
        </h1>
      </div>

      {/* User card */}
      <div className="sidebar-user">
        <div className="flex items-center gap-2.5">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-gradient-to-br from-blue-400 to-blue-600 text-xs font-bold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
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

      {/* Nav links grouped by section */}
      <nav className="sidebar-nav">
        {Array.from(sections.entries()).map(([section, items], idx) => (
          <div key={section}>
            {idx > 0 && <div className="sidebar-section-label">{section}</div>}
            {items.map((item) => (
              <Link
                key={item.label}
                to={item.path ? `${root}/${item.path}` : root}
                className={`sidebar-link ${isActive(item) ? 'active' : ''}`}
                onClick={closeMobile}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
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
    </>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="app-shell">
        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-[39] md:hidden"
            onClick={closeMobile}
          />
        )}

        {/* Sidebar */}
        <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
          {sidebarContent}
        </aside>

        {/* Content */}
        <div className="content-area">
          <header className="content-header">
            <div className="flex items-center gap-3">
              {/* Mobile hamburger */}
              <Button
                variant="ghost"
                size="icon"
                className="mobile-menu-btn h-8 w-8"
                onClick={() => setMobileOpen(true)}
                aria-label="Menu"
              >
                <Menu className="h-5 w-5" />
              </Button>

              {/* Breadcrumb-style title */}
              <div className="flex items-center gap-1.5 text-sm">
                <span className="text-muted-foreground font-medium hidden sm:inline">PlumbTix</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 hidden sm:block" />
                <span className="content-header-title">{activeLabel}</span>
              </div>
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-1.5">
              <NotificationBell />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDarkMode(!darkMode)}
                    className="h-8 w-8"
                  >
                    {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{darkMode ? 'Light mode' : 'Dark mode'}</TooltipContent>
              </Tooltip>

              {/* User dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 gap-2 px-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="bg-gradient-to-br from-blue-400 to-blue-600 text-[10px] font-bold text-white">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium hidden sm:inline">{firstName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">{profile?.full_name ?? 'User'}</p>
                      <p className="text-xs text-muted-foreground">{profile?.email ?? ''}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setDarkMode(!darkMode)}>
                    {darkMode ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                    {darkMode ? 'Light mode' : 'Dark mode'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
