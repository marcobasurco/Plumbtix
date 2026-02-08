import { useEffect, useState, useCallback, type FormEvent, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCompanyList, createCompany, type CompanyListRow } from '@/lib/admin';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PageTransition, StaggerChildren, StaggerItem } from '@/components/PageTransition';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Building2, Users2, Plus, Loader2, Briefcase } from 'lucide-react';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function CompanyList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [companies, setCompanies] = useState<CompanyListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setCompanies(await fetchCompanyList()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slugTouched) setSlug(toSlug(val));
  };

  const resetForm = () => {
    setName(''); setSlug(''); setSlugTouched(false); setFormError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const trimName = name.trim(), trimSlug = slug.trim();
    if (!trimName) { setFormError('Company name is required'); return; }
    if (!trimSlug || !SLUG_REGEX.test(trimSlug)) {
      setFormError('Slug must be lowercase letters, numbers, and hyphens only');
      return;
    }

    setSubmitting(true);
    try {
      const created = await createCompany(trimName, trimSlug);
      setCompanies((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      resetForm();
      setDialogOpen(false);
      toast('Company created');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageTransition>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Companies</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {companies.length} compan{companies.length !== 1 ? 'ies' : 'y'}
          </p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" /> New Company
        </Button>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="p-4 space-y-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-24" />
              <div className="flex gap-4"><Skeleton className="h-3 w-16" /><Skeleton className="h-3 w-16" /></div>
            </CardContent></Card>
          ))}
        </div>
      ) : companies.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 px-4">
          <Briefcase className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <div className="text-base font-semibold mb-1">No companies yet</div>
          <div className="text-sm text-muted-foreground max-w-sm">
            Add your first property management company to get started.
          </div>
          <Button size="sm" className="mt-4" onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> New Company
          </Button>
        </div>
      ) : (
        <StaggerChildren className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((c) => (
            <StaggerItem key={c.id}>
              <Card
                className="cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/20"
                onClick={() => navigate(`companies/${c.id}`)}
              >
                <CardContent className="p-4">
                  <div className="font-semibold text-foreground mb-0.5">{c.name}</div>
                  <div className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground font-mono mb-3">
                    {c.slug}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {c.building_count}</span>
                    <span className="flex items-center gap-1"><Users2 className="h-3.5 w-3.5" /> {c.user_count}</span>
                    <span className="ml-auto text-muted-foreground/60">{formatDate(c.created_at)}</span>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerChildren>
      )}

      {/* Create Company Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open: boolean) => { if (!open) resetForm(); setDialogOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Company</DialogTitle>
            <DialogDescription>
              Add a property management company. Buildings and users will be scoped to this company.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-2">
              <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />
              <div className="space-y-1.5">
                <Label htmlFor="co-name">Company Name <span className="text-destructive">*</span></Label>
                <Input
                  id="co-name"
                  value={name}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleNameChange(e.target.value)}
                  placeholder="Acme Property Management"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="co-slug">Slug <span className="text-destructive">*</span></Label>
                <Input
                  id="co-slug"
                  value={slug}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => { setSlugTouched(true); setSlug(e.target.value); }}
                  placeholder="acme-property"
                />
                <p className="text-xs text-muted-foreground">Lowercase, numbers, hyphens. Auto-generated from name.</p>
              </div>
            </div>
            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => { resetForm(); setDialogOpen(false); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : 'Create Company'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
