// =============================================================================
// Team — property-company Admins manage their own people
// =============================================================================
// Who can see it: pm_admin only (route + nav gated; RLS and the invitation
// edge functions enforce the same rule server-side).
//
// What an Admin does here:
//   • invite an Admin or Staff member (send-invitation, own company only)
//   • resend / revoke a pending invitation
//   • choose which buildings each Staff member can see (building_entitlements)
//
// Admins see every building in the company; Staff see only the buildings
// they are given. Only Pro Roto dispatches, so there is nothing here about
// technicians or scheduling.
// =============================================================================

import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { fetchUserList, fetchInvitations, type UserListRow, type InvitationRow } from '@/lib/admin';
import { fetchBuildingOptions, type BuildingOption } from '@/lib/tickets';
import { fetchAllEntitlements, createEntitlement, deleteEntitlement, type EntitlementRow } from '@/lib/buildings';
import { sendInvitation, resendInvitation, deleteInvitation } from '@/lib/api';
import type { InvitationRole } from '@shared/types/enums';
import { ROLE_LABELS } from '@shared/types/enums';
import { PageTransition } from '@/components/PageTransition';
import { ErrorBanner, friendlyError } from '@/components/ErrorBanner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { UserPlus, Users2, Mail, Building2, ChevronDown, ChevronUp, Loader2, RefreshCw, X } from 'lucide-react';

