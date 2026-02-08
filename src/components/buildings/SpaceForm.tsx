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
    <div className="form-card animate-in" style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--slate-700)', marginBottom: 16 }}>
        {isEdit ? 'Edit Space' : 'Add Space'}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <form onSubmit={handleSubmit}>
        {/* Type toggle */}
        <div className="form-group">
          <label className="form-label">Type *</label>
          <div className="radio-group">
            <button type="button"
              className={`radio-btn ${form.space_type === 'unit' ? 'active' : ''}`}
              onClick={() => !isEdit && update('space_type', 'unit')}
              disabled={isEdit}>
              Unit
            </button>
            <button type="button"
              className={`radio-btn ${form.space_type === 'common_area' ? 'active' : ''}`}
              onClick={() => !isEdit && update('space_type', 'common_area')}
              disabled={isEdit}>
              Common Area
            </button>
          </div>
        </div>

        {form.space_type === 'unit' ? (
          <>
            <div className="form-group">
              <label className="form-label" htmlFor="unitNum">Unit Number *</label>
              <input id="unitNum" type="text" className="form-input" value={form.unit_number}
                onChange={(e) => update('unit_number', e.target.value)}
                placeholder="e.g. 101, A2, PH-1" required />
              {duplicateWarning && (
                <p className="form-error-text">Unit "{form.unit_number.trim()}" already exists in this building.</p>
              )}
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label" htmlFor="beds">Bedrooms</label>
                <input id="beds" type="number" min="0" className="form-input" value={form.bedrooms}
                  onChange={(e) => update('bedrooms', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="baths">Bathrooms</label>
                <input id="baths" type="number" min="0" step="0.5" className="form-input" value={form.bathrooms}
                  onChange={(e) => update('bathrooms', e.target.value)} />
              </div>
            </div>
          </>
        ) : (
          <div className="form-group">
            <label className="form-label" htmlFor="caType">Area Type *</label>
            <select id="caType" className="form-select" value={form.common_area_type}
              onChange={(e) => update('common_area_type', e.target.value)} required>
              <option value="">Select type…</option>
              {COMMON_AREA_TYPES.map((t) => (
                <option key={t} value={t}>{COMMON_AREA_LABELS[t]}</option>
              ))}
            </select>
          </div>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="floor">Floor</label>
          <input id="floor" type="number" className="form-input" value={form.floor}
            onChange={(e) => update('floor', e.target.value)} placeholder="e.g. 1, 2, -1" />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={submitting || !isValid()} style={{ flex: 1 }}>
            {submitting ? 'Saving…' : isEdit ? 'Save' : 'Add Space'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
