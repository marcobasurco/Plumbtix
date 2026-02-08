import React, { useEffect, useState, useCallback } from 'react';
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
import { OccupantList } from './OccupantList';
import { EntitlementManager } from './EntitlementManager';
import { Loading } from '@/components/Loading';
import { ErrorBanner } from '@/components/ErrorBanner';
import { useToast } from '@/components/Toast';

import { Pencil, Trash2, Plus, ChevronRight, ChevronLeft } from 'lucide-react';

const IconEdit = ({ size = 14 }: { size?: number }) => <Pencil size={size} />;
const IconTrash = ({ size = 14 }: { size?: number }) => <Trash2 size={size} />;
const IconPlus = ({ size = 14 }: { size?: number }) => <Plus size={size} />;
const IconChevron = ({ open }: { open: boolean }) => (
  <ChevronRight
    size={14}
    style={{ transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0)' }}
  />
);

export function BuildingDetail() {
  const { buildingId } = useParams<{ buildingId: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { toast } = useToast();
  const canWrite = role === 'proroto_admin' || role === 'pm_admin';

  const [building, setBuilding] = useState<BuildingDetailRow | null>(null);
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletingSpace, setDeletingSpace] = useState<string | null>(null);

  const [showSpaceForm, setShowSpaceForm] = useState(false);
  const [editingSpace, setEditingSpace] = useState<SpaceRow | null>(null);
  const [expandedSpace, setExpandedSpace] = useState<string | null>(null);

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
    if (!confirm(`Delete "${building.name || building.address_line1}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteBuilding(building.id);
      toast('Building deleted');
      navigate('..', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSpace = async (space: SpaceRow) => {
    const label = space.space_type === 'unit'
      ? `Unit ${space.unit_number}`
      : COMMON_AREA_LABELS[space.common_area_type as keyof typeof COMMON_AREA_LABELS] ?? space.common_area_type;
    if (!confirm(`Delete "${label}"?`)) return;
    setDeletingSpace(space.id);
    setError(null);
    try {
      await deleteSpace(space.id);
      setSpaces((prev) => prev.filter((s) => s.id !== space.id));
      toast('Space deleted');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete space');
    } finally {
      setDeletingSpace(null);
    }
  };

  const handleSpaceSaved = () => {
    setShowSpaceForm(false);
    setEditingSpace(null);
    toast(editingSpace ? 'Space updated' : 'Space created');
    load();
  };

  if (loading) return <Loading message="Loading building…" />;
  if (error && !building) return <ErrorBanner message={error} />;
  if (!building) return <ErrorBanner message="Building not found" />;

  const units = spaces.filter((s) => s.space_type === 'unit');
  const commonAreas = spaces.filter((s) => s.space_type === 'common_area');

  return (
    <div className="animate-in">
      <button type="button" className="back-link" onClick={() => navigate('..')}>
        <ChevronLeft size={14} />
        Buildings
      </button>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="page-title">{building.name || building.address_line1}</h2>
          <p className="page-subtitle">
            {building.address_line1}
            {building.address_line2 && `, ${building.address_line2}`}
            {' — '}{building.city}, {building.state} {building.zip}
          </p>
        </div>
        {canWrite && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => navigate('edit')} className="btn btn-secondary btn-sm"><IconEdit /> Edit</button>
            <button onClick={handleDeleteBuilding} disabled={deleting} className="btn btn-danger btn-sm">
              {deleting ? '…' : <><IconTrash /> Delete</>}
            </button>
          </div>
        )}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* Stats row */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Units</div>
          <div className="stat-value">{units.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Common Areas</div>
          <div className="stat-value">{commonAreas.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Spaces</div>
          <div className="stat-value">{spaces.length}</div>
        </div>
      </div>

      {/* Building details card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>Site Details</span>
        </div>
        <div className="card-body">
          {building.gate_code || building.water_shutoff_location || building.gas_shutoff_location || building.onsite_contact_name || building.access_notes ? (
            <dl className="dl-grid">
              {building.gate_code && <><dt>Gate Code</dt><dd><span className="tag text-mono">{building.gate_code}</span></dd></>}
              {building.water_shutoff_location && <><dt>Water Shutoff</dt><dd>{building.water_shutoff_location}</dd></>}
              {building.gas_shutoff_location && <><dt>Gas Shutoff</dt><dd>{building.gas_shutoff_location}</dd></>}
              {building.onsite_contact_name && <><dt>Onsite Contact</dt><dd>{building.onsite_contact_name}{building.onsite_contact_phone && ` — ${building.onsite_contact_phone}`}</dd></>}
              {building.access_notes && <><dt>Access Notes</dt><dd>{building.access_notes}</dd></>}
            </dl>
          ) : (
            <p className="text-muted text-sm">No site details recorded. Edit the building to add gate codes, shutoff locations, and contacts.</p>
          )}
        </div>
      </div>

      {/* Spaces section */}
      <div className="section">
        <div className="section-header">
          <div>
            <div className="section-title">Spaces ({spaces.length})</div>
            <div className="section-subtitle">Units and common areas in this building</div>
          </div>
          {canWrite && !showSpaceForm && (
            <button onClick={() => { setEditingSpace(null); setShowSpaceForm(true); }} className="btn btn-primary btn-sm">
              <IconPlus /> Add Space
            </button>
          )}
        </div>

        {showSpaceForm && (
          <SpaceForm
            buildingId={building.id}
            editSpace={editingSpace}
            onSaved={handleSpaceSaved}
            onCancel={() => { setShowSpaceForm(false); setEditingSpace(null); }}
          />
        )}

        {/* Units table */}
        {units.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--slate-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Units ({units.length})
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Unit #</th><th>Floor</th><th>Beds</th><th>Baths</th>
                    {canWrite && <th style={{ width: 100 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {units.map((s) => (
                    <React.Fragment key={s.id}>
                      <tr>
                        <td>
                          <button className="btn-link" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                            onClick={() => setExpandedSpace(expandedSpace === s.id ? null : s.id)}>
                            <IconChevron open={expandedSpace === s.id} />
                            {s.unit_number}
                          </button>
                        </td>
                        <td>{s.floor ?? <span className="text-muted">—</span>}</td>
                        <td>{s.bedrooms ?? <span className="text-muted">—</span>}</td>
                        <td>{s.bathrooms ?? <span className="text-muted">—</span>}</td>
                        {canWrite && (
                          <td style={{ textAlign: 'right' }}>
                            <button onClick={() => { setEditingSpace(s); setShowSpaceForm(true); }} className="btn btn-ghost btn-sm"><IconEdit /></button>
                            <button onClick={() => handleDeleteSpace(s)} disabled={deletingSpace === s.id} className="btn btn-ghost btn-sm" style={{ color: 'var(--red-500)' }}>
                              {deletingSpace === s.id ? '…' : <IconTrash />}
                            </button>
                          </td>
                        )}
                      </tr>
                      {expandedSpace === s.id && (
                        <tr>
                          <td colSpan={canWrite ? 5 : 4} style={{ padding: '4px 16px 16px', background: 'var(--slate-50)' }}>
                            <OccupantList spaceId={s.id} spaceLabel={`Unit ${s.unit_number}`} canWrite={canWrite} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Common areas table */}
        {commonAreas.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--slate-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Common Areas ({commonAreas.length})
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Type</th><th>Floor</th>{canWrite && <th style={{ width: 100 }}></th>}</tr></thead>
                <tbody>
                  {commonAreas.map((s) => {
                    const areaLabel = COMMON_AREA_LABELS[s.common_area_type as keyof typeof COMMON_AREA_LABELS] ?? s.common_area_type;
                    return (
                      <React.Fragment key={s.id}>
                        <tr>
                          <td>
                            <button className="btn-link" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                              onClick={() => setExpandedSpace(expandedSpace === s.id ? null : s.id)}>
                              <IconChevron open={expandedSpace === s.id} /> {areaLabel}
                            </button>
                          </td>
                          <td>{s.floor ?? <span className="text-muted">—</span>}</td>
                          {canWrite && (
                            <td style={{ textAlign: 'right' }}>
                              <button onClick={() => { setEditingSpace(s); setShowSpaceForm(true); }} className="btn btn-ghost btn-sm"><IconEdit /></button>
                              <button onClick={() => handleDeleteSpace(s)} disabled={deletingSpace === s.id} className="btn btn-ghost btn-sm" style={{ color: 'var(--red-500)' }}>
                                {deletingSpace === s.id ? '…' : <IconTrash />}
                              </button>
                            </td>
                          )}
                        </tr>
                        {expandedSpace === s.id && (
                          <tr>
                            <td colSpan={canWrite ? 3 : 2} style={{ padding: '4px 16px 16px', background: 'var(--slate-50)' }}>
                              <OccupantList spaceId={s.id} spaceLabel={areaLabel ?? 'Common Area'} canWrite={canWrite} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {spaces.length === 0 && !showSpaceForm && (
          <div className="empty-state">
            <div className="empty-state-title">No spaces yet</div>
            <div className="empty-state-text">
              {canWrite ? 'Add units or common areas to start managing this building.' : 'No spaces have been added to this building.'}
            </div>
            {canWrite && (
              <button onClick={() => { setEditingSpace(null); setShowSpaceForm(true); }} className="btn btn-primary btn-sm mt-4">
                <IconPlus /> Add Space
              </button>
            )}
          </div>
        )}
      </div>

      {/* Entitlements */}
      {canWrite && building.company_id && (
        <div className="section">
          <div className="section-header">
            <div>
              <div className="section-title">PM User Access</div>
              <div className="section-subtitle">Assign PM Users who can view and manage tickets for this building</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <EntitlementManager buildingId={building.id} companyId={building.company_id} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
