import { useEffect, useState, useCallback, type FormEvent } from 'react';
import {
  fetchOccupants,
  createOccupant,
  deleteOccupant,
  type OccupantRow,
  type OccupantFormData,
} from '@/lib/buildings';
import { ErrorBanner } from '@/components/ErrorBanner';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Loader2, Copy, Check } from 'lucide-react';

interface OccupantListProps {
  spaceId: string;
  spaceLabel: string;
  canWrite: boolean;
}

export function OccupantList({ spaceId, spaceLabel, canWrite }: OccupantListProps) {
  const [occupants, setOccupants] = useState<OccupantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OccupantRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [occType, setOccType] = useState<'homeowner' | 'tenant'>('tenant');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOccupants(await fetchOccupants(spaceId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load occupants');
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !email.trim()) { setFormError('Name and email are required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setFormError('Invalid email format'); return; }

    setSubmitting(true);
    try {
      const form: OccupantFormData = { occupant_type: occType, name: name.trim(), email: email.trim(), phone: phone.trim() };
      const created = await createOccupant(spaceId, form);
      setOccupants((prev) => [...prev, created]);
      setName(''); setEmail(''); setPhone(''); setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add occupant');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteOccupant(deleteTarget.id);
      setOccupants((prev) => prev.filter((o) => o.id !== deleteTarget.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const copyClaimUrl = (token: string) => {
    const url = `${window.location.origin}/claim-account?token=${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  };

  if (loading) return <div className="text-xs text-muted-foreground py-1">Loading…</div>;

  return (
    <div className="mt-1">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {occupants.length === 0 && !showForm && (
        <span className="text-xs text-muted-foreground">No occupants</span>
      )}

      <div className="space-y-1">
        {occupants.map((occ) => (
          <div
            key={occ.id}
            className="flex justify-between items-start p-2 bg-muted/50 rounded-md text-sm"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <strong className="text-sm">{occ.name}</strong>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {occ.occupant_type}
                </Badge>
                {occ.claimed_at && (
                  <Badge variant="success" className="text-[10px] px-1.5 py-0">
                    ✓ claimed
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {occ.email}{occ.phone && ` · ${occ.phone}`}
              </div>
              {occ.invite_token && !occ.claimed_at && (
                <button
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline mt-0.5 bg-transparent border-none cursor-pointer p-0"
                  onClick={() => copyClaimUrl(occ.invite_token!)}
                >
                  {copiedToken === occ.invite_token ? (
                    <><Check className="h-3 w-3" /> Copied!</>
                  ) : (
                    <><Copy className="h-3 w-3" /> Copy claim link</>
                  )}
                </button>
              )}
            </div>
            {canWrite && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive shrink-0"
                onClick={() => setDeleteTarget(occ)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {canWrite && !showForm && (
        <Button
          variant="link"
          size="sm"
          className="p-0 h-auto mt-1.5 text-xs"
          onClick={() => setShowForm(true)}
        >
          <Plus className="h-3 w-3" /> Add Occupant
        </Button>
      )}

      {showForm && (
        <div className="mt-2 p-3 bg-muted/50 rounded-lg border border-border">
          <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />
          <form onSubmit={handleCreate} className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Name <span className="text-destructive">*</span></Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Jane Smith"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email <span className="text-destructive">*</span></Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="jane@example.com"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <select
                  value={occType}
                  onChange={(e) => setOccType(e.target.value as 'homeowner' | 'tenant')}
                  className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="tenant">Tenant</option>
                  <option value="homeowner">Homeowner</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? <><Loader2 className="h-3 w-3 animate-spin" /> Adding…</> : 'Add'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setShowForm(false); setFormError(null); }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Remove Occupant"
        description={`Remove "${deleteTarget?.name}" from ${spaceLabel}? They will lose portal access.`}
        confirmLabel="Remove"
        onConfirm={handleDelete}
        loading={deleting}
        variant="destructive"
      />
    </div>
  );
}
