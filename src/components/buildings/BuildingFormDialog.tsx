// =============================================================================
// PlumbTix — Building Form Dialog (react-hook-form + Zod)
// =============================================================================
// Modal form for creating/editing buildings.
//
// Props:
//   open / onOpenChange — Dialog visibility control
//   buildingId          — If set, loads existing building for edit
//   companyId           — For create mode: the owning company
//   onSaved             — Called after successful save (caller should refresh list)
// =============================================================================

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { BuildingSchema, type BuildingFormValues } from '@/lib/schemas';
import {
  fetchBuildingDetail,
  createBuilding,
  updateBuilding,
  type BuildingDetailRow,
} from '@/lib/buildings';
import { fetchCompanyOptions, type CompanyOption } from '@/lib/admin';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, MapPin, Lock } from 'lucide-react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BuildingFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing building ID for edit mode */
  buildingId?: string | null;
  /** Company ID for create mode (optional — pm_admin auto-resolves) */
  companyId?: string | null;
  /** Called after successful create or update */
  onSaved: () => void;
}

// ---------------------------------------------------------------------------
// Reusable field wrapper
// ---------------------------------------------------------------------------

function FormField({
  id,
  label,
  required,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
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
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BuildingFormDialog({
  open,
  onOpenChange,
  buildingId,
  companyId: propCompanyId,
  onSaved,
}: BuildingFormDialogProps) {
  const isEdit = !!buildingId;
  const { role, companyId: authCompanyId } = useAuth();
  const { toast } = useToast();
  const isProrotoAdmin = role === 'proroto_admin';

  // Resolve companyId: prop > auth context
  const resolvedCompanyId = propCompanyId || authCompanyId;

  // Company picker state (proroto_admin only, create mode only)
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(
    resolvedCompanyId ?? ''
  );

  // Loading/error state for edit mode
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // react-hook-form
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isValid },
  } = useForm<BuildingFormValues>({
    resolver: zodResolver(BuildingSchema),
    mode: 'onTouched',
    defaultValues: {
      name: '',
      address_line1: '',
      address_line2: '',
      city: '',
      state: '',
      zip: '',
      gate_code: '',
      water_shutoff_location: '',
      gas_shutoff_location: '',
      onsite_contact_name: '',
      onsite_contact_phone: '',
      access_notes: '',
    },
  });

  // Load companies for proroto_admin in create mode
  useEffect(() => {
    if (!open || isEdit || !isProrotoAdmin || resolvedCompanyId) return;
    let cancelled = false;
    setCompaniesLoading(true);
    fetchCompanyOptions()
      .then((list) => {
        if (!cancelled) {
          setCompanies(list);
          if (list.length === 1) setSelectedCompanyId(list[0].id);
        }
      })
      .catch(() => setError('Failed to load companies'))
      .finally(() => {
        if (!cancelled) setCompaniesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isEdit, isProrotoAdmin, resolvedCompanyId]);

  // Load existing building in edit mode
  useEffect(() => {
    if (!open || !buildingId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchBuildingDetail(buildingId)
      .then((b: BuildingDetailRow) => {
        if (cancelled) return;
        reset({
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
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, buildingId, reset]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      reset();
      setError(null);
      setSelectedCompanyId(resolvedCompanyId ?? '');
    }
  }, [open, reset, resolvedCompanyId]);

  // Submit handler
  const onSubmit = async (data: BuildingFormValues) => {
    setError(null);
    try {
      if (isEdit) {
        await updateBuilding(buildingId!, data);
        toast('Building updated successfully');
      } else {
        const targetCompany = resolvedCompanyId || selectedCompanyId;
        if (!targetCompany) {
          setError('Please select a company');
          return;
        }
        await createBuilding(targetCompany, data);
        toast('Building created successfully');
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save building';
      setError(msg);
      toast(msg, 'error');
    }
  };

  // Determine if the form can be submitted
  const needsCompanyPick =
    !isEdit && isProrotoAdmin && !resolvedCompanyId && !selectedCompanyId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit Building' : 'New Building'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the building address and site access details.'
              : 'Add a new building to manage spaces and tickets.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          </div>
        ) : (
          <form
            id="building-form"
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-5 py-2"
          >
            <ErrorBanner message={error} onDismiss={() => setError(null)} />

            {/* Company picker — proroto_admin create only */}
            {!isEdit && isProrotoAdmin && !resolvedCompanyId && (
              <FormField
                id="company"
                label="Company"
                required
                error={
                  needsCompanyPick ? 'Select a company' : undefined
                }
              >
                {companiesLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <select
                    id="company"
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">Select company…</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            )}

            {/* ── Address Section ── */}
            <div>
              <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Address
              </div>
              <div className="space-y-3">
                <FormField
                  id="name"
                  label="Building Name"
                  hint="Optional — e.g. Sunset Terrace Apartments"
                >
                  <Input
                    id="name"
                    placeholder="e.g. Sunset Terrace Apartments"
                    {...register('name')}
                  />
                </FormField>

                <FormField
                  id="address_line1"
                  label="Address Line 1"
                  required
                  error={errors.address_line1?.message}
                >
                  <Input
                    id="address_line1"
                    placeholder="123 Main Street"
                    className={
                      errors.address_line1 ? 'border-destructive' : ''
                    }
                    {...register('address_line1')}
                  />
                </FormField>

                <FormField id="address_line2" label="Address Line 2">
                  <Input
                    id="address_line2"
                    placeholder="Suite, Floor, etc."
                    {...register('address_line2')}
                  />
                </FormField>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <FormField
                    id="city"
                    label="City"
                    required
                    error={errors.city?.message}
                  >
                    <Input
                      id="city"
                      className={errors.city ? 'border-destructive' : ''}
                      {...register('city')}
                    />
                  </FormField>

                  <FormField
                    id="state"
                    label="State"
                    required
                    error={errors.state?.message}
                  >
                    <Input
                      id="state"
                      maxLength={2}
                      placeholder="CA"
                      className={`uppercase ${errors.state ? 'border-destructive' : ''}`}
                      {...register('state')}
                    />
                  </FormField>

                  <FormField
                    id="zip"
                    label="ZIP"
                    required
                    error={errors.zip?.message}
                  >
                    <Input
                      id="zip"
                      maxLength={10}
                      placeholder="94025"
                      className={errors.zip ? 'border-destructive' : ''}
                      {...register('zip')}
                    />
                  </FormField>
                </div>
              </div>
            </div>

            {/* ── Site Access Section ── */}
            <div>
              <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
                <Lock className="h-4 w-4 text-muted-foreground" />
                Site Access
                <span className="font-normal text-muted-foreground text-xs">
                  — visible to admins only
                </span>
              </div>
              <div className="space-y-3">
                <FormField id="gate_code" label="Gate Code">
                  <Input
                    id="gate_code"
                    placeholder="e.g. #4321"
                    {...register('gate_code')}
                  />
                </FormField>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField
                    id="water_shutoff_location"
                    label="Water Shutoff Location"
                  >
                    <Input
                      id="water_shutoff_location"
                      {...register('water_shutoff_location')}
                    />
                  </FormField>
                  <FormField
                    id="gas_shutoff_location"
                    label="Gas Shutoff Location"
                  >
                    <Input
                      id="gas_shutoff_location"
                      {...register('gas_shutoff_location')}
                    />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField
                    id="onsite_contact_name"
                    label="Onsite Contact Name"
                  >
                    <Input
                      id="onsite_contact_name"
                      {...register('onsite_contact_name')}
                    />
                  </FormField>
                  <FormField
                    id="onsite_contact_phone"
                    label="Onsite Contact Phone"
                    error={errors.onsite_contact_phone?.message}
                  >
                    <Input
                      id="onsite_contact_phone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      className={
                        errors.onsite_contact_phone
                          ? 'border-destructive'
                          : ''
                      }
                      {...register('onsite_contact_phone')}
                    />
                  </FormField>
                </div>

                <FormField id="access_notes" label="Access Notes">
                  <Textarea
                    id="access_notes"
                    rows={3}
                    placeholder="Parking, entry instructions, key box location, etc."
                    {...register('access_notes')}
                  />
                </FormField>
              </div>
            </div>
          </form>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="building-form"
            disabled={!isValid || isSubmitting || loading || needsCompanyPick}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : isEdit ? (
              'Save Changes'
            ) : (
              'Add Building'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
