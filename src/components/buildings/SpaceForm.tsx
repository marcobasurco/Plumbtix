import { useState, useEffect, type FormEvent } from 'react';
import { COMMON_AREA_TYPES, COMMON_AREA_LABELS } from '@shared/types/enums';
import {
  createSpace,
  updateSpace,
  fetchSpaces,
  type SpaceFormData,
  type SpaceRow,
} from '@/lib/buildings';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

const EMPTY_FORM: SpaceFormData = {
  space_type: 'unit', unit_number: '', common_area_type: '',
  floor: '', bedrooms: '', bathrooms: '',
};

interface SpaceFormProps {
  buildingId: string;
  editSpace?: SpaceRow | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function SpaceForm({ buildingId, editSpace, onSaved, onCancel }: SpaceFormProps) {
  const isEdit = !!editSpace;
  const [form, setForm] = useState<SpaceFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingUnits, setExistingUnits] = useState<string[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  useEffect(() => {
    fetchSpaces(buildingId).then((spaces) => {
      const units = spaces
        .filter((s) => s.space_type === 'unit' && s.unit_number)
        .filter((s) => !editSpace || s.id !== editSpace.id)
        .map((s) => s.unit_number!.toLowerCase());
      setExistingUnits(units);
    });
  }, [buildingId, editSpace]);

  useEffect(() => {
    if (!editSpace) { setForm(EMPTY_FORM); return; }
    setForm({
      space_type: editSpace.space_type,
      unit_number: editSpace.unit_number ?? '',
      common_area_type: editSpace.common_area_type ?? '',
      floor: editSpace.floor?.toString() ?? '',
      bedrooms: editSpace.bedrooms?.toString() ?? '',
      bathrooms: editSpace.bathrooms?.toString() ?? '',
    });
  }, [editSpace]);

  useEffect(() => {
    if (form.space_type === 'unit' && form.unit_number.trim()) {
      setDuplicateWarning(existingUnits.includes(form.unit_number.trim().toLowerCase()));
    } else {
      setDuplicateWarning(false);
    }
  }, [form.unit_number, form.space_type, existingUnits]);

  const update = (field: keyof SpaceFormData, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const isValid = (): boolean => {
    if (form.space_type === 'unit') return !!form.unit_number.trim() && !duplicateWarning;
    return !!form.common_area_type;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid()) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit) await updateSpace(editSpace!.id, form);
      else await createSpace(buildingId, form);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save space');
    } finally {
      setSubmitting(false);
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type toggle */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Type <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <button
                type="button"
                className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                  form.space_type === 'unit'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border bg-background'
                } ${isEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                onClick={() => !isEdit && update('space_type', 'unit')}
                disabled={isEdit}
              >
                Unit
              </button>
              <button
                type="button"
                className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                  form.space_type === 'common_area'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border bg-background'
                } ${isEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                onClick={() => !isEdit && update('space_type', 'common_area')}
                disabled={isEdit}
              >
                Common Area
              </button>
            </div>
          </div>

          {form.space_type === 'unit' ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="unitNum">
                  Unit Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="unitNum"
                  value={form.unit_number}
                  onChange={(e) => update('unit_number', e.target.value)}
                  placeholder="e.g. 101, A2, PH-1"
                  className={duplicateWarning ? 'border-destructive' : ''}
                />
                {duplicateWarning && (
                  <p className="text-xs text-destructive">
                    Unit "{form.unit_number.trim()}" already exists in this building.
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
                    value={form.bedrooms}
                    onChange={(e) => update('bedrooms', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="baths">Bathrooms</Label>
                  <Input
                    id="baths"
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.bathrooms}
                    onChange={(e) => update('bathrooms', e.target.value)}
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
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.common_area_type}
                onChange={(e) => update('common_area_type', e.target.value)}
              >
                <option value="">Select type…</option>
                {COMMON_AREA_TYPES.map((t) => (
                  <option key={t} value={t}>{COMMON_AREA_LABELS[t]}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="floor">Floor</Label>
            <Input
              id="floor"
              type="number"
              value={form.floor}
              onChange={(e) => update('floor', e.target.value)}
              placeholder="e.g. 1, 2, -1"
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={submitting || !isValid()}
              className="flex-1"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
              ) : isEdit ? 'Save' : 'Add Space'}
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
