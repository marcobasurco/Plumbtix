import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCompanyList, createCompany, type CompanyListRow } from '@/lib/admin';
import { Loading } from '@/components/Loading';
import { ErrorBanner } from '@/components/ErrorBanner';
import { useToast } from '@/components/Toast';

import { Building2, Users2, Plus } from 'lucide-react';

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

  const [showForm, setShowForm] = useState(false);
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const trimName = name.trim(), trimSlug = slug.trim();
    if (!trimName) { setFormError('Company name is required'); return; }
    if (!trimSlug || !SLUG_REGEX.test(trimSlug)) { setFormError('Slug must be lowercase letters, numbers, and hyphens only'); return; }

    setSubmitting(true);
    try {
      const created = await createCompany(trimName, trimSlug);
      setCompanies((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setName(''); setSlug(''); setSlugTouched(false); setShowForm(false);
      toast('Company created');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-in">
      <div className="page-title-bar">
        <div>
          <h2 className="page-title">Companies</h2>
          <p className="page-subtitle">{companies.length} compan{companies.length !== 1 ? 'ies' : 'y'}</p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary">
            <Plus size={16} /> New Company
          </button>
        )}
      </div>

      {showForm && (
        <div className="form-card animate-in" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--slate-700)', marginBottom: 16 }}>New Company</div>
          <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />
          <form onSubmit={handleSubmit}>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Company Name *</label>
                <input type="text" className="form-input" value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Acme Property Management" required />
              </div>
              <div className="form-group">
                <label className="form-label">Slug *</label>
                <input type="text" className="form-input" value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }} placeholder="acme-property" required />
                <div className="form-hint">Lowercase, numbers, hyphens. Auto-generated.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={submitting} className="btn btn-primary">
                {submitting ? 'Creating…' : 'Create Company'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setFormError(null); setName(''); setSlug(''); setSlugTouched(false); }} className="btn btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {loading ? <Loading message="Loading companies…" /> : companies.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No companies yet</div>
          <div className="empty-state-text">Add your first property management company to get started.</div>
        </div>
      ) : (
        <div className="grid grid-3">
          {companies.map((c, i) => (
            <div key={c.id} className={`card card-interactive animate-in animate-in-delay-${Math.min(i, 3)}`}
              onClick={() => navigate(`companies/${c.id}`)}>
              <div className="card-body">
                <div style={{ fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--slate-900)', marginBottom: 2 }}>{c.name}</div>
                <div className="tag text-mono" style={{ marginBottom: 12 }}>{c.slug}</div>
                <div style={{ display: 'flex', gap: 16, fontSize: 'var(--text-xs)', color: 'var(--slate-500)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Building2 size={18} /> {c.building_count}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Users2 size={14} /> {c.user_count}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--slate-400)' }}>{formatDate(c.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
