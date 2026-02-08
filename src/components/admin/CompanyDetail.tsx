import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchCompanyDetail,
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

export function CompanyDetail() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();

  const [company, setCompany] = useState<CompanyDetailRow | null>(null);
  const [buildings, setBuildings] = useState<CompanyBuildingRow[]>([]);
  const [users, setUsers] = useState<UserListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* Buildings */}
      <section style={cardStyle}>
        <h3 style={sectionTitle}>Buildings ({buildings.length})</h3>
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
const headerStyle: React.CSSProperties = { marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #e5e7eb' };
const cardStyle: React.CSSProperties = { padding: '16px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' };
const sectionTitle: React.CSSProperties = { fontSize: '1rem', fontWeight: 600, marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #e5e7eb' };
const muted: React.CSSProperties = { color: '#9ca3af', fontSize: '0.85rem' };
const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f9fafb', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '6px 12px', borderBottom: '2px solid #e5e7eb', fontSize: '0.8rem', fontWeight: 600, color: '#6b7280' };
const tdStyle: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' };
