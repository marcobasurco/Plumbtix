import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchBuildingDetail,
  createBuilding,
  updateBuilding,
  type BuildingFormData,
} from '@/lib/buildings';
import { useAuth } from '@/lib/auth';
import { fetchCompanyOptions, type CompanyOption } from '@/lib/admin';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Loading } from '@/components/Loading';

const EMPTY_FORM: BuildingFormData = {
  name: '', address_line1: '', address_line2: '', city: '', state: '', zip: '',
  gate_code: '', water_shutoff_location: '', gas_shutoff_location: '',
  onsite_contact_name: '', onsite_contact_phone: '', access_notes: '',
};

export function BuildingForm() {
  const { buildingId } = useParams<{ buildingId: string }>();
  const isEdit = !!buildingId;
  const navigate = useNavigate();
  const { companyId, role } = useAuth();

  const [form, setForm] = useState<BuildingFormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Company picker (proroto_admin picks any; pm_admin auto-scoped)
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [companiesLoading, setCompaniesLoading] = useState(false);

  // Sync selectedCompanyId when auth resolves companyId (useState only reads initial value once)
  useEffect(() => {
    if (companyId && !selectedCompanyId) {
      setSelectedCompanyId(companyId);
    }
  }, [companyId, selectedCompanyId]);

  // Load company options for proroto_admin
  useEffect(() => {
    if (role !== 'proroto_admin' || isEdit) return;
    setCompaniesLoading(true);
    fetchCompanyOptions()
      .then((opts) => {
        setCompanies(opts);
        // Auto-select if only one company exists and nothing selected yet
        setSelectedCompanyId((prev) => {
          if (prev && opts.some((c) => c.id === prev)) return prev;     // already valid
          if (companyId && opts.some((c) => c.id === companyId)) return companyId;
          if (opts.length === 1) return opts[0].id;
          return prev;
        });
      })
      .catch((err) => {
        console.error('[BuildingForm] Failed to load companies:', err);
        setError('Could not load companies. Please refresh the page.');
      })
      .finally(() => setCompaniesLoading(false));
  }, [role, isEdit, companyId]);

  // Load existing building for edit
  useEffect(() => {
    if (!buildingId) return;
    let cancelled = false;
    fetchBuildingDetail(buildingId)
      .then((b) => {
        if (cancelled) return;
        setForm({
          name: b.name ?? '',
          address_line1: b.address_line1,
          address_line2: b.address_line2 ?? '',
          city: b.city,
          state: b.state,
          zip: b.zip,
          gate_code: b.gate_code ?? '',
          water_shutoff_location: b.water_shutoff_location ?? '',
          gas_shutoff_location: b.gas_shutoff_location ?? '',
          onsite_contact_name: b.onsite_contact_name ?? '',
          onsite_contact_phone: b.onsite_contact_phone ?? '',
          access_notes: b.access_notes ?? '',
        });
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [buildingId]);

  const update = (field: keyof BuildingFormData, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (isEdit) {
        await updateBuilding(buildingId!, form);
        navigate(`..`, { replace: true }); // back to building detail
      } else {
        // Determine target company
        const targetCompanyId = role === 'proroto_admin' ? selectedCompanyId : companyId;
        if (!targetCompanyId) {
          setError('Please select a company for this building.');
          setSubmitting(false);
          return;
        }
        const newBuilding = await createBuilding(targetCompanyId, form);
        navigate(`../${newBuilding.id}`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save building');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading message="Loading building…" />;

  const canEdit = role === 'proroto_admin' || role === 'pm_admin';
  if (!canEdit) {
    return <ErrorBanner message="You don't have permission to manage buildings." />;
  }

  return (
    <div style={{ maxWidth: '560px' }}>
      <button type="button" onClick={() => navigate(-1)} style={backLink}>
        ← Back
      </button>

      <h2 style={{ fontSize: '1.15rem', marginBottom: '16px' }}>
        {isEdit ? 'Edit Building' : 'Add Building'}
      </h2>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <form onSubmit={handleSubmit}>
        {/* Company picker — proroto_admin selects, pm_admin sees own company */}
        {!isEdit && (
          role === 'proroto_admin' ? (
            <div className="form-group">
              <label htmlFor="company">Company *</label>
              {companiesLoading ? (
                <div style={{ fontSize: '0.85rem', color: '#6b7280', padding: '8px 0' }}>Loading companies…</div>
              ) : (
                <select
                  id="company"
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  required
                  style={inputStyle}
                >
                  <option value="">Select a company…</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
          ) : companyId ? (
            <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '12px', padding: '8px 12px', background: '#f9fafb', borderRadius: '6px' }}>
              Creating building for your company
            </div>
          ) : null
        )}

        <div className="form-group">
          <label htmlFor="name">Building Name (optional)</label>
          <input id="name" type="text" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Sunset Terrace" style={inputStyle} />
        </div>

        <div className="form-group">
          <label htmlFor="addr1">Address Line 1 *</label>
          <input id="addr1" type="text" value={form.address_line1} onChange={(e) => update('address_line1', e.target.value)} required style={inputStyle} />
        </div>

        <div className="form-group">
          <label htmlFor="addr2">Address Line 2</label>
          <input id="addr2" type="text" value={form.address_line2} onChange={(e) => update('address_line2', e.target.value)} style={inputStyle} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label htmlFor="city">City *</label>
            <input id="city" type="text" value={form.city} onChange={(e) => update('city', e.target.value)} required style={inputStyle} />
          </div>
          <div className="form-group">
            <label htmlFor="state">State *</label>
            <input id="state" type="text" value={form.state} onChange={(e) => update('state', e.target.value)} required maxLength={2} placeholder="CA" style={inputStyle} />
          </div>
          <div className="form-group">
            <label htmlFor="zip">ZIP *</label>
            <input id="zip" type="text" value={form.zip} onChange={(e) => update('zip', e.target.value)} required maxLength={10} style={inputStyle} />
          </div>
        </div>

        <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
        <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '12px', fontWeight: 600 }}>Site Access (admin-visible)</p>

        <div className="form-group">
          <label htmlFor="gate">Gate Code</label>
          <input id="gate" type="text" value={form.gate_code} onChange={(e) => update('gate_code', e.target.value)} style={inputStyle} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label htmlFor="water">Water Shutoff Location</label>
            <input id="water" type="text" value={form.water_shutoff_location} onChange={(e) => update('water_shutoff_location', e.target.value)} style={inputStyle} />
          </div>
          <div className="form-group">
            <label htmlFor="gas">Gas Shutoff Location</label>
            <input id="gas" type="text" value={form.gas_shutoff_location} onChange={(e) => update('gas_shutoff_location', e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label htmlFor="contact">Onsite Contact Name</label>
            <input id="contact" type="text" value={form.onsite_contact_name} onChange={(e) => update('onsite_contact_name', e.target.value)} style={inputStyle} />
          </div>
          <div className="form-group">
            <label htmlFor="contactPhone">Onsite Contact Phone</label>
            <input id="contactPhone" type="tel" value={form.onsite_contact_phone} onChange={(e) => update('onsite_contact_phone', e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="notes">Access Notes</label>
          <textarea id="notes" value={form.access_notes} onChange={(e) => update('access_notes', e.target.value)} rows={3} placeholder="Parking, entry instructions, etc." style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
          <button type="submit" className="btn btn-primary" disabled={submitting || companiesLoading || !form.address_line1.trim() || !form.city.trim() || !form.state.trim() || !form.zip.trim() || (!isEdit && role === 'proroto_admin' && !selectedCompanyId) || (!isEdit && role === 'pm_admin' && !companyId)} style={{ flex: 1 }}>
            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Building'}
          </button>
          <button type="button" onClick={() => navigate(-1)} style={{ ...navBtn, flex: 0 }}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

const backLink: React.CSSProperties = {
  background: 'none', border: 'none', color: '#2563eb',
  cursor: 'pointer', fontSize: '0.85rem', padding: 0, marginBottom: '12px',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem',
};
const navBtn: React.CSSProperties = {
  background: 'none', border: '1px solid #d1d5db', borderRadius: '6px',
  padding: '8px 16px', fontSize: '0.9rem', cursor: 'pointer', color: '#374151',
};
