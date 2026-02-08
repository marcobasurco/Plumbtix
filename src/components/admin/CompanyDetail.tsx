import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchCompanyDetail,
  updateCompany,
  fetchCompanyBuildings,
  fetchUserList,
  type CompanyDetailRow,
  type CompanyBuildingRow,
  type UserListRow,
} from '@/lib/admin';
import { ROLE_LABELS } from '@shared/types/enums';
import { Loading } from '@/components/Loading';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ChevronLeft, Plus, Pencil } from 'lucide-react';
import { useToast } from '@/components/Toast';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ROLE_BADGE: Record<string, string> = {
  proroto_admin: 'badge-blue', pm_admin: 'badge-amber', pm_user: 'badge-amber', resident: 'badge-green',
};

// Icons from lucide-react

export function CompanyDetail() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [company, setCompany] = useState<CompanyDetailRow | null>(null);
  const [buildings, setBuildings] = useState<CompanyBuildingRow[]>([]);
  const [users, setUsers] = useState<UserListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true); setError(null);
    try {
      const [c, b, u] = await Promise.all([
        fetchCompanyDetail(companyId),
        fetchCompanyBuildings(companyId),
        fetchUserList(companyId),
      ]);
      setCompany(c); setBuildings(b); setUsers(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const startEdit = () => {
    if (!company) return;
    setEditName(company.name); setEditSlug(company.slug); setEditError(null); setEditing(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setEditError(null);
    const trimName = editName.trim(), trimSlug = editSlug.trim();
    if (!trimName) { setEditError('Name is required'); return; }
    if (!trimSlug || !SLUG_REGEX.test(trimSlug)) { setEditError('Slug must be lowercase letters, numbers, and hyphens'); return; }
    setSaving(true);
    try {
      const updated = await updateCompany(company.id, { name: trimName, slug: trimSlug });
      setCompany(updated); setEditing(false);
      toast('Company updated');
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save');
    } finally { setSaving(false); }
  };

  if (loading) return <Loading message="Loading company…" />;
  if (error && !company) return <ErrorBanner message={error} />;
  if (!company) return <ErrorBanner message="Company not found" />;

  return (
    <div className="animate-in">
      <button type="button" className="back-link" onClick={() => navigate('..')}>
        <ChevronLeft size={14} />
        Companies
      </button>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <h2 className="page-title">{company.name}</h2>
          <p className="page-subtitle">
            <span className="tag text-mono">{company.slug}</span>
            <span style={{ margin: '0 8px', color: 'var(--slate-300)' }}>·</span>
            Created {formatDate(company.created_at)}
          </p>
        </div>
        {!editing && (
          <button onClick={startEdit} className="btn btn-secondary btn-sm"><Pencil size={14} /> Edit</button>
        )}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {editing && (
        <div className="form-card animate-in" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--slate-700)', marginBottom: 16 }}>Edit Company</div>
          <ErrorBanner message={editError} onDismiss={() => setEditError(null)} />
          <form onSubmit={handleSave}>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Company Name *</label>
                <input type="text" className="form-input" value={editName} onChange={(e) => setEditName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Slug *</label>
                <input type="text" className="form-input" value={editSlug} onChange={(e) => setEditSlug(e.target.value)} required />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving} className="btn btn-primary btn-sm">{saving ? 'Saving…' : 'Save'}</button>
              <button type="button" onClick={() => setEditing(false)} className="btn btn-secondary btn-sm">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Buildings</div>
          <div className="stat-value">{buildings.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Users</div>
          <div className="stat-value">{users.length}</div>
        </div>
      </div>

      {/* Buildings */}
      <div className="section">
        <div className="section-header">
          <div>
            <div className="section-title">Buildings ({buildings.length})</div>
          </div>
          <button onClick={() => navigate(`/admin/companies/${companyId}/buildings/new`)} className="btn btn-primary btn-sm">
            <Plus size={14} /> Add Building
          </button>
        </div>
        {buildings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No buildings</div>
            <div className="empty-state-text">Add your first building to this company.</div>
            <button onClick={() => navigate(`/admin/companies/${companyId}/buildings/new`)} className="btn btn-primary btn-sm mt-4">
              <Plus size={14} /> Add Building
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Building</th><th>Location</th></tr></thead>
              <tbody>
                {buildings.map((b) => (
                  <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/buildings/${b.id}`)}>
                    <td style={{ fontWeight: 600 }}>{b.name || b.address_line1}</td>
                    <td className="text-muted">{b.city}, {b.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Users */}
      <div className="section">
        <div className="section-header">
          <div className="section-title">Users ({users.length})</div>
        </div>
        {users.length === 0 ? (
          <p className="text-muted text-sm">No users.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.full_name}</td>
                    <td className="text-muted">{u.email}</td>
                    <td><span className={`badge ${ROLE_BADGE[u.role] ?? 'badge-slate'}`}>{ROLE_LABELS[u.role]}</span></td>
                    <td className="text-muted">{formatDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
