// =============================================================================
// Work Orders — Create Ticket Wizard
// =============================================================================
// 6-step flow:
//   1. Select Building  (PostgREST, RLS-scoped)
//   2. Select Space      (PostgREST, RLS-scoped, filtered by building)
//   3. Select Issue Type  (static from enums)
//   4. Select Severity    (static; auto-suggests from issue type)
//   5. Details + Files    (description, access, scheduling, file picker)
//   6. Confirm → create-ticket Edge Function → upload files → register-attachment
//
// Attachments follow the 2-step pattern:
//   1. Ticket created first → get ticket_id
//   2. Upload each file to Storage: tickets/{ticket_id}/{filename}
//   3. Call register-attachment Edge Function for each
// =============================================================================

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchBuildingOptions,
  fetchSpacesForBuilding,
  ALLOWED_MIME_TYPES,
  type BuildingOption,
  type SpaceOption,
} from '@/lib/tickets';
import { createTicket, registerAttachment } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import { shouldCompress, compressVideo } from '@/lib/videoCompressor';
import {
  ISSUE_TYPES,
  ISSUE_TYPE_LABELS,
  TICKET_SEVERITIES,
  SEVERITY_LABELS,
  COMMON_AREA_LABELS,
} from '@shared/types/enums';
import type { IssueType, TicketSeverity } from '@shared/types/enums';
import { DEFAULT_SEVERITY } from '@shared/types/transitions';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Loading } from '@/components/Loading';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface WizardState {
  buildingId: string;
  spaceId: string;
  issueType: IssueType | '';
  severity: TicketSeverity | '';
  description: string;
  accessInstructions: string;
  schedType: 'asap' | 'preferred_window';
  schedDate: string;
  schedTime: string;
}

interface SelectedFile {
  file: File;
  error: string | null;
}

interface UploadProgress {
  fileName: string;
  status: 'pending' | 'compressing' | 'uploading' | 'registering' | 'done' | 'failed';
  error?: string;
  compressPercent?: number;
  compressInfo?: string;
}

const INITIAL_STATE: WizardState = {
  buildingId: '',
  spaceId: '',
  issueType: '',
  severity: '',
  description: '',
  accessInstructions: '',
  schedType: 'asap',
  schedDate: '',
  schedTime: '',
};

// ── Wizard Component ───────────────────────────────────────────────────────