type Member = UserListRow & { role: 'pm_admin' | 'pm_user' };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function buildingLabel(b: BuildingOption): string {
  return b.name ? `${b.name} — ${b.address_line1}` : `${b.address_line1}, ${b.city}`;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

// ---------------------------------------------------------------------------
// Building access editor (one Staff member)
// ---------------------------------------------------------------------------

function AccessEditor({ member, buildings, entitlements, onChanged }: {
  member: Member;
  buildings: BuildingOption[];
  entitlements: EntitlementRow[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const mine = useMemo(() => new Map(entitlements.filter((e) => e.user_id === member.id).map((e) => [e.building_id, e])), [entitlements, member.id]);

  const toggle = async (b: BuildingOption) => {
    setBusy(b.id);
    try {
      const existing = mine.get(b.id);
      if (existing) {
        await deleteEntitlement(existing.id);
        toast.success(`${member.full_name} no longer sees ${b.name || b.address_line1}`);
      } else {
        await createEntitlement(b.id, member.id);
        toast.success(`${member.full_name} can now see ${b.name || b.address_line1}`);
      }
      onChanged();
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't update building access."));
    } finally {
      setBusy(null);
    }
  };

  if (buildings.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No buildings yet. Add a building first, then come back to give access.</p>;
  }

  return (
    <fieldset className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
      <legend className="px-1 text-xs font-semibold text-muted-foreground">Buildings {member.full_name.split(' ')[0]} can see</legend>
      <ul className="m-0 list-none p-0 divide-y divide-border">
        {buildings.map((b) => {
          const checked = mine.has(b.id);
          const id = `access-${member.id}-${b.id}`;
          return (
            <li key={b.id}>
              <label htmlFor={id} className="flex items-center gap-3 min-h-[44px] py-1 cursor-pointer">
                <input
                  id={id}
                  type="checkbox"
                  className="h-5 w-5 accent-primary shrink-0"
                  checked={checked}
                  disabled={busy !== null}
                  onChange={() => toggle(b)}
                />
                <span className="text-sm flex-1 min-w-0 truncate">{buildingLabel(b)}</span>
                {busy === b.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />}
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function TeamPage() {
  const { profile, companyId } = useAuth();
  const ids = { name: useId(), email: useId(), role: useId() };

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [buildings, setBuildings] = useState<BuildingOption[]>([]);
  const [entitlements, setEntitlements] = useState<EntitlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invName, setInvName] = useState('');
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState<InvitationRole>('pm_user');
  const [invBusy, setInvBusy] = useState(false);
  const [invError, setInvError] = useState<string | null>(null);

  // Invitation actions
  const [resending, setResending] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<InvitationRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [users, invs, blds, ents] = await Promise.all([
        fetchUserList(companyId),
        fetchInvitations(companyId),
        fetchBuildingOptions(),
        fetchAllEntitlements(),
      ]);
      setMembers(users.filter((u): u is Member => u.role === 'pm_admin' || u.role === 'pm_user'));
      setInvitations(invs.filter((i) => !i.accepted_at));
      setBuildings(blds);
      setEntitlements(ents);
    } catch (e) {
      setError(friendlyError(e, "Couldn't load your team."));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // Entitlements refresh on their own so a checkbox tick doesn't blank the page
  const refreshEntitlements = useCallback(async () => {
    try { setEntitlements(await fetchAllEntitlements()); } catch { /* next full load will catch up */ }
  }, []);

  const resetInvite = () => { setInvName(''); setInvEmail(''); setInvRole('pm_user'); setInvError(null); };

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    setInvBusy(true);
    setInvError(null);
    const result = await sendInvitation({
      company_id: companyId, email: invEmail.trim(), name: invName.trim(), role: invRole,
    });
    setInvBusy(false);
    if (!result.ok) { setInvError(result.error.message); return; }
    toast.success(`Invitation sent to ${result.data.invitation.email}`, {
      description: invRole === 'pm_user'
        ? "Once they accept, come back here to choose their buildings."
        : 'They can see every building as soon as they accept.',
    });
    setInviteOpen(false);
    resetInvite();
    load();
  };

  const handleResend = async (inv: InvitationRow) => {
    setResending(inv.id);
    const result = await resendInvitation({ invitation_id: inv.id });
    setResending(null);
    if (result.ok) { toast.success(`Invitation re-sent to ${inv.email}`); load(); }
    else toast.error(result.error.message);
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    const result = await deleteInvitation(revokeTarget.id);
    setRevoking(false);
    setRevokeTarget(null);
    if (result.ok) { toast.success('Invitation revoked'); load(); }
    else toast.error(result.error.message);
  };

  const accessCount = (userId: string) => entitlements.filter((e) => e.user_id === userId).length;
  const admins = members.filter((m) => m.role === 'pm_admin').length;
  const staff = members.length - admins;

  return (
    <PageTransition>
      <div className="page-title-bar">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight">Team</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? 'Loading…' : `${admins} admin${admins === 1 ? '' : 's'} · ${staff} staff`}
            {!loading && ' — admins see every building; staff see the buildings you give them.'}
          </p>
        </div>
        <Button size="lg" onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-5 w-5" aria-hidden="true" /> Invite someone
        </Button>
      </div>

      <ErrorBanner message={error} onRetry={load} onDismiss={() => setError(null)} />

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Members */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                People
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Just you so far. Invite someone to get started.</p>
              ) : (
                <ul className="m-0 list-none p-0 divide-y divide-border">
                  {members.map((m) => {
                    const isMe = m.id === profile?.id;
                    const isStaff = m.role === 'pm_user';
                    const open = expanded === m.id;
                    const n = accessCount(m.id);
                    return (
                      <li key={m.id} className="py-3">
                        <div className="flex items-center gap-3">
                          <div aria-hidden="true" className="h-10 w-10 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                            {initials(m.full_name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm truncate">{m.full_name}{isMe && <span className="text-muted-foreground font-normal"> (you)</span>}</span>
                              <Badge variant={isStaff ? 'secondary' : 'info'}>{ROLE_LABELS[m.role]}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <Building2 className="h-3 w-3" aria-hidden="true" />
                              {isStaff
                                ? (n === 0 ? 'No buildings yet' : `${n} of ${buildings.length} building${buildings.length === 1 ? '' : 's'}`)
                                : 'All buildings'}
                            </div>
                          </div>
                          {isStaff && (
                            <Button
                              variant={n === 0 ? 'default' : 'outline'}
                              size="sm"
                              className="shrink-0 min-h-[44px] sm:min-h-0"
                              aria-expanded={open}
                              onClick={() => setExpanded(open ? null : m.id)}
                            >
                              {n === 0 ? 'Choose buildings' : 'Buildings'}
                              {open ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                            </Button>
                          )}
                        </div>
                        {isStaff && open && (
                          <AccessEditor member={m} buildings={buildings} entitlements={entitlements} onChanged={refreshEntitlements} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Pending invitations */}
          {invitations.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Waiting to accept
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="m-0 list-none p-0 divide-y divide-border">
                  {invitations.map((inv) => {
                    const left = daysUntil(inv.expires_at);
                    const expired = left <= 0;
                    return (
                      <li key={inv.id} className="py-3 flex items-center gap-3 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm truncate">{inv.name}</span>
                            <Badge variant={inv.role === 'pm_user' ? 'secondary' : 'info'}>{inv.role === 'pm_admin' || inv.role === 'pm_user' ? ROLE_LABELS[inv.role] : inv.role}</Badge>
                            {expired && <Badge variant="warning">Expired</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {inv.email} · sent {formatDate(inv.created_at)}
                            {!expired && ` · expires in ${left} day${left === 1 ? '' : 's'}`}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="min-h-[44px] sm:min-h-0" disabled={resending === inv.id} onClick={() => handleResend(inv)}>
                            {resending === inv.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                            {expired ? 'Send again' : 'Resend'}
                          </Button>
                          <Button variant="ghost" size="sm" className="min-h-[44px] sm:min-h-0 text-muted-foreground hover:text-destructive" onClick={() => setRevokeTarget(inv)}>
                            <X className="h-4 w-4" aria-hidden="true" /> Revoke
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={(open: boolean) => { if (!open) resetInvite(); setInviteOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite someone</DialogTitle>
            <DialogDescription>They'll get an email with a link to set up their account.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite}>
            <div className="space-y-4 py-2">
              <ErrorBanner message={invError} onDismiss={() => setInvError(null)} />
              <div className="space-y-1.5">
                <Label htmlFor={ids.name}>Full name</Label>
                <Input id={ids.name} value={invName} onChange={(e) => setInvName(e.target.value)} placeholder="Jane Smith" autoComplete="name" required autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={ids.email}>Work email</Label>
                <Input id={ids.email} type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder="jane@stanfordhealthcare.org" autoComplete="email" inputMode="email" required />
              </div>
              <fieldset>
                <legend className="text-sm font-medium mb-1.5">Role</legend>
                <div className="grid gap-2">
                  {([
                    { value: 'pm_user' as const, title: 'Staff', body: 'Reports problems and follows work orders for the buildings you choose.' },
                    { value: 'pm_admin' as const, title: 'Admin', body: 'Sees every building, invites people, and approves quotes.' },
                  ]).map((opt) => (
                    <label key={opt.value} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer min-h-[44px] ${invRole === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'}`}>
                      <input type="radio" name={ids.role} value={opt.value} checked={invRole === opt.value} onChange={() => setInvRole(opt.value)} className="mt-1 h-4 w-4 accent-primary" />
                      <span>
                        <span className="block text-sm font-semibold">{opt.title}</span>
                        <span className="block text-xs text-muted-foreground">{opt.body}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)} disabled={invBusy}>Cancel</Button>
              <Button type="submit" disabled={invBusy || !invName.trim() || !invEmail.trim()}>
                {invBusy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Sending…</> : 'Send invitation'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}
        title="Revoke this invitation?"
        description={revokeTarget ? `${revokeTarget.name} (${revokeTarget.email}) won't be able to use the link they were sent. You can invite them again later.` : ''}
        confirmLabel={revoking ? 'Revoking…' : 'Revoke'}
        variant="destructive"
        onConfirm={handleRevoke}
      />
    </PageTransition>
  );
}
