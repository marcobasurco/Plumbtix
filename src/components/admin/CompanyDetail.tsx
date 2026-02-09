import { useEffect, useState, useCallback, type FormEvent, type ChangeEvent } from 'react';
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
import { PageTransition } from '@/components/PageTransition';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { ChevronLeft, Plus, Pencil, Loader2, Building2 } from 'lucide-react';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ROLE_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive' | 'urgent' | 'warning' | 'success' | 'info'> = {
  proroto_admin: 'info',
  pm_admin: 'urgent',
  pm_user: 'urgent',
  resident: 'success',
};

export function CompanyDetail() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [company, setCompany] = useState<CompanyDetailRow | null>(null);
  const [buildings, setBuildings] = useState<CompanyBuildingRow[]>([]);
  const [users, setUsers] = useState<UserListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
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

  const openEdit = () => {
    if (!company) return;
    setEditName(company.name); setEditSlug(company.slug); setEditError(null); setEditOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setEditError(null);
    const trimName = editName.trim(), trimSlug = editSlug.trim();
    if (!trimName) { setEditError('Name is required'); return; }
    if (!trimSlug || !SLUG_REGEX.test(trimSlug)) {
      setEditError('Slug must be lowercase letters, numbers, and hyphens');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateCompany(company.id, { name: trimName, slug: trimSlug });
      setCompany(updated); setEditOpen(false);
      toast('Company updated');
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save');
    } finally { setSaving(false); }
  };

  if (loading) return <Loading message="Loading company…" />;
  if (error && !company) return <ErrorBanner message={error} />;
  if (!company) return <ErrorBanner message="Company not found" />;

  return (
    <PageTransition>
      <Button variant="ghost" size="sm" className="mb-4 -ml-2 gap-1" onClick={() => navigate('..')}>
        <ChevronLeft className="h-3.5 w-3.5" /> Companies
      </Button>

      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{company.name}</h2>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground font-mono">
              {company.slug}
            </span>
            <span className="text-border">·</span>
            Created {formatDate(company.created_at)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={openEdit}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <Card>
          <CardContent className="px-4 py-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Buildings</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{buildings.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Users</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{users.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Buildings */}
      <div className="mt-8">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="text-base font-semibold">Buildings ({buildings.length})</div>
          <Button size="sm" onClick={() => navigate(`/admin/companies/${companyId}/buildings/new`)}>
            <Plus className="h-3.5 w-3.5" /> Add Building
          </Button>
        </div>
        {buildings.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12 px-4">
            <Building2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <div className="text-sm font-semibold mb-1">No buildings</div>
            <div className="text-xs text-muted-foreground">Add your first building to this company.</div>
            <Button size="sm" className="mt-3" onClick={() => navigate(`/admin/companies/${companyId}/buildings/new`)}>
              <Plus className="h-3.5 w-3.5" /> Add Building
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Building</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
                </tr>
              </thead>
              <tbody>
                {buildings.map((b) => (
                  <tr
                    key={b.id}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => navigate(`/admin/buildings/${b.id}`)}
                  >
                    <td className="px-4 py-3 border-t border-border font-semibold">{b.name || b.address_line1}</td>
                    <td className="px-4 py-3 border-t border-border text-muted-foreground">{b.city}, {b.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Users */}
      <div className="mt-8">
        <div className="text-base font-semibold mb-4">Users ({users.length})</div>
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-muted/50">
                    <td className="px-4 py-3 border-t border-border font-semibold">{u.full_name}</td>
                    <td className="px-4 py-3 border-t border-border text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3 border-t border-border">
                      <Badge variant={ROLE_BADGE_VARIANT[u.role] ?? 'secondary'}>
                        {ROLE_LABELS[u.role]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 border-t border-border text-muted-foreground">{formatDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Company Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
            <DialogDescription>Update the company name and URL slug.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave}>
            <div className="space-y-4 py-2">
              <ErrorBanner message={editError} onDismiss={() => setEditError(null)} />
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">Company Name <span className="text-destructive">*</span></Label>
                <Input id="edit-name" value={editName} onChange={(e: ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-slug">Slug <span className="text-destructive">*</span></Label>
                <Input id="edit-slug" value={editSlug} onChange={(e: ChangeEvent<HTMLInputElement>) => setEditSlug(e.target.value)} />
              </div>
            </div>
            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
