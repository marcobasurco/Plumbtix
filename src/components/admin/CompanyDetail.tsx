// =============================================================================
// Work Orders — Company Detail (Admin)
// =============================================================================
// Full company management: buildings, users, invitations.
// Mobile-first card layout with desktop table fallback.
// =============================================================================

import { useEffect, useState, useCallback, type FormEvent, type ChangeEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchCompanyDetail,
  updateCompany,
  fetchCompanyBuildings,
  fetchUserList,
  fetchInvitations,
  type CompanyDetailRow,
  type CompanyBuildingRow,
  type UserListRow,
  type InvitationRow,
} from '@/lib/admin';
import { sendInvitation } from '@/lib/api';
import { ROLE_LABELS, INVITATION_ROLES } from '@shared/types/enums';
import type { InvitationRole } from '@shared/types/enums';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PageTransition } from '@/components/PageTransition';
import { toast } from 'sonner';
import { useRealtime } from '@/hooks/useRealtime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  ChevronLeft, Plus, Pencil, Loader2, Building2, Users2,
  Mail, Clock, ChevronRight, MapPin, UserPlus, Send, Copy, Check,
} from 'lucide-react';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ROLE_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive' | 'urgent' | 'warning' | 'success' | 'info'> = {
  proroto_admin: 'info',
  pm_admin: 'urgent',
  pm_user: 'urgent',
  resident: 'success',
};

