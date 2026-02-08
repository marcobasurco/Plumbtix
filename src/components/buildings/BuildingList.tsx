import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchBuildingList, type BuildingListRow } from '@/lib/buildings';
import { useAuth } from '@/lib/auth';
import { Loading } from '@/components/Loading';
import { ErrorBanner } from '@/components/ErrorBanner';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function BuildingList() {
  const navigate = useNavigate();
  const { role } = useAuth();

  // PM Admin creates buildings from this page (auto-scoped to their company).
  // Pro Roto Admin creates from Companies → Company Detail → Add Building.
  const showAddButton = role === 'pm_admin';

  const [buildings, setBuildings] = useState<BuildingListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBuildings(await fetchBuildingList());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load buildings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Buildings</h2>
        {showAddButton ? (
          <Link
            to="new"
            className="btn btn-primary"
            style={{ width: 'auto', padding: '8px 20px', fontSize: '0.9rem', textDecoration: 'none' }}
          >
            + Add Building
          </Link>
        ) : role === 'proroto_admin' ? (
          <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
            To add a building, go to Companies → select a company.
          </span>
        ) : null}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <Loading message="Loading buildings…" />
      ) : buildings.length === 0 ? (
        <div style={emptyStyle}>
          <p>No buildings found.</p>
          {showAddButton ? (
            <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
              Add your first building to start managing spaces and tickets.
            </p>
          ) : (
            <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
              Go to Companies → select a company → Add Building.
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
          {buildings.map((b) => (
            <div
              key={b.id}
              onClick={() => navigate(b.id)}
              style={cardStyle}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#2563eb'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb'; }}
            >
              <strong style={{ fontSize: '0.95rem' }}>{b.name || b.address_line1}</strong>
              {b.name && <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>{b.address_line1}</div>}
              <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>{b.city}, {b.state} {b.zip}</div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.8rem', color: '#9ca3af' }}>
                <span>{b.space_count} space{b.space_count !== 1 ? 's' : ''}</span>
                <span>{b.ticket_count} ticket{b.ticket_count !== 1 ? 's' : ''}</span>
                <span>Added {formatDate(b.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const emptyStyle: React.CSSProperties = {
  textAlign: 'center', padding: '48px 24px', background: '#f9fafb',
  borderRadius: '8px', border: '1px solid #e5e7eb', color: '#6b7280',
};
const cardStyle: React.CSSProperties = {
  padding: '16px', background: '#fff', borderRadius: '8px',
  border: '1px solid #e5e7eb', cursor: 'pointer',
  transition: 'border-color 0.15s',
};
