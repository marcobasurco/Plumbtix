import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  fetchBuildingDetail,
  createBuilding,
  updateBuilding,
  type BuildingFormData,
} from '@/lib/buildings';
import { useAuth } from '@/lib/auth';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Loading } from '@/components/Loading';
import { PageTransition } from '@/components/PageTransition';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, Plus, MapPin, Lock, Loader2 } from 'lucide-react';
import { useToast } from '@/components/Toast';

const EMPTY_FORM: BuildingFormData = {
  name: '', address_line1: '', address_line2: '', city: '', state: '', zip: '',
  gate_code: '', water_shutoff_location: '', gas_shutoff_location: '',
  onsite_contact_name: '', onsite_contact_phone: '', access_notes: '',
};

// ---------------------------------------------------------------------------
// Validation matching DB constraints
// ---------------------------------------------------------------------------

interface FieldError {
  address_line1?: string;
  city?: string;
  state?: string;
  zip?: string;
  onsite_contact_phone?: string;
}

function validateForm(form: BuildingFormData): FieldError {
  const errors: FieldError = {};

  if (!form.address_line1.trim()) errors.address_line1 = 'Address is required';
  if (!form.city.trim()) errors.city = 'City is required';

  if (!form.state.trim()) {
    errors.state = 'State is required';
  } else if (!/^[A-Za-z]{2}$/.test(form.state.trim())) {
    errors.state = 'Must be 2 letters (e.g. CA)';
  }

  if (!form.zip.trim()) {
    errors.zip = 'ZIP is required';
  } else if (!/^\d{5}(-\d{4})?$/.test(form.zip.trim())) {
    errors.zip = 'Must be 5 digits (or 12345-6789)';
  }

  if (form.onsite_contact_phone.trim()) {
    const cleaned = form.onsite_contact_phone.replace(/[\s\-().+]/g, '');
    if (!/^\d{7,15}$/.test(cleaned)) {
      errors.onsite_contact_phone = 'Invalid phone format';
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Field component with error display
// ---------------------------------------------------------------------------

function FormField({
  id, label, required, error, hint, children,
}: {
  id: string; label: string; required?: boolean; error?: string; hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BuildingForm component
// ---------------------------------------------------------------------------

export function BuildingForm() {
  const { buildingId, companyId: routeCompanyId } = useParams<{
    buildingId: string;
    companyId: string;
  }>();
  const [searchParams] = useSearchParams();
  const isEdit = !!buildingId;
  const navigate = useNavigate();
  const { companyId: authCompanyId, role } = useAuth();
  const { toast } = useToast();

  // Company ID: route param > query param (?companyId=) > auth context
  const targetCompanyId = routeCompanyId || searchParams.get('companyId') || authCompanyId;

  const [form, setForm] = useState<BuildingFormData>(EMPTY_FORM);
  const [touched, setTouched] = useState<Set<string>>(new Set());
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

  const update = (field: keyof BuildingFormData, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const touch = (field: string) => {
    setTouched((prev) => new Set(prev).add(field));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // Mark all fields as touched to show errors
    const allFields: (keyof FieldError)[] = ['address_line1', 'city', 'state', 'zip', 'onsite_contact_phone'];
    setTouched(new Set(allFields));

    const errors = validateForm(form);
    if (Object.keys(errors).length > 0) return;

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
      <PageTransition>
        <button type="button" className="back-link" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </button>
        <ErrorBanner message="No company context. Go to Companies → select a company → Add Building." />
      </PageTransition>
    );
  }

  const errors = validateForm(form);
  const formValid = Object.keys(errors).length === 0;
  const showError = (field: keyof FieldError) =>
    touched.has(field) ? errors[field] : undefined;

  return (
    <PageTransition className="max-w-2xl">
      <button type="button" className="back-link" onClick={() => navigate(-1)}>
        <ChevronLeft className="h-3.5 w-3.5" /> Back
      </button>

      <h2 className="text-xl font-bold tracking-tight mb-5">
        {isEdit ? 'Edit Building' : 'New Building'}
      </h2>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Address section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Address
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField id="name" label="Building Name" hint="Optional — e.g. Sunset Terrace Apartments">
              <Input
                id="name"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="e.g. Sunset Terrace Apartments"
              />
            </FormField>

            <FormField id="addr1" label="Address Line 1" required error={showError('address_line1')}>
              <Input
                id="addr1"
                value={form.address_line1}
                onChange={(e) => update('address_line1', e.target.value)}
                onBlur={() => touch('address_line1')}
                placeholder="123 Main Street"
                className={showError('address_line1') ? 'border-destructive' : ''}
              />
            </FormField>

            <FormField id="addr2" label="Address Line 2">
              <Input
                id="addr2"
                value={form.address_line2}
                onChange={(e) => update('address_line2', e.target.value)}
                placeholder="Suite, Floor, etc."
              />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField id="city" label="City" required error={showError('city')}>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => update('city', e.target.value)}
                  onBlur={() => touch('city')}
                  className={showError('city') ? 'border-destructive' : ''}
                />
              </FormField>
              <FormField id="state" label="State" required error={showError('state')}>
                <Input
                  id="state"
                  value={form.state}
                  onChange={(e) => update('state', e.target.value.toUpperCase())}
                  onBlur={() => touch('state')}
                  maxLength={2}
                  placeholder="CA"
                  className={`uppercase ${showError('state') ? 'border-destructive' : ''}`}
                />
              </FormField>
              <FormField id="zip" label="ZIP" required error={showError('zip')}>
                <Input
                  id="zip"
                  value={form.zip}
                  onChange={(e) => update('zip', e.target.value)}
                  onBlur={() => touch('zip')}
                  maxLength={10}
                  placeholder="94025"
                  className={showError('zip') ? 'border-destructive' : ''}
                />
              </FormField>
            </div>
          </CardContent>
        </Card>

        {/* Site access section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Site Access
              <span className="font-normal text-muted-foreground">— visible to admins only</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField id="gate" label="Gate Code">
              <Input
                id="gate"
                value={form.gate_code}
                onChange={(e) => update('gate_code', e.target.value)}
                placeholder="e.g. #4321"
              />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField id="water" label="Water Shutoff Location">
                <Input
                  id="water"
                  value={form.water_shutoff_location}
                  onChange={(e) => update('water_shutoff_location', e.target.value)}
                />
              </FormField>
              <FormField id="gas" label="Gas Shutoff Location">
                <Input
                  id="gas"
                  value={form.gas_shutoff_location}
                  onChange={(e) => update('gas_shutoff_location', e.target.value)}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField id="contact" label="Onsite Contact Name">
                <Input
                  id="contact"
                  value={form.onsite_contact_name}
                  onChange={(e) => update('onsite_contact_name', e.target.value)}
                />
              </FormField>
              <FormField id="contactPhone" label="Onsite Contact Phone" error={showError('onsite_contact_phone')}>
                <Input
                  id="contactPhone"
                  type="tel"
                  value={form.onsite_contact_phone}
                  onChange={(e) => update('onsite_contact_phone', e.target.value)}
                  onBlur={() => touch('onsite_contact_phone')}
                  placeholder="(555) 123-4567"
                  className={showError('onsite_contact_phone') ? 'border-destructive' : ''}
                />
              </FormField>
            </div>

            <FormField id="notes" label="Access Notes">
              <Textarea
                id="notes"
                rows={3}
                value={form.access_notes}
                onChange={(e) => update('access_notes', e.target.value)}
                placeholder="Parking, entry instructions, key box location, etc."
              />
            </FormField>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="submit"
            size="lg"
            disabled={submitting || !formValid}
            className="flex-1"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : isEdit ? (
              'Save Changes'
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Add Building
              </>
            )}
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </form>
    </PageTransition>
  );
}