export function CreateTicketWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [files, setFiles] = useState<SelectedFile[]>([]);

  // Data
  const [buildings, setBuildings] = useState<BuildingOption[]>([]);
  const [spaces, setSpaces] = useState<SpaceOption[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<WizardState>) =>
    setState((s) => ({ ...s, ...patch }));

  // ── Data fetching ────────────────────────────────────────────────────

  useEffect(() => {
    setLoadingData(true);
    fetchBuildingOptions()
      .then(setBuildings)
      .finally(() => setLoadingData(false));
  }, []);

  useEffect(() => {
    if (!state.buildingId) { setSpaces([]); return; }
    setLoadingData(true);
    fetchSpacesForBuilding(state.buildingId)
      .then(setSpaces)
      .finally(() => setLoadingData(false));
  }, [state.buildingId]);

  // Auto-suggest severity when issue type changes
  useEffect(() => {
    if (state.issueType) {
      update({ severity: DEFAULT_SEVERITY[state.issueType] });
    }
  }, [state.issueType]);

  // ── File handling ────────────────────────────────────────────────────

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files ?? []);
    const validated: SelectedFile[] = incoming.map((file) => {
      // Accept any video type (will be compressed to H.264 MP4)
      if (!ALLOWED_MIME_TYPES.includes(file.type as typeof ALLOWED_MIME_TYPES[number]) && !file.type.startsWith('video/')) {
        return { file, error: `Unsupported type: ${file.type || 'unknown'}` };
      }
      return { file, error: null };
    });
    setFiles((prev) => [...prev, ...validated]);
    e.target.value = ''; // allow re-selecting same file
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const validFiles = files.filter((f) => !f.error);

  // ── Navigation ───────────────────────────────────────────────────────

  const canAdvance = (): boolean => {
    switch (step) {
      case 1: return !!state.buildingId;
      case 2: return !!state.spaceId;
      case 3: return !!state.issueType;
      case 4: return !!state.severity;
      case 5: return !!state.description.trim();
      default: return true;
    }
  };

  const goNext = () => { if (canAdvance() && step < 6) setStep(step + 1); };
  const goBack = () => { if (step > 1) setStep(step - 1); };

  // ── Submission ───────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    // 1. Create ticket
    const schedPref = state.schedType === 'asap'
      ? { type: 'asap' as const }
      : {
          type: 'preferred_window' as const,
          preferred_date: state.schedDate || undefined,
          preferred_time: state.schedTime || undefined,
        };

    const result = await createTicket({
      building_id: state.buildingId,
      space_id: state.spaceId,
      issue_type: state.issueType as IssueType,
      severity: state.severity as TicketSeverity,
      description: state.description.trim(),
      access_instructions: state.accessInstructions.trim() || undefined,
      scheduling_preference: schedPref,
    });

    if (!result.ok) {
      setError(result.error.message);
      setSubmitting(false);
      return;
    }

    const ticketId = result.data.ticket.id;

    // 2. Upload files (with video compression)
    if (validFiles.length > 0) {
      const progress: UploadProgress[] = validFiles.map((f) => ({
        fileName: f.file.name,
        status: shouldCompress(f.file) ? 'compressing' : 'pending',
      }));
      setUploadProgress([...progress]);

      let videoIndex = 1;
      for (let i = 0; i < validFiles.length; i++) {
        const sf = validFiles[i];
        let file = sf.file;

        // Compress video (best-effort — falls back to original on mobile)
        if (shouldCompress(file)) {
          progress[i] = { ...progress[i], status: 'compressing', compressPercent: 0 };
          setUploadProgress([...progress]);

          try {
            const result = await compressVideo(file, {
              maxHeight: 720,
              crf: 28,
              preset: 'fast',
              onProgress: (percent) => {
                progress[i] = { ...progress[i], compressPercent: percent };
                setUploadProgress([...progress]);
              },
            });
            const origMB = (result.originalSize / (1024 * 1024)).toFixed(1);
            const compMB = (result.compressedSize / (1024 * 1024)).toFixed(1);
            progress[i] = { ...progress[i], compressInfo: `${origMB} MB → ${compMB} MB` };
            file = result.file;
          } catch {
            // Compression failed (common on mobile) — upload original
          }
        }

        const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const filePath = `tickets/${ticketId}/${safeName}`;

        // Upload to storage
        progress[i] = { ...progress[i], status: 'uploading' };
        setUploadProgress([...progress]);

        const { error: uploadError } = await supabase.storage
          .from('ticket-attachments')
          .upload(filePath, file, { contentType: file.type, upsert: false });

        if (uploadError) {
          progress[i] = { ...progress[i], status: 'failed', error: uploadError.message };
          setUploadProgress([...progress]);
          continue;
        }

        // Register attachment metadata
        progress[i] = { ...progress[i], status: 'registering' };
        setUploadProgress([...progress]);

        const regResult = await registerAttachment({
          ticket_id: ticketId,
          file_path: filePath,
          file_name: shouldCompress(sf.file) ? `video${videoIndex++}.mp4` : sf.file.name,
          file_type: file.type,
          file_size: file.size,
        });

        if (!regResult.ok) {
          progress[i] = { ...progress[i], status: 'failed', error: regResult.error.message };
        } else {
          progress[i] = { ...progress[i], status: 'done' };
        }
        setUploadProgress([...progress]);
      }
    }

    // 3. Redirect to detail page (relative to current dashboard)
    setSubmitting(false);
    navigate(`../${ticketId}`, { replace: true });
  }, [state, validFiles, submitting, navigate]);

  // ── Render helpers ───────────────────────────────────────────────────

  const selectedBuilding = buildings.find((b) => b.id === state.buildingId);
  const selectedSpace = spaces.find((s) => s.id === state.spaceId);

  function spaceLabel(s: SpaceOption): string {
    if (s.space_type === 'unit' && s.unit_number) {
      return `Unit ${s.unit_number}${s.floor != null ? ` (Floor ${s.floor})` : ''}`;
    }
    const label = s.common_area_type
      ? COMMON_AREA_LABELS[s.common_area_type as keyof typeof COMMON_AREA_LABELS] ?? s.common_area_type
      : s.space_type;
    return `${label}${s.floor != null ? ` (Floor ${s.floor})` : ''}`;
  }

  // ── Steps ────────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div>
            <h2 style={stepTitle}>1. Select Building</h2>
            {loadingData ? <Loading message="Loading buildings…" /> : (
              buildings.length === 0 ? (
                <p style={muted}>No buildings available. Ask your admin to add buildings and entitlements.</p>
              ) : (
                <div style={optionGrid}>
                  {buildings.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => { update({ buildingId: b.id, spaceId: '' }); }}
                      style={{
                        ...optionCard,
                        ...(state.buildingId === b.id ? selectedCard : {}),
                      }}
                    >
                      <strong>{b.name || b.address_line1}</strong>
                      {b.name && <div style={optionSub}>{b.address_line1}</div>}
                      <div style={optionSub}>{b.city}</div>
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
        );

      case 2:
        return (
          <div>
            <h2 style={stepTitle}>2. Select Space</h2>
            <p style={muted}>Building: <strong>{selectedBuilding?.name || selectedBuilding?.address_line1}</strong></p>
            {loadingData ? <Loading message="Loading spaces…" /> : (
              spaces.length === 0 ? (
                <p style={muted}>No spaces for this building. Ask your PM to add units or common areas.</p>
              ) : (
                <div style={optionGrid}>
                  {spaces.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => update({ spaceId: s.id })}
                      style={{
                        ...optionCard,
                        ...(state.spaceId === s.id ? selectedCard : {}),
                      }}
                    >
                      <strong>{spaceLabel(s)}</strong>
                      <div style={optionSub}>{s.space_type}</div>
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
        );

      case 3:
        return (
          <div>
            <h2 style={stepTitle}>3. What's the issue?</h2>
            <div style={optionGrid}>
              {ISSUE_TYPES.map((it) => (
                <button
                  key={it}
                  type="button"
                  onClick={() => update({ issueType: it })}
                  style={{
                    ...optionCard,
                    ...(state.issueType === it ? selectedCard : {}),
                  }}
                >
                  <strong>{ISSUE_TYPE_LABELS[it]}</strong>
                </button>
              ))}
            </div>
          </div>
        );

      case 4:
        return (
          <div>
            <h2 style={stepTitle}>4. Severity</h2>
            {state.issueType && (
              <p style={{ ...muted, marginBottom: '12px' }}>
                Suggested based on issue type: <strong>{SEVERITY_LABELS[DEFAULT_SEVERITY[state.issueType as IssueType]]}</strong>
              </p>
            )}
            <div style={optionGrid}>
              {TICKET_SEVERITIES.map((sev) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => update({ severity: sev })}
                  style={{
                    ...optionCard,
                    ...(state.severity === sev ? selectedCard : {}),
                    ...(sev === 'emergency' ? { borderColor: '#fca5a5' } : {}),
                  }}
                >
                  <strong>{SEVERITY_LABELS[sev]}</strong>
                  <div style={optionSub}>
                    {sev === 'emergency' && 'Immediate danger — flooding, gas, sewage'}
                    {sev === 'urgent' && 'Needs attention within 24 hours'}
                    {sev === 'standard' && 'Schedule at next availability'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        );

      case 5:
        return (
          <div>
            <h2 style={stepTitle}>5. Details & Attachments</h2>

            <div className="form-group">
              <label htmlFor="description">Description *</label>
              <textarea
                id="description"
                value={state.description}
                onChange={(e) => update({ description: e.target.value })}
                rows={4}
                placeholder="Describe the issue — what's happening, when did it start, what area is affected?"
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="access">Access Instructions (optional)</label>
              <input
                id="access"
                type="text"
                value={state.accessInstructions}
                onChange={(e) => update({ accessInstructions: e.target.value })}
                placeholder="e.g. Key under mat, ring doorbell, call ahead"
                style={inputStyle}
              />
            </div>

            <div className="form-group">
              <label>Scheduling Preference</label>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
                <label style={radioLabel}>
                  <input type="radio" name="sched" checked={state.schedType === 'asap'} onChange={() => update({ schedType: 'asap' })} />
                  ASAP
                </label>
                <label style={radioLabel}>
                  <input type="radio" name="sched" checked={state.schedType === 'preferred_window'} onChange={() => update({ schedType: 'preferred_window' })} />
                  Preferred window
                </label>
              </div>
              {state.schedType === 'preferred_window' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="date" value={state.schedDate} onChange={(e) => update({ schedDate: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
                  <input type="text" value={state.schedTime} onChange={(e) => update({ schedTime: e.target.value })} placeholder="e.g. morning, 9am-12pm" style={{ ...inputStyle, flex: 1 }} />
                </div>
              )}
            </div>

            {/* File picker */}
            <div className="form-group" style={{ marginTop: '16px' }}>
              <label>Attachments (optional)</label>
              <p style={{ ...muted, fontSize: '0.8rem', marginBottom: '8px' }}>
                Photos, PDFs, or videos — no size limit. Videos are compressed automatically before upload.
              </p>
              <input
                type="file"
                multiple
                accept={ALLOWED_MIME_TYPES.join(',') + ',video/*'}
                onChange={handleFilesSelected}
                style={{ fontSize: '0.85rem' }}
              />
              {files.length > 0 && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {files.map((sf, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', padding: '4px 8px', background: sf.error ? '#fef2f2' : '#f9fafb', borderRadius: '4px' }}>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sf.file.name}
                        <span style={{ color: '#9ca3af', marginLeft: '6px' }}>
                          ({(sf.file.size / 1024).toFixed(0)} KB)
                        </span>
                      </span>
                      {sf.error && <span style={{ color: '#991b1b', fontSize: '0.8rem', flexShrink: 0 }}>{sf.error}</span>}
                      <button type="button" onClick={() => removeFile(i)} style={removeBtn}>✕</button>
                    </div>
                  ))}
                  {files.some((f) => f.error) && (
                    <p style={{ color: '#991b1b', fontSize: '0.8rem', marginTop: '4px' }}>
                      Files with errors will be skipped during upload.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );

      case 6:
        return (
          <div>
            <h2 style={stepTitle}>6. Confirm & Submit</h2>
            <div style={summaryBox}>
              <dl style={dlStyle}>
                <dt>Building</dt>
                <dd>{selectedBuilding?.name || selectedBuilding?.address_line1}, {selectedBuilding?.city}</dd>

                <dt>Space</dt>
                <dd>{selectedSpace ? spaceLabel(selectedSpace) : '—'}</dd>

                <dt>Issue Type</dt>
                <dd>{state.issueType ? ISSUE_TYPE_LABELS[state.issueType as IssueType] : '—'}</dd>

                <dt>Severity</dt>
                <dd>{state.severity ? SEVERITY_LABELS[state.severity as TicketSeverity] : '—'}</dd>

                <dt>Description</dt>
                <dd style={{ whiteSpace: 'pre-wrap' }}>{state.description}</dd>

                {state.accessInstructions && (
                  <><dt>Access</dt><dd>{state.accessInstructions}</dd></>
                )}

                <dt>Scheduling</dt>
                <dd>
                  {state.schedType === 'asap'
                    ? 'ASAP'
                    : `Preferred: ${state.schedDate || '(no date)'} ${state.schedTime || ''}`}
                </dd>

                <dt>Attachments</dt>
                <dd>
                  {validFiles.length === 0
                    ? 'None'
                    : `${validFiles.length} file${validFiles.length > 1 ? 's' : ''}`}
                </dd>
              </dl>
            </div>

            {/* Upload progress */}
            {uploadProgress.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <p style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '8px' }}>Upload Progress</p>
                {uploadProgress.map((up, i) => (
                  <div key={i} style={{ fontSize: '0.85rem', padding: '4px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '16px', textAlign: 'center' }}>
                        {up.status === 'done' && '✓'}
                        {up.status === 'failed' && '✗'}
                        {(up.status === 'uploading' || up.status === 'registering' || up.status === 'compressing') && '⟳'}
                        {up.status === 'pending' && '○'}
                      </span>
                      <span style={{ flex: 1 }}>{up.fileName}</span>
                      <span style={{ color: up.status === 'failed' ? '#991b1b' : '#6b7280', fontSize: '0.8rem' }}>
                        {up.status === 'compressing' && `Compressing${up.compressPercent != null ? ` ${up.compressPercent}%` : '…'}`}
                        {up.status === 'uploading' && 'Uploading…'}
                        {up.status === 'registering' && 'Registering…'}
                        {up.status === 'done' && (up.compressInfo ? `Done (${up.compressInfo})` : 'Done')}
                        {up.status === 'failed' && (up.error ?? 'Failed')}
                        {up.status === 'pending' && 'Waiting'}
                      </span>
                    </div>
                    {up.status === 'compressing' && up.compressPercent != null && (
                      <div style={{ marginTop: '4px', marginLeft: '24px', height: '4px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${up.compressPercent}%`, background: '#3b82f6', borderRadius: '2px', transition: 'width 0.3s' }} />
                      </div>
                    )}
                  </div>
                ))}
                {uploadProgress.some((u) => u.status === 'failed') && (
                  <p style={{ color: '#92400e', fontSize: '0.8rem', marginTop: '8px', background: '#fef3c7', padding: '8px', borderRadius: '4px' }}>
                    Some uploads failed. The ticket was created successfully — you can retry from the ticket detail page.
                  </p>
                )}
              </div>
            )}
          </div>
        );
    }
  };

  // ── Main render ──────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: '640px' }}>
      {/* Back to list */}
      <button type="button" onClick={() => navigate('..')} style={backLink}>
        ← Back to tickets
      </button>

      {/* Progress bar */}
      <div style={progressBar}>
        {[1, 2, 3, 4, 5, 6].map((s) => (
          <div
            key={s}
            style={{
              flex: 1, height: '4px', borderRadius: '2px',
              background: s <= step ? '#2563eb' : '#e5e7eb',
              transition: 'background 0.2s',
            }}
          />
        ))}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (step === 6) handleSubmit(); }}>
        {renderStep()}

        {/* Navigation */}
        <div style={navRow}>
          {step > 1 && (
            <Button type="button" variant="outline" onClick={goBack} disabled={submitting}>
              ← Previous
            </Button>
          )}
          <div style={{ flex: 1 }} />
          {step < 6 ? (
            <Button
              type="button"
              onClick={goNext}
              disabled={!canAdvance()}
            >
              Next →
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={submitting}
            >
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating Ticket…</> : 'Create Ticket'}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const stepTitle: React.CSSProperties = { fontSize: '1.15rem', marginBottom: '16px' };
const muted: React.CSSProperties = { color: '#6b7280', fontSize: '0.85rem' };
const backLink: React.CSSProperties = {
  background: 'none', border: 'none', color: '#2563eb',
  cursor: 'pointer', fontSize: '0.85rem', padding: 0, marginBottom: '12px',
};
const progressBar: React.CSSProperties = {
  display: 'flex', gap: '4px', marginBottom: '24px',
};
const optionGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: '10px',
};
const optionCard: React.CSSProperties = {
  padding: '14px 16px', textAlign: 'left',
  background: '#fff', border: '2px solid #e5e7eb', borderRadius: '8px',
  cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
  fontSize: '0.9rem', minHeight: '44px',
  WebkitTapHighlightColor: 'transparent',
};
const selectedCard: React.CSSProperties = {
  borderColor: '#2563eb', background: '#eff6ff',
};
const optionSub: React.CSSProperties = {
  fontSize: '0.8rem', color: '#6b7280', marginTop: '2px',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1rem',
  minHeight: '44px',
};
const radioLabel: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px',
  fontSize: '0.9rem', cursor: 'pointer', minHeight: '44px',
};
const removeBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#9ca3af',
  cursor: 'pointer', fontSize: '0.9rem', padding: '4px',
  minWidth: '44px', minHeight: '44px', display: 'flex',
  alignItems: 'center', justifyContent: 'center',
};
const summaryBox: React.CSSProperties = {
  background: '#f9fafb', border: '1px solid #e5e7eb',
  borderRadius: '8px', padding: '16px',
};
const dlStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'auto 1fr',
  gap: '6px 12px', fontSize: '0.9rem', margin: 0,
  wordBreak: 'break-word',
};
const navRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '12px',
  marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e5e7eb',
};
