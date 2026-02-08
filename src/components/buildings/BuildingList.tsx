import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchBuildingList, type BuildingListRow } from '@/lib/buildings';
import { useAuth } from '@/lib/auth';
import { Loading } from '@/components/Loading';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Building2, MapPin, Layers, Ticket, Search, Plus, Calendar } from 'lucide-react';

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
  const [search, setSearch] = useState('');

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

  const filtered = buildings.filter((b) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (b.name?.toLowerCase().includes(q)) ||
      b.address_line1.toLowerCase().includes(q) ||
      b.city.toLowerCase().includes(q) ||
      b.zip.includes(q)
    );
  });

  return (
    <div className="animate-in">
      <div className="page-title-bar">
        <div>
          <h2 className="page-title">Buildings</h2>
          <p className="page-subtitle">
            {buildings.length} building{buildings.length !== 1 ? 's' : ''} managed
          </p>
        </div>
        {showAddButton ? (
          <Link to="new" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            <Plus size={16} /> Add Building
          </Link>
        ) : role === 'proroto_admin' ? (
          <span className="text-xs text-muted" style={{ maxWidth: 200, textAlign: 'right' }}>
            To add a building, go to Companies → select a company.
          </span>
        ) : null}
      </div>

      {/* Search bar */}
      {buildings.length > 3 && (
        <div className="search-input-wrap" style={{ marginBottom: 20, maxWidth: 400 }}>
          <Search size={16} />
          <input
            type="text"
            className="form-input"
            placeholder="Search by address, city, ZIP…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <Loading message="Loading buildings…" />
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Building2 size={48} style={{ color: 'var(--slate-300)', marginBottom: 16 }} />
          <div className="empty-state-title">
            {search ? 'No buildings match your search' : 'No buildings found'}
          </div>
          <div className="empty-state-text">
            {search ? (
              'Try a different search term.'
            ) : showAddButton ? (
              'Add your first building to start managing spaces and tickets.'
            ) : (
              'Go to Companies → select a company → Add Building.'
            )}
          </div>
          {showAddButton && !search && (
            <Link to="new" className="btn btn-primary btn-sm mt-4" style={{ textDecoration: 'none' }}>
              <Plus size={14} /> Add Building
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-3">
          {filtered.map((b, i) => (
            <div
              key={b.id}
              className={`card card-interactive building-card animate-in animate-in-delay-${Math.min(i, 3)}`}
              onClick={() => navigate(b.id)}
            >
              <div className="card-body">
                <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--slate-900)', marginBottom: 2, lineHeight: 'var(--leading-tight)' }}>
                  {b.name || b.address_line1}
                </div>
                {b.name && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--slate-500)', marginBottom: 4 }}>
                    <MapPin size={12} />
                    {b.address_line1}
                  </div>
                )}
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--slate-400)', marginBottom: 12 }}>
                  {b.city}, {b.state} {b.zip}
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 'var(--text-xs)', color: 'var(--slate-500)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Layers size={13} style={{ opacity: 0.7 }} />
                    {b.space_count} space{b.space_count !== 1 ? 's' : ''}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Ticket size={13} style={{ opacity: 0.7 }} />
                    {b.ticket_count} ticket{b.ticket_count !== 1 ? 's' : ''}
                  </span>
                  <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--slate-400)' }}>
                    <Calendar size={11} />
                    {formatDate(b.created_at)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
