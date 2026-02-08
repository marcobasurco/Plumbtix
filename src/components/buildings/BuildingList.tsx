import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBuildingList, type BuildingListRow } from '@/lib/buildings';
import { fetchCompanyOptions, type CompanyOption } from '@/lib/admin';
import { useAuth } from '@/lib/auth';
import { Loading } from '@/components/Loading';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PageTransition, StaggerChildren, StaggerItem } from '@/components/PageTransition';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Building2, MapPin, Layers, Ticket, Search, Plus, Calendar,
} from 'lucide-react';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function BuildingCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
        <div className="flex gap-4 pt-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

export function BuildingList() {
  const navigate = useNavigate();
  const { role, companyId } = useAuth();

  // Both proroto_admin and pm_admin can create buildings
  const canCreate = role === 'proroto_admin' || role === 'pm_admin';
  const isProrotoAdmin = role === 'proroto_admin';

  const [buildings, setBuildings] = useState<BuildingListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Company picker for proroto_admin (they have no default companyId)
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const handleNewBuilding = async () => {
    // pm_admin has a companyId in context — navigate directly
    if (!isProrotoAdmin) {
      navigate('new');
      return;
    }
    // proroto_admin needs to pick a company first
    setCompanyPickerOpen(true);
    setCompaniesLoading(true);
    try {
      const list = await fetchCompanyOptions();
      setCompanies(list);
    } catch {
      setError('Failed to load companies');
    } finally {
      setCompaniesLoading(false);
    }
  };

  const handleCompanySelected = () => {
    if (!selectedCompanyId) return;
    setCompanyPickerOpen(false);
    navigate(`new?companyId=${selectedCompanyId}`);
  };

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
    <PageTransition>
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Buildings</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {buildings.length} building{buildings.length !== 1 ? 's' : ''} managed
          </p>
        </div>
        {canCreate && (
          <Button onClick={handleNewBuilding}>
            <Plus className="h-4 w-4" />
            New Building
          </Button>
        )}
      </div>

      {/* Search bar */}
      {buildings.length > 3 && (
        <div className="relative mb-5 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search by address, city, ZIP…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <BuildingCardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 px-4">
          <Building2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <div className="text-base font-semibold mb-1">
            {search ? 'No buildings match your search' : 'No buildings found'}
          </div>
          <div className="text-sm text-muted-foreground max-w-sm">
            {search
              ? 'Try a different search term.'
              : canCreate
                ? 'Add your first building to start managing spaces and tickets.'
                : 'No buildings are available for your account.'}
          </div>
          {canCreate && !search && (
            <Button size="sm" className="mt-4" onClick={handleNewBuilding}>
              <Plus className="h-3.5 w-3.5" /> Add Building
            </Button>
          )}
        </div>
      ) : (
        <StaggerChildren className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((b) => (
            <StaggerItem key={b.id}>
              <Card
                className="cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/20 relative overflow-hidden group"
                onClick={() => navigate(b.id)}
              >
                {/* Top gradient accent on hover */}
                <div className="absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gradient-to-r from-blue-500 to-violet-500" />
                <CardContent className="p-4">
                  <div className="font-bold text-foreground leading-tight mb-0.5">
                    {b.name || b.address_line1}
                  </div>
                  {b.name && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <MapPin className="h-3 w-3" />
                      {b.address_line1}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground/70 mb-3">
                    {b.city}, {b.state} {b.zip}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 opacity-70" />
                      {b.space_count} space{b.space_count !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Ticket className="h-3.5 w-3.5 opacity-70" />
                      {b.ticket_count} ticket{b.ticket_count !== 1 ? 's' : ''}
                    </span>
                    <span className="ml-auto flex items-center gap-1 text-muted-foreground/60">
                      <Calendar className="h-3 w-3" />
                      {formatDate(b.created_at)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerChildren>
      )}

      {/* Company Picker Dialog — proroto_admin only */}
      <Dialog open={companyPickerOpen} onOpenChange={setCompanyPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Company</DialogTitle>
            <DialogDescription>
              Choose which company this building belongs to.
            </DialogDescription>
          </DialogHeader>
          {companiesLoading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : companies.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No companies found. Create a company first.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-1 py-2">
              {companies.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCompanyId(c.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors ${
                    selectedCompanyId === c.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompanyPickerOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCompanySelected} disabled={!selectedCompanyId}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
