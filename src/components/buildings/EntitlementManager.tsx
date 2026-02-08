import { useEffect, useState, useCallback, type FormEvent } from 'react';
import {
  fetchEntitlements,
  createEntitlement,
  deleteEntitlement,
  type EntitlementRow,
} from '@/lib/buildings';
import { fetchUserList, type UserListRow } from '@/lib/admin';
import { ErrorBanner } from '@/components/ErrorBanner';

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
  const [deleting, setDeleting] = useState<string | null>(null);

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

  const handleRemove = async (ent: EntitlementRow) => {
    const user = userMap.get(ent.user_id);
    if (!confirm(`Remove access for "${user?.full_name ?? 'this user'}"?`)) return;
    setDeleting(ent.id);
    try {
      await deleteEntitlement(ent.id);
      setEntitlements((prev) => prev.filter((e) => e.id !== ent.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Loading entitlements…</div>;

  return (
    <div>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {entitlements.length === 0 && !showForm && (
        <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>No PM Users assigned. Only PM Admins can see this building.</p>
      )}

      {entitlements.map((ent) => {
        const user = userMap.get(ent.user_id);
        return (
          <div key={ent.id} style={entRow}>
            <div>
              <strong style={{ fontSize: '0.85rem' }}>{user?.full_name ?? 'Unknown user'}</strong>
              <span style={{ fontSize: '0.8rem', color: '#6b7280', marginLeft: '8px' }}>{user?.email ?? ent.user_id}</span>
            </div>
            <button onClick={() => handleRemove(ent)} disabled={deleting === ent.id} style={removeBtn}>
              {deleting === ent.id ? '…' : 'Remove'}
            </button>
          </div>
        );
      })}

      {!showForm ? (
        availableUsers.length > 0 && (
          <button onClick={() => setShowForm(true)} style={addBtn}>+ Assign PM User</button>
        )
      ) : (
        <form onSubmit={handleAdd} style={formStyle}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>PM User</label>
              <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} required style={inp}>
                <option value="">Select a PM User…</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={submitting || !selectedUser} className="btn btn-primary" style={{ width: 'auto', padding: '6px 14px', fontSize: '0.8rem' }}>
              {submitting ? '…' : 'Assign'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={{ ...removeBtn, color: '#6b7280' }}>Cancel</button>
          </div>
        </form>
      )}

      {availableUsers.length === 0 && companyUsers.length > 0 && !showForm && entitlements.length > 0 && (
        <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '4px' }}>All PM Users are already assigned.</p>
      )}
      {companyUsers.length === 0 && (
        <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '4px' }}>No PM Users exist in this company yet. Invite one first.</p>
      )}
    </div>
  );
}

const entRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#f9fafb', borderRadius: '6px', marginBottom: '4px' };
const removeBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem' };
const addBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.85rem', padding: '4px 0', marginTop: '6px' };
const formStyle: React.CSSProperties = { padding: '10px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb', marginTop: '8px' };
const lbl: React.CSSProperties = { display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '2px' };
const inp: React.CSSProperties = { width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.85rem' };
