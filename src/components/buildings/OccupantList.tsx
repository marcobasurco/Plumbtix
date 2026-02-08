import { useEffect, useState, useCallback, type FormEvent } from 'react';
import {
  fetchOccupants,
  createOccupant,
  deleteOccupant,
  type OccupantRow,
  type OccupantFormData,
} from '@/lib/buildings';
import { ErrorBanner } from '@/components/ErrorBanner';

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
  const [deleting, setDeleting] = useState<string | null>(null);

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

  const handleDelete = async (occ: OccupantRow) => {
    if (!confirm(`Remove "${occ.name}" from ${spaceLabel}?`)) return;
    setDeleting(occ.id);
    try {
      await deleteOccupant(occ.id);
      setOccupants((prev) => prev.filter((o) => o.id !== occ.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <div style={{ fontSize: '0.8rem', color: '#9ca3af', padding: '4px 0' }}>Loading…</div>;

  return (
    <div style={{ marginTop: '4px' }}>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {occupants.length === 0 && !showForm && (
        <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>No occupants</span>
      )}

      {occupants.map((occ) => (
        <div key={occ.id} style={occRow}>
          <div>
            <strong style={{ fontSize: '0.85rem' }}>{occ.name}</strong>
            <span style={occTypeBadge}>{occ.occupant_type}</span>
            {occ.claimed_at && <span style={claimedBadge}>✓ claimed</span>}
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              {occ.email}{occ.phone && ` · ${occ.phone}`}
            </div>
            {occ.invite_token && !occ.claimed_at && (
              <div style={{ fontSize: '0.7rem', color: '#2563eb', marginTop: '2px' }}>
                Claim URL: {window.location.origin}/claim-account?token={occ.invite_token}
              </div>
            )}
          </div>
          {canWrite && (
            <button
              onClick={() => handleDelete(occ)}
              disabled={deleting === occ.id}
              style={delBtn}
            >
              {deleting === occ.id ? '…' : '✕'}
            </button>
          )}
        </div>
      ))}

      {canWrite && !showForm && (
        <button onClick={() => setShowForm(true)} style={addBtn}>+ Add Occupant</button>
      )}

      {showForm && (
        <form onSubmit={handleCreate} style={formStyle}>
          <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <div>
              <label style={lbl}>Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required style={inp} placeholder="Jane Smith" />
            </div>
            <div>
              <label style={lbl}>Email *</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inp} placeholder="jane@example.com" />
            </div>
            <div>
              <label style={lbl}>Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={inp} placeholder="(555) 123-4567" />
            </div>
            <div>
              <label style={lbl}>Type</label>
              <select value={occType} onChange={(e) => setOccType(e.target.value as 'homeowner' | 'tenant')} style={inp}>
                <option value="tenant">Tenant</option>
                <option value="homeowner">Homeowner</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="submit" disabled={submitting} className="btn btn-primary" style={{ width: 'auto', padding: '4px 14px', fontSize: '0.8rem' }}>
              {submitting ? 'Adding…' : 'Add'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setFormError(null); }} style={{ ...addBtn, marginTop: 0 }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

const occRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 8px', background: '#fafafa', borderRadius: '4px', marginBottom: '4px', fontSize: '0.85rem' };
const occTypeBadge: React.CSSProperties = { marginLeft: '6px', fontSize: '0.7rem', padding: '1px 6px', borderRadius: '8px', background: '#e5e7eb', color: '#374151' };
const claimedBadge: React.CSSProperties = { marginLeft: '4px', fontSize: '0.7rem', color: '#059669' };
const delBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.85rem', padding: '2px 6px' };
const addBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.8rem', padding: '2px 0', marginTop: '4px' };
const formStyle: React.CSSProperties = { padding: '10px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb', marginTop: '6px' };
const lbl: React.CSSProperties = { display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '2px' };
const inp: React.CSSProperties = { width: '100%', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.8rem', boxSizing: 'border-box' };
