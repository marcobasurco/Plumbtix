import { useEffect, useState, useCallback, type FormEvent } from 'react';
import {
  fetchUserList,
  fetchInvitations,
  fetchCompanyOptions,
  type UserListRow,
  type InvitationRow,
  type CompanyOption,
} from '@/lib/admin';
import { sendInvitation } from '@/lib/api';
import { ROLE_LABELS, INVITATION_ROLES } from '@shared/types/enums';
import type { InvitationRole } from '@shared/types/enums';
import { Loading } from '@/components/Loading';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

export function UsersPage() {
  const [users, setUsers] = useState<UserListRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [companyFilter, setCompanyFilter] = useState('');

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [invCompany, setInvCompany] = useState('');
  const [invEmail, setInvEmail] = useState('');
  const [invName, setInvName] = useState('');
  const [invRole, setInvRole] = useState<InvitationRole>('pm_admin');
  const [invSubmitting, setInvSubmitting] = useState(false);
  const [invError, setInvError] = useState<string | null>(null);
  const [invSuccess, setInvSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, i, c] = await Promise.all([
        fetchUserList(companyFilter || undefined),
        fetchInvitations(companyFilter || undefined),
        fetchCompanyOptions(),
      ]);
      setUsers(u);
      setInvitations(i);
      setCompanies(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [companyFilter]);

  useEffect(() => { load(); }, [load]);

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    setInvSubmitting(true);
    setInvError(null);
    setInvSuccess(null);

    const result = await sendInvitation({
      company_id: invCompany,
      email: invEmail.trim(),
      name: invName.trim(),
      role: invRole,
    });

    if (result.ok) {
      const inv = result.data.invitation;
      setInvSuccess(
        `Invitation sent to ${inv.email}. Token: ${inv.token}\n` +
        `Accept URL: ${window.location.origin}/accept-invite?token=${inv.token}`
      );
      setInvEmail('');
      setInvName('');
      load(); // Refresh lists
    } else {
      setInvError(result.error.message);
    }
    setInvSubmitting(false);
  };

  const pendingInvitations = invitations.filter((i) => !i.accepted_at);
  const acceptedInvitations = invitations.filter((i) => i.accepted_at);

  return (
    <div>
      {/* Header + filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Users & Invitations</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="">All Companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <Button
            size="sm"
            variant={showInvite ? 'outline' : 'default'}
            onClick={() => setShowInvite(!showInvite)}
          >
            {showInvite ? 'Cancel' : '+ Invite User'}
          </Button>
        </div>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* Invite form */}
      {showInvite && (
        <div style={formCard}>
          <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>Send Invitation</h3>
          <ErrorBanner message={invError} onDismiss={() => setInvError(null)} />
          {invSuccess && (
            <div className="success-box" style={{ marginBottom: '12px', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
              {invSuccess}
            </div>
          )}
          <form onSubmit={handleInvite}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Company *</label>
                <select value={invCompany} onChange={(e) => setInvCompany(e.target.value)} required style={inputStyle}>
                  <option value="">Select…</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Full Name *</label>
                <input type="text" value={invName} onChange={(e) => setInvName(e.target.value)} required style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Email *</label>
                <input type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} required style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Role *</label>
                <select value={invRole} onChange={(e) => setInvRole(e.target.value as InvitationRole)} style={inputStyle}>
                  {INVITATION_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
            </div>
            <Button
              type="submit"
              size="sm"
              className="mt-3"
              disabled={invSubmitting || !invCompany || !invEmail.trim() || !invName.trim()}
            >
              {invSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : 'Send Invitation'}
            </Button>
          </form>
        </div>
      )}

      {loading ? <Loading message="Loading…" /> : (
        <>
          {/* Users table */}
          <section style={cardStyle}>
            <h3 style={sectionTitle}>Registered Users ({users.length})</h3>
            {users.length === 0 ? <p style={muted}>No users found.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Email</th>
                      <th style={thStyle}>Role</th>
                      <th style={thStyle}>Company</th>
                      <th style={thStyle}>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td style={tdStyle}><strong>{u.full_name}</strong></td>
                        <td style={tdStyle}>{u.email}</td>
                        <td style={tdStyle}>
                          <span style={{ ...roleBadge, background: u.role === 'proroto_admin' ? '#dbeafe' : '#f3f4f6' }}>
                            {ROLE_LABELS[u.role]}
                          </span>
                        </td>
                        <td style={tdStyle}>{u.company?.name ?? '—'}</td>
                        <td style={tdStyle}><span style={{ color: '#6b7280', fontSize: '0.85rem' }}>{formatDate(u.created_at)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Pending invitations */}
          <section style={{ ...cardStyle, marginTop: '16px' }}>
            <h3 style={sectionTitle}>Pending Invitations ({pendingInvitations.length})</h3>
            {pendingInvitations.length === 0 ? <p style={muted}>No pending invitations.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Email</th>
                      <th style={thStyle}>Role</th>
                      <th style={thStyle}>Company</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Sent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingInvitations.map((inv) => (
                      <tr key={inv.id}>
                        <td style={tdStyle}>{inv.name}</td>
                        <td style={tdStyle}>{inv.email}</td>
                        <td style={tdStyle}><span style={roleBadge}>{ROLE_LABELS[inv.role as keyof typeof ROLE_LABELS] ?? inv.role}</span></td>
                        <td style={tdStyle}>{inv.company?.name ?? '—'}</td>
                        <td style={tdStyle}>
                          {isExpired(inv.expires_at)
                            ? <span style={{ color: '#991b1b', fontSize: '0.8rem' }}>Expired</span>
                            : <span style={{ color: '#065f46', fontSize: '0.8rem' }}>Active</span>
                          }
                        </td>
                        <td style={tdStyle}><span style={{ color: '#6b7280', fontSize: '0.85rem' }}>{formatDate(inv.created_at)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Accepted invitations (collapsed) */}
          {acceptedInvitations.length > 0 && (
            <details style={{ marginTop: '16px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: '#6b7280' }}>
                Accepted invitations ({acceptedInvitations.length})
              </summary>
              <div style={{ ...cardStyle, marginTop: '8px' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Email</th>
                      <th style={thStyle}>Company</th>
                      <th style={thStyle}>Accepted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acceptedInvitations.map((inv) => (
                      <tr key={inv.id}>
                        <td style={tdStyle}>{inv.name}</td>
                        <td style={tdStyle}>{inv.email}</td>
                        <td style={tdStyle}>{inv.company?.name ?? '—'}</td>
                        <td style={tdStyle}><span style={{ color: '#6b7280', fontSize: '0.85rem' }}>{formatDate(inv.accepted_at!)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

// Styles
const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem', background: '#fff' };
const formCard: React.CSSProperties = { padding: '16px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '16px' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '4px' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem' };
const cardStyle: React.CSSProperties = { padding: '16px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' };
const sectionTitle: React.CSSProperties = { fontSize: '1rem', fontWeight: 600, marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #e5e7eb' };
const muted: React.CSSProperties = { color: '#9ca3af', fontSize: '0.85rem' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '6px 12px', borderBottom: '2px solid #e5e7eb', fontSize: '0.8rem', fontWeight: 600, color: '#6b7280' };
const tdStyle: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' };
const roleBadge: React.CSSProperties = { fontSize: '0.8rem', padding: '2px 8px', borderRadius: '10px', background: '#f3f4f6' };
