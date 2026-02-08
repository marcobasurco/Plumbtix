import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchBuildingDetail,
  deleteBuilding,
  fetchSpaces,
  deleteSpace,
  type BuildingDetailRow,
  type SpaceRow,
} from '@/lib/buildings';
import { COMMON_AREA_LABELS } from '@shared/types/enums';
import { useAuth } from '@/lib/auth';
import { SpaceForm } from './SpaceForm';
import { Loading } from '@/components/Loading';
import { ErrorBanner } from '@/components/ErrorBanner';

export function BuildingDetail() {
  const { buildingId } = useParams<{ buildingId: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const canWrite = role === 'proroto_admin' || role === 'pm_admin';

  const [building, setBuilding] = useState<BuildingDetailRow | null>(null);
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletingSpace, setDeletingSpace] = useState<string | null>(null);

  // Space form state
  const [showSpaceForm, setShowSpaceForm] = useState(false);
  const [editingSpace, setEditingSpace] = useState<SpaceRow | null>(null);

  const load = useCallback(async () => {
    if (!buildingId) return;
    setLoading(true);
    setError(null);
    try {
      const [b, s] = await Promise.all([
        fetchBuildingDetail(buildingId),
        fetchSpaces(buildingId),
      ]);
      setBuilding(b);
      setSpaces(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load building');
    } finally {
      setLoading(false);
    }
  }, [buildingId]);

  useEffect(() => { load(); }, [load]);

  const handleDeleteBuilding = async () => {
    if (!building) return;
    if (spaces.length > 0) {
      setError('Cannot delete building with existing spaces. Remove all spaces first.');
      return;
    }
    if (!confirm(`Delete building "${building.name || building.address_line1}"? This cannot be undone.`)) return;

    setDeleting(true);
    try {
      await deleteBuilding(building.id);
      navigate('..', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete building');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSpace = async (space: SpaceRow) => {
    const label = space.space_type === 'unit'
      ? `Unit ${space.unit_number}`
      : COMMON_AREA_LABELS[space.common_area_type as keyof typeof COMMON_AREA_LABELS] ?? space.common_area_type;
    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;

    setDeletingSpace(space.id);
    setError(null);
    try {
      await deleteSpace(space.id);
      setSpaces((prev) => prev.filter((s) => s.id !== space.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete space');
    } finally {
      setDeletingSpace(null);
    }
  };

  const handleSpaceSaved = () => {
    setShowSpaceForm(false);
    setEditingSpace(null);
    load(); // reload spaces
  };

  if (loading) return <Loading message="Loading building…" />;
  if (error && !building) return <ErrorBanner message={error} />;
  if (!building) return <ErrorBanner message="Building not found" />;

  const units = spaces.filter((s) => s.space_type === 'unit');
  const commonAreas = spaces.filter((s) => s.space_type === 'common_area');

  return (
    <div>
      <button type="button" onClick={() => navigate('..')} style={backLink}>← Back to buildings</button>

      {/* Building header */}
      <div style={headerStyle}>
        <div>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>
            {building.name || building.address_line1}
          </h2>
          <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '2px' }}>
            {building.address_line1}
            {building.address_line2 && `, ${building.address_line2}`}
            {' — '}{building.city}, {building.state} {building.zip}
          </p>
        </div>
        {canWrite && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => navigate('edit')} style={editBtn}>Edit</button>
            <button onClick={handleDeleteBuilding} disabled={deleting} style={deleteBtn}>
              {deleting ? '…' : 'Delete'}
            </button>
          </div>
        )}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* Building details */}
      <section style={cardStyle}>
        <h3 style={sectionTitle}>Building Details</h3>
        <dl style={dlStyle}>
          {building.gate_code && <><dt>Gate Code</dt><dd>{building.gate_code}</dd></>}
          {building.water_shutoff_location && <><dt>Water Shutoff</dt><dd>{building.water_shutoff_location}</dd></>}
          {building.gas_shutoff_location && <><dt>Gas Shutoff</dt><dd>{building.gas_shutoff_location}</dd></>}
          {building.onsite_contact_name && <><dt>Onsite Contact</dt><dd>{building.onsite_contact_name}{building.onsite_contact_phone && ` — ${building.onsite_contact_phone}`}</dd></>}
          {building.access_notes && <><dt>Access Notes</dt><dd>{building.access_notes}</dd></>}
          {!building.gate_code && !building.water_shutoff_location && !building.gas_shutoff_location && !building.onsite_contact_name && !building.access_notes && (
            <><dt></dt><dd style={{ color: '#9ca3af' }}>No site details recorded.</dd></>
          )}
        </dl>
      </section>

      {/* Spaces */}
      <section style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
            Spaces ({spaces.length})
          </h3>
          {canWrite && !showSpaceForm && (
            <button
              onClick={() => { setEditingSpace(null); setShowSpaceForm(true); }}
              className="btn btn-primary"
              style={{ width: 'auto', padding: '6px 16px', fontSize: '0.85rem' }}
            >
              + Add Space
            </button>
          )}
        </div>

        {/* Inline space form */}
        {showSpaceForm && (
          <SpaceForm
            buildingId={building.id}
            editSpace={editingSpace}
            onSaved={handleSpaceSaved}
            onCancel={() => { setShowSpaceForm(false); setEditingSpace(null); }}
          />
        )}

        {/* Units */}
        {units.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <h4 style={subHeading}>Units ({units.length})</h4>
            <div style={tableWrapper}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Unit #</th>
                    <th style={thStyle}>Floor</th>
                    <th style={thStyle}>Beds</th>
                    <th style={thStyle}>Baths</th>
                    {canWrite && <th style={thStyle}></th>}
                  </tr>
                </thead>
                <tbody>
                  {units.map((s) => (
                    <tr key={s.id}>
                      <td style={tdStyle}><strong>{s.unit_number}</strong></td>
                      <td style={tdStyle}>{s.floor ?? '—'}</td>
                      <td style={tdStyle}>{s.bedrooms ?? '—'}</td>
                      <td style={tdStyle}>{s.bathrooms ?? '—'}</td>
                      {canWrite && (
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <button onClick={() => { setEditingSpace(s); setShowSpaceForm(true); }} style={linkBtn}>Edit</button>
                          <button onClick={() => handleDeleteSpace(s)} disabled={deletingSpace === s.id} style={{ ...linkBtn, color: '#dc2626' }}>
                            {deletingSpace === s.id ? '…' : 'Delete'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Common areas */}
        {commonAreas.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <h4 style={subHeading}>Common Areas ({commonAreas.length})</h4>
            <div style={tableWrapper}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Floor</th>
                    {canWrite && <th style={thStyle}></th>}
                  </tr>
                </thead>
                <tbody>
                  {commonAreas.map((s) => (
                    <tr key={s.id}>
                      <td style={tdStyle}>
                        <strong>
                          {COMMON_AREA_LABELS[s.common_area_type as keyof typeof COMMON_AREA_LABELS] ?? s.common_area_type}
                        </strong>
                      </td>
                      <td style={tdStyle}>{s.floor ?? '—'}</td>
                      {canWrite && (
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <button onClick={() => { setEditingSpace(s); setShowSpaceForm(true); }} style={linkBtn}>Edit</button>
                          <button onClick={() => handleDeleteSpace(s)} disabled={deletingSpace === s.id} style={{ ...linkBtn, color: '#dc2626' }}>
                            {deletingSpace === s.id ? '…' : 'Delete'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {spaces.length === 0 && !showSpaceForm && (
          <div style={{ textAlign: 'center', padding: '32px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb', color: '#9ca3af', fontSize: '0.85rem' }}>
            No spaces yet. {canWrite && 'Click "+ Add Space" to create units or common areas.'}
          </div>
        )}
      </section>
    </div>
  );
}

// Styles
const backLink: React.CSSProperties = {
  background: 'none', border: 'none', color: '#2563eb',
  cursor: 'pointer', fontSize: '0.85rem', padding: 0, marginBottom: '16px',
};
const headerStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  flexWrap: 'wrap', gap: '12px', marginBottom: '24px',
  paddingBottom: '16px', borderBottom: '1px solid #e5e7eb',
};
const cardStyle: React.CSSProperties = {
  padding: '16px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb',
};
const sectionTitle: React.CSSProperties = {
  fontSize: '1rem', fontWeight: 600, marginBottom: '12px',
  paddingBottom: '8px', borderBottom: '1px solid #e5e7eb',
};
const dlStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'auto 1fr',
  gap: '6px 16px', fontSize: '0.9rem', margin: 0,
};
const subHeading: React.CSSProperties = {
  fontSize: '0.85rem', fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.025em', marginBottom: '8px',
};
const tableWrapper: React.CSSProperties = { overflowX: 'auto' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' };
const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '6px 12px', borderBottom: '2px solid #e5e7eb',
  fontSize: '0.8rem', fontWeight: 600, color: '#6b7280',
};
const tdStyle: React.CSSProperties = {
  padding: '8px 12px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle',
};
const editBtn: React.CSSProperties = {
  padding: '4px 12px', fontSize: '0.85rem', fontWeight: 500,
  background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer',
};
const deleteBtn: React.CSSProperties = {
  padding: '4px 12px', fontSize: '0.85rem', fontWeight: 500,
  background: '#fff', border: '1px solid #fca5a5', borderRadius: '6px',
  cursor: 'pointer', color: '#dc2626',
};
const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#2563eb',
  cursor: 'pointer', fontSize: '0.8rem', padding: '2px 6px',
};
