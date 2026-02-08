import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCompanyList, type CompanyListRow } from '@/lib/admin';
import { Loading } from '@/components/Loading';
import { ErrorBanner } from '@/components/ErrorBanner';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function CompanyList() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<CompanyListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setCompanies(await fetchCompanyList()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h2 style={{ fontSize: '1.15rem', marginBottom: '16px' }}>Companies</h2>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {loading ? <Loading message="Loading companies…" /> : companies.length === 0 ? (
        <div style={emptyStyle}><p>No companies found.</p></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
          {companies.map((c) => (
            <div
              key={c.id}
              onClick={() => navigate(`companies/${c.id}`)}
              style={cardStyle}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#2563eb'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb'; }}
            >
              <strong style={{ fontSize: '0.95rem' }}>{c.name}</strong>
              <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>slug: {c.slug}</div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.8rem', color: '#6b7280' }}>
                <span>{c.building_count} building{c.building_count !== 1 ? 's' : ''}</span>
                <span>{c.user_count} user{c.user_count !== 1 ? 's' : ''}</span>
                <span>Created {formatDate(c.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const emptyStyle: React.CSSProperties = { textAlign: 'center', padding: '48px 24px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb', color: '#6b7280' };
const cardStyle: React.CSSProperties = { padding: '16px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', cursor: 'pointer', transition: 'border-color 0.15s' };
