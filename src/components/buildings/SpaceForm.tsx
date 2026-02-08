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
  space_type: 'unit',
  unit_number: '',
  common_area_type: '',
  floor: '',
  bedrooms: '',
  bathrooms: '',
};

interface SpaceFormProps {
  buildingId: string;
  /** If provided, editing this space */
  editSpace?: SpaceRow | null;
  /** Called after successful save */
  onSaved: () => void;
  /** Called when user cancels */
  onCancel: () => void;
}

export function SpaceForm({ buildingId, editSpace, onSaved, onCancel }: SpaceFormProps) {
  const isEdit = !!editSpace;
  const [form, setForm] = useState<SpaceFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Duplicate unit number check state
  const [existingUnits, setExistingUnits] = useState<string[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  // Load existing spaces for duplicate check
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

  // Check for duplicate unit numbers
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
      if (isEdit) {
        await updateSpace(editSpace!.id, form);
      } else {
        await createSpace(buildingId, form);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save space');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={formWrapper}>
      <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>
        {isEdit ? 'Edit Space' : 'Add Space'}
      </h3>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <form onSubmit={handleSubmit}>
        {/* Space type toggle */}
        <div className="form-group">
          <label>Type *</label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <label style={radioLabel}>
              <input
                type="radio" name="space_type" value="unit"
                checked={form.space_type === 'unit'}
                onChange={() => update('space_type', 'unit')}
                disabled={isEdit} // Can't switch type on edit
              />
              Unit
            </label>
            <label style={radioLabel}>
              <input
                type="radio" name="space_type" value="common_area"
                checked={form.space_type === 'common_area'}
                onChange={() => update('space_type', 'common_area')}
                disabled={isEdit}
              />
              Common Area
            </label>
          </div>
        </div>

        {/* Unit fields */}
        {form.space_type === 'unit' && (
          <>
            <div className="form-group">
              <label htmlFor="unitNum">Unit Number *</label>
              <input
                id="unitNum" type="text" value={form.unit_number}
                onChange={(e) => update('unit_number', e.target.value)}
                placeholder="e.g. 101, A2, PH-1"
                required style={inputStyle}
              />
              {duplicateWarning && (
                <p style={{ color: '#991b1b', fontSize: '0.8rem', marginTop: '4px' }}>
                  Unit "{form.unit_number.trim()}" already exists in this building.
                </p>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label htmlFor="beds">Bedrooms</label>
                <input id="beds" type="number" min="0" value={form.bedrooms} onChange={(e) => update('bedrooms', e.target.value)} style={inputStyle} />
              </div>
              <div className="form-group">
                <label htmlFor="baths">Bathrooms</label>
                <input id="baths" type="number" min="0" step="0.5" value={form.bathrooms} onChange={(e) => update('bathrooms', e.target.value)} style={inputStyle} />
              </div>
            </div>
          </>
        )}

        {/* Common area fields */}
        {form.space_type === 'common_area' && (
          <div className="form-group">
            <label htmlFor="caType">Area Type *</label>
            <select
              id="caType" value={form.common_area_type}
              onChange={(e) => update('common_area_type', e.target.value)}
              required style={inputStyle}
            >
              <option value="">Select type…</option>
              {COMMON_AREA_TYPES.map((t) => (
                <option key={t} value={t}>{COMMON_AREA_LABELS[t]}</option>
              ))}
            </select>
          </div>
        )}

        {/* Shared: floor */}
        <div className="form-group">
          <label htmlFor="floor">Floor</label>
          <input id="floor" type="number" value={form.floor} onChange={(e) => update('floor', e.target.value)} placeholder="e.g. 1, 2, -1 (basement)" style={inputStyle} />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button type="submit" className="btn btn-primary" disabled={submitting || !isValid()} style={{ flex: 1 }}>
            {submitting ? 'Saving…' : isEdit ? 'Save' : 'Add Space'}
          </button>
          <button type="button" onClick={onCancel} style={cancelBtn}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

const formWrapper: React.CSSProperties = {
  padding: '16px', background: '#f9fafb', borderRadius: '8px',
  border: '1px solid #e5e7eb', marginBottom: '16px',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px',
  border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem',
};
const radioLabel: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.9rem', cursor: 'pointer',
};
const cancelBtn: React.CSSProperties = {
  background: 'none', border: '1px solid #d1d5db', borderRadius: '6px',
  padding: '6px 14px', fontSize: '0.85rem', cursor: 'pointer', color: '#374151',
};
