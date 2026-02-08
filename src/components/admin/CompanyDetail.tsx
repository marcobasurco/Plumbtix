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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function CompanyDetail() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();

  const [company, setCompany] = useState<CompanyDetailRow | null>(null);
  const [buildings, setBuildings] = useState<CompanyBuildingRow[]>([]);
  const [users, setUsers] = useState<UserListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [c, b, u] = await Promise.all([
        fetchCompanyDetail(companyId),
        fetchCompanyBuildings(companyId),
        fetchUserList(companyId),
      ]);
      setCompany(c);
      setBuildings(b);
      setUsers(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const startEdit = () => {
    if (!company) return;
    setEditName(company.name);
    setEditSlug(company.slug);
    setEditError(null);
    setEditing(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setEditError(null);

    const trimName = editName.trim();
    const trimSlug = editSlug.trim();
    if (!trimName) { setEditError('Name is required'); return; }
    if (!trimSlug || !SLUG_REGEX.test(trimSlug)) {
      setEditError('Slug must be lowercase letters, numbers, and hyphens only');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateCompany(company.id, { name: trimName, slug: trimSlug });
      setCompany(updated);
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading message="Loading company…" />;
  if (error && !company) return <ErrorBanner message={error} />;
  if (!company) return <ErrorBanner message="Company not found" />;

  return (
    <div>
      <button type="button" onClick={() => navigate('..')} style={backLink}>← Back to companies</button>

      <div style={headerStyle}>
        <div>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>{company.name}</h2>
          <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>slug: {company.slug} · Created {formatDate(company.created_at)}</p>
        </div>
        {!editing && (
          <button onClick={startEdit} style={editBtnStyle}>Edit</button>
        )}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {editing && (
        <form onSubmit={handleSave} style={formStyle}>
          <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Edit Company</h3>
          <ErrorBanner message={editError} onDismiss={() => setEditError(null)} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Company Name *</label>
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Slug *</label>
              <input type="text" value={editSlug} onChange={(e) => setEditSlug(e.target.value)} required style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" disabled={saving} className="btn btn-primary" style={{ width: 'auto', padding: '6px 20px', fontSize: '0.85rem' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setEditing(false)} style={cancelBtn}>Cancel</button>
          </div>
        </form>
      )}

      {/* Buildings */}
      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #e5e7eb' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Buildings ({buildings.length})</h3>
          <button
            onClick={() => navigate(`/admin/companies/${companyId}/buildings/new`)}
            className="btn btn-primary"
            style={{ width: 'auto', padding: '6px 16px', fontSize: '0.85rem' }}
          >
            + Add Building
          </button>
        </div>
        {buildings.length === 0 ? (
          <p style={muted}>No buildings.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {buildings.map((b) => (
              <div key={b.id} style={rowStyle} onClick={() => navigate(`/admin/buildings/${b.id}`)}>
                <strong>{b.name || b.address_line1}</strong>
                <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>{b.city}, {b.state}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Users */}
      <section style={{ ...cardStyle, marginTop: '16px' }}>
        <h3 style={sectionTitle}>Users ({users.length})</h3>
        {users.length === 0 ? (
          <p style={muted}>No users.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={tdStyle}><strong>{u.full_name}</strong></td>
                  <td style={tdStyle}>{u.email}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: '0.8rem', padding: '2px 8px', borderRadius: '10px', background: '#f3f4f6' }}>
                      {ROLE_LABELS[u.role]}
                    </span>
                  </td>
                  <td style={tdStyle}><span style={{ color: '#6b7280', fontSize: '0.85rem' }}>{formatDate(u.created_at)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const backLink: React.CSSProperties = { background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.85rem', padding: 0, marginBottom: '16px' };
const headerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #e5e7eb' };
const editBtnStyle: React.CSSProperties = { padding: '4px 12px', fontSize: '0.85rem', fontWeight: 500, background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' };
const cancelBtn: React.CSSProperties = { padding: '6px 16px', fontSize: '0.85rem', background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' };
const formStyle: React.CSSProperties = { padding: '16px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '16px' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' };
const cardStyle: React.CSSProperties = { padding: '16px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' };
const sectionTitle: React.CSSProperties = { fontSize: '1rem', fontWeight: 600, marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #e5e7eb' };
const muted: React.CSSProperties = { color: '#9ca3af', fontSize: '0.85rem' };
const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f9fafb', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '6px 12px', borderBottom: '2px solid #e5e7eb', fontSize: '0.8rem', fontWeight: 600, color: '#6b7280' };
const tdStyle: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' };
