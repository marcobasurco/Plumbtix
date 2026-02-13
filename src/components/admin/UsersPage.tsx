import { useEffect, useState, useCallback, type FormEvent } from 'react';
import {
  fetchUserList,
  fetchInvitations,
  fetchCompanyOptions,
  type UserListRow,
  type InvitationRow,
  type CompanyOption,
} from '@/lib/admin';
import { sendInvitation, resendInvitation } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import { ROLE_LABELS, INVITATION_ROLES } from '@shared/types/enums';
import type { InvitationRole } from '@shared/types/enums';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useRealtime } from '@/hooks/useRealtime';
import { toast } from 'sonner';
import { Loader2, Mail, CheckCircle2, ChevronDown, Pencil, Send, Phone, X, Save, Trash2 } from 'lucide-react';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

function roleBadgeVariant(role: string): 'default' | 'secondary' | 'info' | 'warning' {
  if (role === 'proroto_admin') return 'info';
  if (role === 'pm_admin') return 'default';
  return 'secondary';
}

// ─── Phone helpers ───────────────────────────────────────────────────────────

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

function normalizePhoneInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (E164_REGEX.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return trimmed;
}

function formatPhone(e164: string | null): string {
  if (!e164) return '—';
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (m) return `(${m[1]}) ${m[2]}-${m[3]}`;
  return e164;
}

