import { useEffect, useState, useCallback, type FormEvent, type ChangeEvent } from 'react';
import {
  fetchEntitlements,
  createEntitlement,
  deleteEntitlement,
  type EntitlementRow,
} from '@/lib/buildings';
import { fetchUserList, type UserListRow } from '@/lib/admin';
import { ErrorBanner } from '@/components/ErrorBanner';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { X, Loader2, UserPlus, Shield } from 'lucide-react';

interface EntitlementManagerProps {
  buildingId: string;
  companyId: string;
}

export function EntitlementManager({ buildingId, companyId }: EntitlementManagerProps) {
  const [entitlements, setEntitlements] = useState<EntitlementRow[]>([]);
  const [companyUsers, setCompanyUsers] = useState<UserListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedUser, setSelectedUser] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EntitlementRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ents, users] = await Promise.all([
        fetchEntitlements(buildingId),
        fetchUserList(companyId),
      ]);
      setEntitlements(ents);
      setCompanyUsers(users.filter((u) => u.role === 'pm_user'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [buildingId, companyId]);

  useEffect(() => { load(); }, [load]);

  // Users who don't already have entitlement
  const entitledUserIds = new Set(entitlements.map((e) => e.user_id));
  const availableUsers = companyUsers.filter((u) => !entitledUserIds.has(u.id));

  // Map user_id → user for display
  const userMap = new Map(companyUsers.map((u) => [u.id, u]));

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createEntitlement(buildingId, selectedUser);
      setEntitlements((prev) => [...prev, created]);
      setSelectedUser('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteEntitlement(deleteTarget.id);
      setEntitlements((prev) => prev.filter((e) => e.id !== deleteTarget.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (loading) return <div className="text-xs text-muted-foreground">Loading entitlements…</div>;

  return (
    <div>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {entitlements.length === 0 && !showForm && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Shield className="h-4 w-4" />
          No PM Users assigned. Only PM Admins can see this building.
        </div>
      )}

      <div className="space-y-1.5">
        {entitlements.map((ent) => {
          const user = userMap.get(ent.user_id);
          return (
            <div
              key={ent.id}
              className="flex justify-between items-center p-2.5 bg-muted/50 rounded-lg"
            >
              <div className="min-w-0">
                <strong className="text-sm">{user?.full_name ?? 'Unknown user'}</strong>
                <span className="text-xs text-muted-foreground ml-2">
                  {user?.email ?? ent.user_id}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive shrink-0"
                onClick={() => setDeleteTarget(ent)}
              >
                <X className="h-3.5 w-3.5 mr-1" /> Remove
              </Button>
            </div>
          );
        })}
      </div>

      {!showForm ? (
        availableUsers.length > 0 && (
          <Button
            variant="link"
            size="sm"
            className="p-0 h-auto mt-2 text-xs"
            onClick={() => setShowForm(true)}
          >
            <UserPlus className="h-3 w-3" /> Assign PM User
          </Button>
        )
      ) : (
        <form
          onSubmit={handleAdd}
          className="mt-2 p-3 bg-muted/50 rounded-lg border border-border"
        >
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs font-semibold mb-1">PM User</label>
              <select
                value={selectedUser}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedUser(e.target.value)}
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select a PM User…</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm" disabled={submitting || !selectedUser}>
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Assign'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {availableUsers.length === 0 && companyUsers.length > 0 && !showForm && entitlements.length > 0 && (
        <p className="text-xs text-muted-foreground mt-1.5">All PM Users are already assigned.</p>
      )}
      {companyUsers.length === 0 && (
        <p className="text-xs text-muted-foreground mt-1.5">No PM Users exist in this company yet. Invite one first.</p>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open: boolean) => { if (!open) setDeleteTarget(null); }}
        title="Remove Access"
        description={`Remove access for "${userMap.get(deleteTarget?.user_id ?? '')?.full_name ?? 'this user'}"? They will no longer see tickets for this building.`}
        confirmLabel="Remove"
        onConfirm={handleRemove}
        loading={deleting}
        variant="destructive"
      />
    </div>
  );
}