const INVITE_ROLE_LABELS: Record<string, string> = {
  pm_admin: 'PM Admin',
  pm_user: 'PM Staff',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="px-3 py-3 flex flex-col items-center text-center gap-1.5">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
          {icon}
        </div>
        <div>
          <div className="text-xl font-bold tabular-nums leading-tight">{value}</div>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function BuildingCard({ building, onClick }: { building: CompanyBuildingRow; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="ticket-card">
      <div className="ticket-card-header">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-semibold text-sm text-foreground truncate">
            {building.name || building.address_line1}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
        <MapPin className="h-3 w-3 shrink-0" />
        {building.address_line1}, {building.city}, {building.state}
      </div>
      <ChevronRight className="ticket-card-chevron" />
    </button>
  );
}

function UserCard({ user }: { user: UserListRow }) {
  return (
    <div className="ticket-card" style={{ cursor: 'default' }}>
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
          {user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm text-foreground truncate">{user.full_name}</div>
          <div className="text-xs text-muted-foreground truncate">{user.email}</div>
        </div>
        <Badge variant={ROLE_BADGE_VARIANT[user.role] ?? 'secondary'} className="shrink-0">
          {ROLE_LABELS[user.role]}
        </Badge>
      </div>
      {user.phone && (
        <div className="text-xs text-muted-foreground mt-2 pl-12">
          📱 <a href={`tel:${user.phone}`} className="text-primary hover:underline">{user.phone}</a>
        </div>
      )}
      <div className="text-xs text-muted-foreground/60 mt-1 pl-12">
        Joined {formatDate(user.created_at)}
      </div>
    </div>
  );
}

function InvitationCard({ inv, origin }: { inv: InvitationRow; origin: string }) {
  const [copied, setCopied] = useState(false);
  const isExpired = new Date(inv.expires_at) < new Date();
  const isAccepted = !!inv.accepted_at;

  const inviteUrl = `${origin}/accept-invite?token=${inv.token}`;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success('Invite link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="ticket-card" style={{ cursor: 'default' }}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="min-w-0">
          <div className="font-semibold text-sm text-foreground truncate">{inv.name}</div>
          <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
            <Mail className="h-3 w-3 shrink-0" /> {inv.email}
          </div>
        </div>
        <Badge variant={isAccepted ? 'success' : isExpired ? 'destructive' : 'warning'} className="shrink-0">
          {isAccepted ? 'Accepted' : isExpired ? 'Expired' : 'Pending'}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-2 mt-2">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {isAccepted
            ? `Accepted ${formatDateTime(inv.accepted_at!)}`
            : `Expires ${formatDateTime(inv.expires_at)}`
          }
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{INVITE_ROLE_LABELS[inv.role] ?? inv.role}</Badge>
          {!isAccepted && !isExpired && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CompanyDetail() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();

  const [company, setCompany] = useState<CompanyDetailRow | null>(null);
  const [buildings, setBuildings] = useState<CompanyBuildingRow[]>([]);
  const [users, setUsers] = useState<UserListRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invName, setInvName] = useState('');
  const [invRole, setInvRole] = useState<InvitationRole>('pm_user');
  const [invError, setInvError] = useState<string | null>(null);
  const [invSending, setInvSending] = useState(false);

  // Active tab
  const [tab, setTab] = useState<'buildings' | 'users' | 'invitations'>('buildings');

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true); setError(null);
    try {
      const [c, b, u, inv] = await Promise.all([
        fetchCompanyDetail(companyId),
        fetchCompanyBuildings(companyId),
        fetchUserList(companyId),
        fetchInvitations(companyId),
      ]);
      setCompany(c); setBuildings(b); setUsers(u); setInvitations(inv);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useRealtime('buildings', load, { filter: `company_id=eq.${companyId}`, enabled: !!companyId && !loading });
  useRealtime('users', load, { filter: `company_id=eq.${companyId}`, enabled: !!companyId && !loading });

  // ── Edit handlers ──
  const openEdit = () => {
    if (!company) return;
    setEditName(company.name); setEditSlug(company.slug); setEditError(null); setEditOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setEditError(null);
    const trimName = editName.trim(), trimSlug = editSlug.trim();
    if (!trimName) { setEditError('Name is required'); return; }
    if (!trimSlug || !SLUG_REGEX.test(trimSlug)) {
      setEditError('Slug must be lowercase letters, numbers, and hyphens');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateCompany(company.id, { name: trimName, slug: trimSlug });
      setCompany(updated); setEditOpen(false);
      toast.success('Company updated');
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save');
    } finally { setSaving(false); }
  };

  // ── Invite handlers ──
  const resetInvite = () => {
    setInvEmail(''); setInvName(''); setInvRole('pm_user'); setInvError(null);
  };

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    setInvError(null);
    const trimEmail = invEmail.trim(), trimName = invName.trim();
    if (!trimName) { setInvError('Name is required'); return; }
    if (!trimEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimEmail)) {
      setInvError('Valid email is required'); return;
    }
    setInvSending(true);
    try {
      const result = await sendInvitation({
        company_id: companyId,
        email: trimEmail,
        name: trimName,
        role: invRole,
      });
      if (!result.ok) {
        setInvError(result.error.message); setInvSending(false); return;
      }
      resetInvite(); setInviteOpen(false);
      toast.success(`Invitation sent to ${trimEmail}`);
      load(); // refresh
    } catch (err) {
      setInvError(err instanceof Error ? err.message : 'Failed to send');
    } finally { setInvSending(false); }
  };

  // ── Loading state ──
  if (loading) return (
    <PageTransition>
      <Skeleton className="h-5 w-24 mb-6" />
      <Skeleton className="h-7 w-48 mb-2" />
      <Skeleton className="h-4 w-32 mb-6" />
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[1, 2, 3].map((i) => (
          <Card key={i}><CardContent className="px-4 py-3">
            <Skeleton className="h-3 w-16 mb-2" /><Skeleton className="h-8 w-12" />
          </CardContent></Card>
        ))}
      </div>
      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full mb-2 rounded-xl" />)}
    </PageTransition>
  );
  if (error && !company) return <ErrorBanner message={error} />;
  if (!company) return <ErrorBanner message="Company not found" />;

  const origin = window.location.origin;
  const pendingInvitations = invitations.filter(i => !i.accepted_at && new Date(i.expires_at) > new Date());
  const pastInvitations = invitations.filter(i => i.accepted_at || new Date(i.expires_at) <= new Date());

  return (
    <PageTransition>
      <Button variant="ghost" size="sm" className="mb-4 -ml-2 gap-1" onClick={() => navigate('..', { relative: 'path' })}>
        <ChevronLeft className="h-3.5 w-3.5" /> Companies
      </Button>

      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-3 mb-5">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight">{company.name}</h2>
        </div>
        <Button variant="outline" size="sm" onClick={openEdit}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6 overflow-hidden">
        <StatCard label="Buildings" value={buildings.length} icon={<Building2 className="h-4 w-4" />} />
        <StatCard label="Users" value={users.length} icon={<Users2 className="h-4 w-4" />} />
        <StatCard label="Pending" value={pendingInvitations.length} icon={<Send className="h-4 w-4" />} />
      </div>

      {/* Tabs */}
      <div className="company-tabs">
        <button
          className={`company-tab ${tab === 'buildings' ? 'active' : ''}`}
          onClick={() => setTab('buildings')}
        >
          <Building2 className="h-4 w-4" />
          Buildings
          <span className="company-tab-count">{buildings.length}</span>
        </button>
        <button
          className={`company-tab ${tab === 'users' ? 'active' : ''}`}
          onClick={() => setTab('users')}
        >
          <Users2 className="h-4 w-4" />
          Users
          <span className="company-tab-count">{users.length}</span>
        </button>
        <button
          className={`company-tab ${tab === 'invitations' ? 'active' : ''}`}
          onClick={() => setTab('invitations')}
        >
          <Mail className="h-4 w-4" />
          Invites
          {pendingInvitations.length > 0 && (
            <span className="company-tab-badge">{pendingInvitations.length}</span>
          )}
        </button>
      </div>

      {/* Tab content */}
      <div className="mt-4">

        {/* ── Buildings tab ── */}
        {tab === 'buildings' && (
          <>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-sm font-semibold text-muted-foreground">
                {buildings.length} building{buildings.length !== 1 ? 's' : ''}
              </div>
              <Button size="sm" onClick={() => navigate(`/admin/companies/${companyId}/buildings/new`)}>
                <Plus className="h-3.5 w-3.5" /> Add Building
              </Button>
            </div>
            {buildings.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-12 px-4">
                <Building2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <div className="text-sm font-semibold mb-1">No buildings yet</div>
                <div className="text-xs text-muted-foreground">Add this company's first building.</div>
                <Button size="sm" className="mt-3" onClick={() => navigate(`/admin/companies/${companyId}/buildings/new`)}>
                  <Plus className="h-3.5 w-3.5" /> Add Building
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {buildings.map((b) => (
                  <BuildingCard
                    key={b.id}
                    building={b}
                    onClick={() => navigate(`/admin/buildings/${b.id}`)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Users tab ── */}
        {tab === 'users' && (
          <>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-sm font-semibold text-muted-foreground">
                {users.length} user{users.length !== 1 ? 's' : ''}
              </div>
              <Button size="sm" onClick={() => { resetInvite(); setInviteOpen(true); }}>
                <UserPlus className="h-3.5 w-3.5" /> Invite User
              </Button>
            </div>
            {users.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-12 px-4">
                <Users2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <div className="text-sm font-semibold mb-1">No users yet</div>
                <div className="text-xs text-muted-foreground">Invite someone to manage this company.</div>
                <Button size="sm" className="mt-3" onClick={() => { resetInvite(); setInviteOpen(true); }}>
                  <UserPlus className="h-3.5 w-3.5" /> Invite User
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {users.map((u) => <UserCard key={u.id} user={u} />)}
              </div>
            )}
          </>
        )}

        {/* ── Invitations tab ── */}
        {tab === 'invitations' && (
          <>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-sm font-semibold text-muted-foreground">
                {invitations.length} invitation{invitations.length !== 1 ? 's' : ''}
              </div>
              <Button size="sm" onClick={() => { resetInvite(); setInviteOpen(true); }}>
                <UserPlus className="h-3.5 w-3.5" /> Send Invite
              </Button>
            </div>

            {invitations.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-12 px-4">
                <Mail className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <div className="text-sm font-semibold mb-1">No invitations sent</div>
                <div className="text-xs text-muted-foreground">Invite property managers to join this company.</div>
                <Button size="sm" className="mt-3" onClick={() => { resetInvite(); setInviteOpen(true); }}>
                  <UserPlus className="h-3.5 w-3.5" /> Send Invite
                </Button>
              </div>
            ) : (
              <>
                {pendingInvitations.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Pending ({pendingInvitations.length})
                    </div>
                    <div className="space-y-2">
                      {pendingInvitations.map((inv) => (
                        <InvitationCard key={inv.id} inv={inv} origin={origin} />
                      ))}
                    </div>
                  </div>
                )}
                {pastInvitations.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Past ({pastInvitations.length})
                    </div>
                    <div className="space-y-2">
                      {pastInvitations.map((inv) => (
                        <InvitationCard key={inv.id} inv={inv} origin={origin} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ── Edit Company Dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
            <DialogDescription>Update the company name and URL slug.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave}>
            <div className="space-y-4 py-2">
              <ErrorBanner message={editError} onDismiss={() => setEditError(null)} />
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">Company Name <span className="text-destructive">*</span></Label>
                <Input id="edit-name" value={editName} onChange={(e: ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-slug">Slug <span className="text-destructive">*</span></Label>
                <Input id="edit-slug" value={editSlug} onChange={(e: ChangeEvent<HTMLInputElement>) => setEditSlug(e.target.value)} />
              </div>
            </div>
            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Invite User Dialog ── */}
      <Dialog open={inviteOpen} onOpenChange={(open: boolean) => { if (!open) resetInvite(); setInviteOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>
              Send an invitation to join <strong>{company.name}</strong>. They'll receive a link to create their account.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite}>
            <div className="space-y-4 py-2">
              <ErrorBanner message={invError} onDismiss={() => setInvError(null)} />
              <div className="space-y-1.5">
                <Label htmlFor="inv-name">Full Name <span className="text-destructive">*</span></Label>
                <Input
                  id="inv-name"
                  value={invName}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setInvName(e.target.value)}
                  placeholder="Jane Smith"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-email">Email <span className="text-destructive">*</span></Label>
                <Input
                  id="inv-email"
                  type="email"
                  value={invEmail}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setInvEmail(e.target.value)}
                  placeholder="jane@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-role">Role <span className="text-destructive">*</span></Label>
                <select
                  id="inv-role"
                  className="form-select"
                  value={invRole}
                  onChange={(e) => setInvRole(e.target.value as InvitationRole)}
                >
                  {INVITATION_ROLES.map((r) => (
                    <option key={r} value={r}>{INVITE_ROLE_LABELS[r] ?? r}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  PM Admin can manage buildings & invite others. PM Staff can create tickets and view data.
                </p>
              </div>
            </div>
            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => { resetInvite(); setInviteOpen(false); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={invSending}>
                {invSending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  : <><Send className="h-3.5 w-3.5" /> Send Invitation</>
                }
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