export function UsersPage() {
  const [users, setUsers] = useState<UserListRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [companyFilter, setCompanyFilter] = useState('');

  const [showInvite, setShowInvite] = useState(false);
  const [invCompany, setInvCompany] = useState('');
  const [invEmail, setInvEmail] = useState('');
  const [invName, setInvName] = useState('');
  const [invRole, setInvRole] = useState<InvitationRole>('pm_admin');
  const [invSubmitting, setInvSubmitting] = useState(false);
  const [invError, setInvError] = useState<string | null>(null);
  const [invSuccess, setInvSuccess] = useState<string | null>(null);

  // Edit/resend state for pending invitations
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editName, setEditName] = useState('');
  const [resending, setResending] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // User editing state (phone + SMS)
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editPhone, setEditPhone] = useState('');
  const [editSmsEnabled, setEditSmsEnabled] = useState(false);
  const [editPhoneError, setEditPhoneError] = useState('');
  const [savingUser, setSavingUser] = useState(false);

  // Confirmation dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmDesc, setConfirmDesc] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, i, c] = await Promise.all([
        fetchUserList(companyFilter || undefined),
        fetchInvitations(companyFilter || undefined),
        fetchCompanyOptions(),
      ]);
      setUsers(u); setInvitations(i); setCompanies(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  }, [companyFilter]);

  useEffect(() => { load(); }, [load]);
  useRealtime('users', load, { enabled: !loading });
  useRealtime('invitations', load, { enabled: !loading });

  // ─── User editing ────────────────────────────────────────────────────
  const startEditingUser = (u: UserListRow) => {
    setEditingUserId(u.id);
    setEditPhone(u.phone || '');
    setEditSmsEnabled(false); // We don't have this in UserListRow, default to current
    setEditPhoneError('');
    // Fetch current sms_notifications_enabled for this user
    supabase.from('users').select('sms_notifications_enabled').eq('id', u.id).single()
      .then(({ data }) => {
        if (data) setEditSmsEnabled(data.sms_notifications_enabled ?? false);
      });
  };

  const cancelEditingUser = () => {
    setEditingUserId(null);
    setEditPhone('');
    setEditSmsEnabled(false);
    setEditPhoneError('');
  };

  const validateEditPhone = (value: string): boolean => {
    if (!value.trim()) { setEditPhoneError(''); return true; }
    const normalized = normalizePhoneInput(value);
    if (!E164_REGEX.test(normalized)) {
      setEditPhoneError('Invalid format (e.g. (650) 555-1234)');
      return false;
    }
    setEditPhoneError('');
    return true;
  };

  const handleSaveUser = async () => {
    if (!editingUserId) return;
    const normalizedPhone = editPhone.trim() ? normalizePhoneInput(editPhone) : null;
    if (normalizedPhone && !E164_REGEX.test(normalizedPhone)) {
      setEditPhoneError('Invalid format (e.g. (650) 555-1234)');
      return;
    }
    const effectiveSms = normalizedPhone ? editSmsEnabled : false;

    setSavingUser(true);
    const { error: updateErr } = await supabase
      .from('users')
      .update({ phone: normalizedPhone, sms_notifications_enabled: effectiveSms })
      .eq('id', editingUserId);

    if (updateErr) {
      toast.error('Failed to update user', { description: updateErr.message });
    } else {
      toast.success('User updated');
      cancelEditingUser();
      load();
    }
    setSavingUser(false);
  };

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    // Show confirmation dialog before sending
    setConfirmTitle('Send Invitation');
    setConfirmDesc(`You are about to send 1 invitation email to:\n\n${invEmail.trim()}\n\nDo you want to proceed?`);
    setConfirmAction(() => async () => {
      setInvSubmitting(true); setInvError(null); setInvSuccess(null);
      const result = await sendInvitation({
        company_id: invCompany, email: invEmail.trim(),
        name: invName.trim(), role: invRole,
      });
      if (result.ok) {
        const inv = result.data.invitation;
        toast.success(`Invitation sent to ${inv.email}`);
        setInvSuccess(`Invitation sent to ${inv.email}.\nToken: ${inv.token}\nAccept URL: ${window.location.origin}/accept-invite?token=${inv.token}`);
        setInvEmail(''); setInvName(''); load();
      } else { setInvError(result.error.message); }
      setInvSubmitting(false);
    });
    setConfirmOpen(true);
  };

  const pendingInvitations = invitations.filter((i) => !i.accepted_at);
  const acceptedInvitations = invitations.filter((i) => i.accepted_at);

  const startEditing = (inv: InvitationRow) => {
    setEditingId(inv.id);
    setEditEmail(inv.email);
    setEditName(inv.name);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditEmail('');
    setEditName('');
  };

  const handleResend = async (inv: InvitationRow, newEmail?: string, newName?: string) => {
    const targetEmail = newEmail || inv.email;
    setConfirmTitle('Resend Invitation');
    setConfirmDesc(`You are about to resend 1 invitation email to:\n\n${targetEmail}\n\nDo you want to proceed?`);
    setConfirmAction(() => async () => {
      setResending(inv.id);
      const body: { invitation_id: string; email?: string; name?: string } = {
        invitation_id: inv.id,
      };
      if (newEmail && newEmail.trim().toLowerCase() !== inv.email.toLowerCase()) body.email = newEmail.trim();
      if (newName && newName.trim() !== inv.name) body.name = newName.trim();

      const result = await resendInvitation(body);
      if (result.ok) {
        toast.success(`Invitation resent to ${newEmail || inv.email}`);
        cancelEditing();
        load();
      } else {
        toast.error(result.error.message);
      }
      setResending(null);
    });
    setConfirmOpen(true);
  };

  const handleDeleteInvitation = (inv: InvitationRow) => {
    setConfirmTitle('Delete Invitation');
    setConfirmDesc(`Delete the invitation for ${inv.name} (${inv.email})?\n\nThis cannot be undone. You can send a new invitation afterwards.`);
    setConfirmAction(() => async () => {
      setDeleting(inv.id);
      const { error: delErr } = await supabase
        .from('invitations')
        .delete()
        .eq('id', inv.id);

      if (delErr) {
        toast.error('Failed to delete invitation', { description: delErr.message });
      } else {
        toast.success(`Invitation for ${inv.email} deleted`);
        load();
      }
      setDeleting(null);
    });
    setConfirmOpen(true);
  };

  return (
    <div>
      {/* Header + filter */}
      <div className="flex justify-between items-start flex-wrap gap-3 mb-4">
        <h2 className="text-lg font-bold tracking-tight">Users & Invitations</h2>
        <div className="flex gap-2 items-center flex-wrap">
          <select className="form-select" style={{ minWidth: 140 }}
            value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
            <option value="">All Companies</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button size="sm" variant={showInvite ? 'outline' : 'default'}
            onClick={() => setShowInvite(!showInvite)}>
            {showInvite ? 'Cancel' : '+ Invite'}
          </Button>
        </div>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* Invite form */}
      {showInvite && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="text-sm font-semibold mb-3">Send Invitation</div>
            <ErrorBanner message={invError} onDismiss={() => setInvError(null)} />
            {invSuccess && <div className="success-box mb-3 text-xs whitespace-pre-wrap">{invSuccess}</div>}
            <form onSubmit={handleInvite}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Company *</label>
                  <select className="form-select" value={invCompany}
                    onChange={(e) => setInvCompany(e.target.value)} required>
                    <option value="">Select…</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Full Name *</label>
                  <input className="form-input" type="text" value={invName}
                    onChange={(e) => setInvName(e.target.value)} required />
                </div>
                <div>
                  <label className="form-label">Email *</label>
                  <input className="form-input" type="email" value={invEmail}
                    onChange={(e) => setInvEmail(e.target.value)} required />
                </div>
                <div>
                  <label className="form-label">Role *</label>
                  <select className="form-select" value={invRole}
                    onChange={(e) => setInvRole(e.target.value as InvitationRole)}>
                    {INVITATION_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </div>
              </div>
              <Button type="submit" size="sm" className="mt-3"
                disabled={invSubmitting || !invCompany || !invEmail.trim() || !invName.trim()}>
                {invSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : 'Send Invitation'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : (
        <>
          {/* Registered Users */}
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="text-sm font-semibold mb-3 pb-2 border-b border-border">
                Registered Users ({users.length})
              </div>
              {users.length === 0 ? <p className="text-sm text-muted-foreground">No users found.</p> : (
                <>
                  {/* Mobile: cards */}
                  <div className="md:hidden space-y-2">
                    {users.map((u) => {
                      const isEditing = editingUserId === u.id;
                      return (
                        <div key={u.id} className="p-3 rounded-lg border border-border">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-semibold text-sm truncate">{u.full_name}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <Badge variant={roleBadgeVariant(u.role)} className="text-[10px]">{ROLE_LABELS[u.role]}</Badge>
                              {!isEditing && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditingUser(u)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {formatPhone(u.phone)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{u.company?.name ?? '—'}</span>
                          </div>
                          {isEditing && (
                            <div className="mt-3 pt-3 border-t border-border space-y-3">
                              <div>
                                <Label className="text-xs">Phone Number</Label>
                                <Input type="tel" placeholder="(650) 555-1234" value={editPhone}
                                  onChange={(e) => { setEditPhone(e.target.value); if (editPhoneError) validateEditPhone(e.target.value); }}
                                  onBlur={() => validateEditPhone(editPhone)}
                                  className={editPhoneError ? 'border-destructive mt-1' : 'mt-1'} />
                                {editPhoneError && <p className="text-xs text-destructive mt-1">{editPhoneError}</p>}
                              </div>
                              {(u.role === 'resident') && (
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs">SMS updates for tickets</Label>
                                  <Switch checked={editSmsEnabled} onCheckedChange={setEditSmsEnabled} disabled={!editPhone.trim()} />
                                </div>
                              )}
                              <div className="flex gap-2">
                                <Button size="sm" onClick={handleSaveUser} disabled={savingUser || !!editPhoneError} className="gap-1">
                                  {savingUser ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                                </Button>
                                <Button size="sm" variant="ghost" onClick={cancelEditingUser}><X className="h-3 w-3" /> Cancel</Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Desktop: table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm no-min-width">
                      <thead>
                        <tr className="border-b-2 border-border">
                          <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">Name</th>
                          <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">Email</th>
                          <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground uppercase">Phone</th>
                          <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground uppercase">Role</th>
                          <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground uppercase">Company</th>
                          <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground uppercase w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => {
                          const isEditing = editingUserId === u.id;
                          return isEditing ? (
                            <tr key={u.id} className="border-b border-border bg-muted/30">
                              <td colSpan={6} className="py-3 px-3">
                                <div className="flex items-center gap-2 mb-3">
                                  <span className="font-semibold">{u.full_name}</span>
                                  <Badge variant={roleBadgeVariant(u.role)} className="text-[11px]">{ROLE_LABELS[u.role]}</Badge>
                                  <span className="text-xs text-muted-foreground">{u.email}</span>
                                </div>
                                <div className="flex items-end gap-4 flex-wrap">
                                  <div className="w-56">
                                    <Label className="text-xs">Phone Number</Label>
                                    <Input type="tel" placeholder="(650) 555-1234" value={editPhone}
                                      onChange={(e) => { setEditPhone(e.target.value); if (editPhoneError) validateEditPhone(e.target.value); }}
                                      onBlur={() => validateEditPhone(editPhone)}
                                      className={`mt-1 h-8 text-sm ${editPhoneError ? 'border-destructive' : ''}`} />
                                    {editPhoneError && <p className="text-xs text-destructive mt-1">{editPhoneError}</p>}
                                  </div>
                                  {u.role === 'resident' && (
                                    <div className="flex items-center gap-2 pb-1">
                                      <Switch checked={editSmsEnabled} onCheckedChange={setEditSmsEnabled}
                                        disabled={!editPhone.trim()} id={`sms-${u.id}`} />
                                      <Label htmlFor={`sms-${u.id}`} className="text-xs">SMS ticket updates</Label>
                                    </div>
                                  )}
                                  {(u.role === 'pm_admin' || u.role === 'pm_user' || u.role === 'proroto_admin') && editPhone.trim() && (
                                    <p className="text-xs text-muted-foreground pb-2">Emergency SMS auto-enabled</p>
                                  )}
                                  <div className="flex gap-2 pb-1">
                                    <Button size="sm" onClick={handleSaveUser} disabled={savingUser || !!editPhoneError} className="gap-1 h-8">
                                      {savingUser ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={cancelEditingUser} className="h-8">Cancel</Button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr key={u.id} className="border-b border-border">
                              <td className="py-2.5 px-3 font-semibold">{u.full_name}</td>
                              <td className="py-2.5 px-3">{u.email}</td>
                              <td className="py-2.5 px-2 text-muted-foreground">{formatPhone(u.phone)}</td>
                              <td className="py-2.5 px-2"><Badge variant={roleBadgeVariant(u.role)} className="text-[11px]">{ROLE_LABELS[u.role]}</Badge></td>
                              <td className="py-2.5 px-2 text-muted-foreground">{u.company?.name ?? '—'}</td>
                              <td className="py-2.5 px-2">
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit user"
                                  onClick={() => startEditingUser(u)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Pending Invitations */}
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="text-sm font-semibold mb-3 pb-2 border-b border-border flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Pending Invitations ({pendingInvitations.length})
              </div>
              {pendingInvitations.length === 0 ? <p className="text-sm text-muted-foreground">No pending invitations.</p> : (
                <div className="space-y-2">
                  {pendingInvitations.map((inv) => {
                    const expired = isExpired(inv.expires_at);
                    const isEditing = editingId === inv.id;
                    const isResending = resending === inv.id;

                    return (
                      <div key={inv.id} className="p-3 rounded-lg border border-border">
                        {isEditing ? (
                          /* ── Edit mode ── */
                          <div className="space-y-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="form-label text-xs">Name</label>
                                <input className="form-input" value={editName}
                                  onChange={(e) => setEditName(e.target.value)} />
                              </div>
                              <div>
                                <label className="form-label text-xs">Email</label>
                                <input className="form-input" type="email" value={editEmail}
                                  onChange={(e) => setEditEmail(e.target.value)} />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" disabled={isResending || !editEmail.trim() || !editName.trim()}
                                onClick={() => handleResend(inv, editEmail, editName)}>
                                {isResending ? <><Loader2 className="h-3 w-3 animate-spin" /> Sending…</> : <><Send className="h-3 w-3" /> Save & Resend</>}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={cancelEditing}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          /* ── Display mode ── */
                          <>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                  <span className="font-semibold text-sm">{inv.name}</span>
                                  <Badge variant={expired ? 'destructive' : 'success'} className="text-[10px]">
                                    {expired ? 'Expired' : 'Active'}
                                  </Badge>
                                  <Badge variant="secondary" className="text-[10px]">{ROLE_LABELS[inv.role as keyof typeof ROLE_LABELS] ?? inv.role}</Badge>
                                </div>
                                <div className="text-xs text-muted-foreground">{inv.email}</div>
                                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                                  <span>{inv.company?.name ?? '—'}</span>
                                  <span>Sent {formatDate(inv.created_at)}</span>
                                </div>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                  title="Edit & Resend"
                                  onClick={() => startEditing(inv)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                  title="Resend Invite"
                                  disabled={isResending}
                                  onClick={() => handleResend(inv)}>
                                  {isResending
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Send className="h-3.5 w-3.5" />}
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                                  title="Delete Invitation"
                                  disabled={deleting === inv.id}
                                  onClick={() => handleDeleteInvitation(inv)}>
                                  {deleting === inv.id
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Trash2 className="h-3.5 w-3.5" />}
                                </Button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Accepted (collapsed) */}
          {acceptedInvitations.length > 0 && (
            <details>
              <summary className="text-sm text-muted-foreground cursor-pointer flex items-center gap-1 mb-2">
                <ChevronDown className="h-3.5 w-3.5" /> Accepted invitations ({acceptedInvitations.length})
              </summary>
              <Card>
                <CardContent className="p-4">
                  <div className="md:hidden space-y-2">
                    {acceptedInvitations.map((inv) => (
                      <div key={inv.id} className="p-3 rounded-lg border border-border">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm truncate">{inv.name}</span>
                          <Badge variant="success" className="text-[10px] shrink-0"><CheckCircle2 className="h-3 w-3" /> Accepted</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">{inv.email}</div>
                        <div className="flex justify-between items-center mt-1.5">
                          <span className="text-xs text-muted-foreground">{inv.company?.name ?? '—'}</span>
                          <span className="text-[10px] text-muted-foreground">{formatDate(inv.accepted_at!)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm no-min-width">
                      <thead>
                        <tr className="border-b-2 border-border">
                          <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">Name</th>
                          <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">Email</th>
                          <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground uppercase">Company</th>
                          <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground uppercase">Accepted</th>
                        </tr>
                      </thead>
                      <tbody>
                        {acceptedInvitations.map((inv) => (
                          <tr key={inv.id} className="border-b border-border">
                            <td className="py-2.5 px-3">{inv.name}</td>
                            <td className="py-2.5 px-3">{inv.email}</td>
                            <td className="py-2.5 px-2 text-muted-foreground">{inv.company?.name ?? '—'}</td>
                            <td className="py-2.5 px-2 text-xs text-muted-foreground">{formatDate(inv.accepted_at!)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </details>
          )}
        </>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setConfirmAction(null);
        }}
        title={confirmTitle}
        description={confirmDesc}
        confirmLabel={confirmTitle.includes('Delete') ? 'Delete' : 'Send'}
        variant={confirmTitle.includes('Delete') ? 'destructive' : 'default'}
        onConfirm={() => {
          setConfirmOpen(false);
          if (confirmAction) confirmAction();
        }}
      />
    </div>
  );
}
