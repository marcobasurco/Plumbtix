import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCompanyList, createCompany, type CompanyListRow } from '@/lib/admin';
import { Loading } from '@/components/Loading';
import { ErrorBanner } from '@/components/ErrorBanner';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function CompanyList() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<CompanyListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setCompanies(await fetchCompanyList()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slugTouched) setSlug(toSlug(val));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimName = name.trim();
    const trimSlug = slug.trim();

    if (!trimName) { setFormError('Company name is required'); return; }
    if (!trimSlug) { setFormError('Slug is required'); return; }
    if (!SLUG_REGEX.test(trimSlug)) {
      setFormError('Slug must be lowercase letters, numbers, and hyphens only');
      return;
    }

    setSubmitting(true);
    try {
      const created = await createCompany(trimName, trimSlug);
      setCompanies((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setName(''); setSlug(''); setSlugTouched(false); setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create company');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Companies</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary"
            style={{ width: 'auto', padding: '8px 20px', fontSize: '0.9rem' }}
          >
            + Add Company
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={formStyle}>
          <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>New Company</h3>
          <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />
          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>Company Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Acme Property Management"
              required
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Slug *</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
              placeholder="acme-property"
              required
              style={inputStyle}
            />
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>
              Lowercase letters, numbers, and hyphens only. Auto-generated from name.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" disabled={submitting} className="btn btn-primary" style={{ width: 'auto', padding: '8px 24px', fontSize: '0.85rem' }}>
              {submitting ? 'Creating…' : 'Create Company'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setFormError(null); setName(''); setSlug(''); setSlugTouched(false); }} style={cancelBtnStyle}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {loading ? <Loading message="Loading companies…" /> : companies.length === 0 ? (
        <div style={emptyStyle}>
          <p>No companies found.</p>
          <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Add your first property management company to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
          {companies.map((c) => (
            <div
              key={c.id}
              onClick={() => navigate(`companies/${c.id}`)}
              style={cardStyle}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#2563eb'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb'; }}
            >
              <strong style={{ fontSize: '0.95rem' }}>{c.name}</strong>
              <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>slug: {c.slug}</div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.8rem', color: '#6b7280' }}>
                <span>{c.building_count} building{c.building_count !== 1 ? 's' : ''}</span>
                <span>{c.user_count} user{c.user_count !== 1 ? 's' : ''}</span>
                <span>Created {formatDate(c.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const emptyStyle: React.CSSProperties = { textAlign: 'center', padding: '48px 24px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb', color: '#6b7280' };
const cardStyle: React.CSSProperties = { padding: '16px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', cursor: 'pointer', transition: 'border-color 0.15s' };
const formStyle: React.CSSProperties = { padding: '16px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '16px' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' };
const cancelBtnStyle: React.CSSProperties = { padding: '8px 16px', fontSize: '0.85rem', background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' };
