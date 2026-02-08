import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchBuildingDetail,
  createBuilding,
  updateBuilding,
  type BuildingFormData,
} from '@/lib/buildings';
import { useAuth } from '@/lib/auth';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Loading } from '@/components/Loading';
import { ChevronLeft, Plus, MapPin, Lock } from 'lucide-react';
import { useToast } from '@/components/Toast';

const EMPTY_FORM: BuildingFormData = {
  name: '', address_line1: '', address_line2: '', city: '', state: '', zip: '',
  gate_code: '', water_shutoff_location: '', gas_shutoff_location: '',
  onsite_contact_name: '', onsite_contact_phone: '', access_notes: '',
};

export function BuildingForm() {
  const { buildingId, companyId: routeCompanyId } = useParams<{
    buildingId: string;
    companyId: string;
  }>();
  const isEdit = !!buildingId;
  const navigate = useNavigate();
  const { companyId: authCompanyId, role } = useAuth();
  const { toast } = useToast();

  // Company ID: route param (from /companies/:companyId/buildings/new) > auth context
  const targetCompanyId = routeCompanyId || authCompanyId;

  const [form, setForm] = useState<BuildingFormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing building for edit mode
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
          city: b.city, state: b.state, zip: b.zip,
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
        toast('Building updated successfully');
        navigate('..', { replace: true });
      } else {
        if (!targetCompanyId) {
          setError('No company context. Navigate from a Company page to add a building.');
          return;
        }
        const newBuilding = await createBuilding(targetCompanyId, form);
        toast('Building created successfully');
        const basePath = role === 'proroto_admin' ? '/admin' : '/dashboard';
        navigate(`${basePath}/buildings/${newBuilding.id}`, { replace: true });
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

  if (!isEdit && !targetCompanyId) {
    return (
      <div className="animate-in">
        <button type="button" className="back-link" onClick={() => navigate(-1)}>
          <ChevronLeft size={14} />
          Back
        </button>
        <ErrorBanner message="No company context. Go to Companies → select a company → Add Building." />
      </div>
    );
  }

  // Simple validation — required fields have content
  const formValid = !!form.address_line1.trim() && !!form.city.trim()
    && !!form.state.trim() && !!form.zip.trim();

  return (
    <div className="animate-in" style={{ maxWidth: 640 }}>
      <button type="button" className="back-link" onClick={() => navigate(-1)}>
        <ChevronLeft size={14} />
        Back
      </button>

      <h2 className="page-title" style={{ marginBottom: 20 }}>
        {isEdit ? 'Edit Building' : 'New Building'}
      </h2>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <form onSubmit={handleSubmit}>
        {/* Address section */}
        <div className="form-card">
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--slate-700)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={16} />
            Address
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="name">Building Name <span className="text-muted">(optional)</span></label>
            <input id="name" type="text" className="form-input" value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. Sunset Terrace Apartments" />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="addr1">Address Line 1 *</label>
            <input id="addr1" type="text" className="form-input" value={form.address_line1}
              onChange={(e) => update('address_line1', e.target.value)} required
              placeholder="123 Main Street" />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="addr2">Address Line 2</label>
            <input id="addr2" type="text" className="form-input" value={form.address_line2}
              onChange={(e) => update('address_line2', e.target.value)}
              placeholder="Suite, Floor, etc." />
          </div>

          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label" htmlFor="city">City *</label>
              <input id="city" type="text" className="form-input" value={form.city}
                onChange={(e) => update('city', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="state">State *</label>
              <input id="state" type="text" className="form-input" value={form.state}
                onChange={(e) => update('state', e.target.value)} required maxLength={2}
                placeholder="CA" style={{ textTransform: 'uppercase' }} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="zip">ZIP *</label>
              <input id="zip" type="text" className="form-input" value={form.zip}
                onChange={(e) => update('zip', e.target.value)} required maxLength={10}
                placeholder="94025" />
            </div>
          </div>
        </div>

        {/* Site access section */}
        <div className="form-card">
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--slate-700)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lock size={16} />
            Site Access
            <span className="text-muted" style={{ fontWeight: 400 }}>— visible to admins only</span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="gate">Gate Code</label>
            <input id="gate" type="text" className="form-input" value={form.gate_code}
              onChange={(e) => update('gate_code', e.target.value)}
              placeholder="e.g. #4321" />
          </div>

          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label" htmlFor="water">Water Shutoff Location</label>
              <input id="water" type="text" className="form-input" value={form.water_shutoff_location}
                onChange={(e) => update('water_shutoff_location', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="gas">Gas Shutoff Location</label>
              <input id="gas" type="text" className="form-input" value={form.gas_shutoff_location}
                onChange={(e) => update('gas_shutoff_location', e.target.value)} />
            </div>
          </div>

          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label" htmlFor="contact">Onsite Contact Name</label>
              <input id="contact" type="text" className="form-input" value={form.onsite_contact_name}
                onChange={(e) => update('onsite_contact_name', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="contactPhone">Onsite Contact Phone</label>
              <input id="contactPhone" type="tel" className="form-input" value={form.onsite_contact_phone}
                onChange={(e) => update('onsite_contact_phone', e.target.value)}
                placeholder="(555) 123-4567" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="notes">Access Notes</label>
            <textarea id="notes" className="form-textarea" rows={3} value={form.access_notes}
              onChange={(e) => update('access_notes', e.target.value)}
              placeholder="Parking, entry instructions, key box location, etc." />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" className="btn btn-primary btn-lg" disabled={submitting || !formValid} style={{ flex: 1 }}>
            {submitting ? (
              <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Saving…</>
            ) : isEdit ? 'Save Changes' : (
              <>
                <Plus size={16} />
                Add Building
              </>
            )}
          </button>
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => navigate(-1)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
