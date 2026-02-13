// =============================================================================
// Work Orders — Space Form (react-hook-form + Zod)
// =============================================================================
// Inline form for adding/editing spaces within BuildingDetail.
// Uses Zod conditional validation: unit requires unit_number,
// common_area requires common_area_type.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SpaceSchema, type SpaceFormValues } from '@/lib/schemas';
import { COMMON_AREA_TYPES, COMMON_AREA_LABELS } from '@shared/types/enums';
import {
  createSpace,
  updateSpace,
  fetchSpaces,
  type SpaceFormData,
  type SpaceRow,
} from '@/lib/buildings';
import { toast } from 'sonner';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SpaceFormProps {
  buildingId: string;
  editSpace?: SpaceRow | null;
  onSaved: () => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SpaceForm({ buildingId, editSpace, onSaved, onCancel }: SpaceFormProps) {
  const isEdit = !!editSpace;

  const [error, setError] = useState<string | null>(null);
  const [existingUnits, setExistingUnits] = useState<string[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  // react-hook-form
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError: setFieldError,
    clearErrors,
    reset,
    formState: { errors, isSubmitting, isValid },
  } = useForm<SpaceFormValues>({
    resolver: zodResolver(SpaceSchema),
    mode: 'onTouched',
    defaultValues: {
      space_type: 'unit',
      unit_number: '',
      common_area_type: '',
      floor: '',
      bedrooms: '',
      bathrooms: '',
    },
  });

  const spaceType = watch('space_type');
  const unitNumber = watch('unit_number');

  // Load existing units for duplicate detection
  useEffect(() => {
    fetchSpaces(buildingId).then((spaces) => {
      const units = spaces
        .filter((s) => s.space_type === 'unit' && s.unit_number)
        .filter((s) => !editSpace || s.id !== editSpace.id)
        .map((s) => s.unit_number!.toLowerCase());
      setExistingUnits(units);
    });
  }, [buildingId, editSpace]);

  // Populate form when editing
  useEffect(() => {
    if (!editSpace) {
      reset({
        space_type: 'unit',
        unit_number: '',
        common_area_type: '',
        floor: '',
        bedrooms: '',
        bathrooms: '',
      });
      return;
    }
    reset({
      space_type: editSpace.space_type as 'unit' | 'common_area',
      unit_number: editSpace.unit_number ?? '',
      common_area_type: editSpace.common_area_type ?? '',
      floor: editSpace.floor?.toString() ?? '',
      bedrooms: editSpace.bedrooms?.toString() ?? '',
      bathrooms: editSpace.bathrooms?.toString() ?? '',
    });
  }, [editSpace, reset]);

  // Duplicate unit number check
  useEffect(() => {
    if (spaceType === 'unit' && unitNumber.trim()) {
      const isDuplicate = existingUnits.includes(unitNumber.trim().toLowerCase());
      setDuplicateWarning(isDuplicate);
      if (isDuplicate) {
        setFieldError('unit_number', {
          type: 'manual',
          message: `Unit "${unitNumber.trim()}" already exists in this building.`,
        });
      } else {
        clearErrors('unit_number');
      }
    } else {
      setDuplicateWarning(false);
    }
  }, [unitNumber, spaceType, existingUnits, setFieldError, clearErrors]);

  // Submit
  const onSubmit: SubmitHandler<SpaceFormValues> = useCallback(
    async (data) => {
      if (duplicateWarning) return;
      setError(null);

      // Cast to the API type
      const formData: SpaceFormData = {
        space_type: data.space_type,
        unit_number: data.unit_number,
        common_area_type: data.common_area_type as SpaceFormData['common_area_type'],
        floor: data.floor,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
      };

      try {
        if (isEdit) {
          await updateSpace(editSpace!.id, formData);
          toast.success('Space updated');
        } else {
          await createSpace(buildingId, formData);
          toast.success('Space created');
        }
        onSaved();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save space';
        setError(msg);
        toast.error(msg);
      }
    },
    [isEdit, editSpace, buildingId, duplicateWarning, onSaved, toast],
  );

  // Type toggle handler
  const handleTypeChange = (type: 'unit' | 'common_area') => {
    if (isEdit) return;
    setValue('space_type', type, { shouldValidate: true });
    // Clear cross-type fields
    if (type === 'unit') {
      setValue('common_area_type', '');
    } else {
      setValue('unit_number', '');
      setValue('bedrooms', '');
      setValue('bathrooms', '');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold">
          {isEdit ? 'Edit Space' : 'Add Space'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ErrorBanner message={error} onDismiss={() => setError(null)} />

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Type toggle */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Type <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={spaceType === 'unit' ? 'default' : 'outline'}
                size="sm"
                disabled={isEdit}
                onClick={() => handleTypeChange('unit')}
              >
                Unit
              </Button>
              <Button
                type="button"
                variant={spaceType === 'common_area' ? 'default' : 'outline'}
                size="sm"
                disabled={isEdit}
                onClick={() => handleTypeChange('common_area')}
              >
                Common Area
              </Button>
            </div>
          </div>

          {spaceType === 'unit' ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="unitNum">
                  Unit Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="unitNum"
                  placeholder="e.g. 101, A2, PH-1"
                  className={
                    errors.unit_number || duplicateWarning
                      ? 'border-destructive'
                      : ''
                  }
                  {...register('unit_number')}
                />
                {errors.unit_number && (
                  <p className="text-xs text-destructive">
                    {errors.unit_number.message}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="beds">Bedrooms</Label>
                  <Input
                    id="beds"
                    type="number"
                    min="0"
                    {...register('bedrooms')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="baths">Bathrooms</Label>
                  <Input
                    id="baths"
                    type="number"
                    min="0"
                    step="0.5"
                    {...register('bathrooms')}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="caType">
                Area Type <span className="text-destructive">*</span>
              </Label>
              <select
                id="caType"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                {...register('common_area_type')}
              >
                <option value="">Select type…</option>
                {COMMON_AREA_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {COMMON_AREA_LABELS[t]}
                  </option>
                ))}
              </select>
              {errors.common_area_type && (
                <p className="text-xs text-destructive">
                  {errors.common_area_type.message}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="floor">Floor</Label>
            <Input
              id="floor"
              type="number"
              placeholder="e.g. 1, 2, -1"
              {...register('floor')}
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={isSubmitting || !isValid || duplicateWarning}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : isEdit ? (
                'Save'
              ) : (
                'Add Space'
              )}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
