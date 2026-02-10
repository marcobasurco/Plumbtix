// =============================================================================
// PlumbTix — Building Detail Page
// =============================================================================
// Shows building address, site-access details, spaces (units + common areas),
// occupant lists, and PM-user entitlements.
// Edit opens BuildingFormDialog; delete uses AlertDialog.
// =============================================================================

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
import { BuildingFormDialog } from './BuildingFormDialog';
import { OccupantList } from './OccupantList';
import { EntitlementManager } from './EntitlementManager';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PageTransition, FadeIn } from '@/components/PageTransition';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Pencil, Trash2, Plus, ChevronRight, ChevronLeft,
  Home, KeyRound, Droplets, Flame, User, FileText,
} from 'lucide-react';
import { useRealtime } from '@/hooks/useRealtime';

export function BuildingDetail() {
  const { buildingId } = useParams<{ buildingId: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const canWrite = role === 'proroto_admin' || role === 'pm_admin';

  const [building, setBuilding] = useState<BuildingDetailRow | null>(null);
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Delete building state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Delete space state
  const [deleteSpaceTarget, setDeleteSpaceTarget] = useState<SpaceRow | null>(null);
  const [deletingSpace, setDeletingSpace] = useState(false);

  // Space form state
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

  // Realtime: auto-refresh when spaces/occupants in this building change
  useRealtime('spaces', load, { filter: `building_id=eq.${buildingId}`, enabled: !!buildingId && !loading });
  useRealtime('occupants', load, { enabled: !!buildingId && !loading });

  const handleDeleteBuilding = async () => {
    if (!building) return;
    if (spaces.length > 0) {
      setError('Cannot delete building with existing spaces. Remove all spaces first.');
      setDeleteDialogOpen(false);
      return;
    }
    setDeleting(true);
    try {
      await deleteBuilding(building.id);
      toast.success('Building deleted');
      navigate('..', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
      setDeleteDialogOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSpace = async () => {
    if (!deleteSpaceTarget) return;
    setDeletingSpace(true);
    try {
      await deleteSpace(deleteSpaceTarget.id);
      setSpaces((prev) => prev.filter((s) => s.id !== deleteSpaceTarget.id));
      toast.success('Space deleted');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete space');
    } finally {
      setDeletingSpace(false);
      setDeleteSpaceTarget(null);
    }
  };

  const handleSpaceSaved = () => {
    setShowSpaceForm(false);
    setEditingSpace(null);
    toast.success(editingSpace ? 'Space updated' : 'Space created');
    load();
  };

  const spaceLabel = (s: SpaceRow) =>
    s.space_type === 'unit'
      ? `Unit ${s.unit_number}`
      : COMMON_AREA_LABELS[s.common_area_type as keyof typeof COMMON_AREA_LABELS] ?? s.common_area_type;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" />
        </div>
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (error && !building) return <ErrorBanner message={error} />;
  if (!building) return <ErrorBanner message="Building not found" />;

  const units = spaces.filter((s) => s.space_type === 'unit');
  const commonAreas = spaces.filter((s) => s.space_type === 'common_area');

  const siteDetails = [
    { icon: KeyRound, label: 'Gate Code', value: building.gate_code, mono: true },
    { icon: Droplets, label: 'Water Shutoff', value: building.water_shutoff_location },
    { icon: Flame, label: 'Gas Shutoff', value: building.gas_shutoff_location },
    { icon: User, label: 'Onsite Contact', value: building.onsite_contact_name ? `${building.onsite_contact_name}${building.onsite_contact_phone ? ` — ${building.onsite_contact_phone}` : ''}` : null },
    { icon: FileText, label: 'Access Notes', value: building.access_notes },
  ].filter((d) => d.value);

  return (
    <PageTransition>
      <Button variant="ghost" size="sm" className="mb-4 -ml-2 gap-1" onClick={() => navigate('..')}>
        <ChevronLeft className="h-3.5 w-3.5" /> Buildings
      </Button>

      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-3 mb-6">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold tracking-tight">
            {building.name || building.address_line1}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {building.address_line1}
            {building.address_line2 && `, ${building.address_line2}`}
            {' — '}{building.city}, {building.state} {building.zip}
          </p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        )}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <Card>
          <CardContent className="px-4 py-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Units</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{units.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Common Areas</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{commonAreas.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Spaces</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{spaces.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Site Details Card */}
      <Card className="mb-6">
        <CardHeader className="pb-0">
          <CardTitle className="text-sm">Site Details</CardTitle>
        </CardHeader>
        <CardContent>
          {siteDetails.length > 0 ? (
            <dl className="grid gap-x-4 gap-y-3 text-sm" style={{ gridTemplateColumns: 'auto 1fr' }}>
              {siteDetails.map((d) => (
                <React.Fragment key={d.label}>
                  <dt className="font-medium text-muted-foreground flex items-center gap-2">
                    <d.icon className="h-3.5 w-3.5" /> {d.label}
                  </dt>
                  <dd className={d.mono ? 'font-mono text-sm bg-muted px-2 py-0.5 rounded w-fit' : ''}>
                    {d.value}
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          ) : (
            <p className="text-muted-foreground text-sm">
              No site details recorded. Edit the building to add gate codes, shutoff locations, and contacts.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Spaces section */}
      <div className="mt-8">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="text-base font-semibold">Spaces ({spaces.length})</div>
            <div className="text-xs text-muted-foreground mt-0.5">Units and common areas in this building</div>
          </div>
          {canWrite && !showSpaceForm && (
            <Button size="sm" onClick={() => { setEditingSpace(null); setShowSpaceForm(true); }}>
              <Plus className="h-3.5 w-3.5" /> Add Space
            </Button>
          )}
        </div>

        {showSpaceForm && (
          <FadeIn className="mb-4">
            <SpaceForm
              buildingId={building.id}
              editSpace={editingSpace}
              onSaved={handleSpaceSaved}
              onCancel={() => { setShowSpaceForm(false); setEditingSpace(null); }}
            />
          </FadeIn>
        )}

        {/* Units table */}
        {units.length > 0 && (
          <div className="mb-5">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Units ({units.length})
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unit #</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Floor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Beds</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Baths</th>
                    {canWrite && <th className="px-4 py-3 w-24"></th>}
                  </tr>
                </thead>
                <tbody>
                  {units.map((s) => (
                    <React.Fragment key={s.id}>
                      <tr className="transition-colors hover:bg-muted/50">
                        <td className="px-4 py-3 border-t border-border">
                          <Button
                            variant="link"
                            size="sm"
                            className="p-0 h-auto font-semibold gap-1.5"
                            onClick={() => setExpandedSpace(expandedSpace === s.id ? null : s.id)}
                          >
                            <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${expandedSpace === s.id ? 'rotate-90' : ''}`} />
                            {s.unit_number}
                          </Button>
                        </td>
                        <td className="px-4 py-3 border-t border-border">{s.floor ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-4 py-3 border-t border-border">{s.bedrooms ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-4 py-3 border-t border-border">{s.bathrooms ?? <span className="text-muted-foreground">—</span>}</td>
                        {canWrite && (
                          <td className="px-4 py-3 border-t border-border text-right">
                            <Button variant="ghost" size="sm" onClick={() => { setEditingSpace(s); setShowSpaceForm(true); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteSpaceTarget(s)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        )}
                      </tr>
                      {expandedSpace === s.id && (
                        <tr>
                          <td colSpan={canWrite ? 5 : 4} className="px-4 py-3 bg-muted/30 border-t border-border">
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
          <div className="mb-5">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Common Areas ({commonAreas.length})
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Floor</th>
                    {canWrite && <th className="px-4 py-3 w-24"></th>}
                  </tr>
                </thead>
                <tbody>
                  {commonAreas.map((s) => {
                    const areaLabel = COMMON_AREA_LABELS[s.common_area_type as keyof typeof COMMON_AREA_LABELS] ?? s.common_area_type;
                    return (
                      <React.Fragment key={s.id}>
                        <tr className="transition-colors hover:bg-muted/50">
                          <td className="px-4 py-3 border-t border-border">
                            <Button
                              variant="link"
                              size="sm"
                              className="p-0 h-auto font-semibold gap-1.5"
                              onClick={() => setExpandedSpace(expandedSpace === s.id ? null : s.id)}
                            >
                              <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${expandedSpace === s.id ? 'rotate-90' : ''}`} />
                              {areaLabel}
                            </Button>
                          </td>
                          <td className="px-4 py-3 border-t border-border">{s.floor ?? <span className="text-muted-foreground">—</span>}</td>
                          {canWrite && (
                            <td className="px-4 py-3 border-t border-border text-right">
                              <Button variant="ghost" size="sm" onClick={() => { setEditingSpace(s); setShowSpaceForm(true); }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteSpaceTarget(s)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          )}
                        </tr>
                        {expandedSpace === s.id && (
                          <tr>
                            <td colSpan={canWrite ? 3 : 2} className="px-4 py-3 bg-muted/30 border-t border-border">
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
          <div className="flex flex-col items-center justify-center text-center py-16 px-4">
            <Home className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <div className="text-base font-semibold mb-1">No spaces yet</div>
            <div className="text-sm text-muted-foreground max-w-sm">
              {canWrite ? 'Add units or common areas to start managing this building.' : 'No spaces have been added to this building.'}
            </div>
            {canWrite && (
              <Button size="sm" className="mt-4" onClick={() => { setEditingSpace(null); setShowSpaceForm(true); }}>
                <Plus className="h-3.5 w-3.5" /> Add Space
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Entitlements */}
      {canWrite && building.company_id && (
        <div className="mt-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="text-base font-semibold">PM User Access</div>
              <div className="text-xs text-muted-foreground mt-0.5">Assign PM Users who can view and manage tickets for this building</div>
            </div>
          </div>
          <Card>
            <CardContent className="p-4">
              <EntitlementManager buildingId={building.id} companyId={building.company_id} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Building Dialog */}
      <BuildingFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        buildingId={building.id}
        companyId={building.company_id}
        onSaved={load}
      />

      {/* Delete building dialog */}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Building"
        description={`Are you sure you want to delete "${building.name || building.address_line1}"? This action cannot be undone.`}
        confirmLabel="Delete Building"
        onConfirm={handleDeleteBuilding}
        loading={deleting}
        variant="destructive"
      />

      {/* Delete space dialog */}
      <AlertDialog
        open={!!deleteSpaceTarget}
        onOpenChange={(open: boolean) => { if (!open) setDeleteSpaceTarget(null); }}
        title="Delete Space"
        description={`Are you sure you want to delete "${deleteSpaceTarget ? spaceLabel(deleteSpaceTarget) : ''}"?`}
        confirmLabel="Delete Space"
        onConfirm={handleDeleteSpace}
        loading={deletingSpace}
        variant="destructive"
      />
    </PageTransition>
  );
}
