// =============================================================================
// Report a problem — three screens, camera first
// =============================================================================
// Designed for a facilities coordinator on a phone next to a leak:
//
//   1. Where?   building (skipped when there is only one) → location, with a
//               "Somewhere else" option so an unlisted corridor never blocks
//               the report. Tapping a location moves on by itself.
//   2. What?    issue → severity is pre-chosen from the issue (one tap to
//               change) → Take photo / Add from library → what's happening.
//               Access notes and a preferred time window are tucked under
//               "More options".
//   3. Send.    one-screen summary, then upload progress.
//
// Create-then-upload: the work order exists even if a photo fails, and the
// person is told so. The draft survives a reload / swipe-back via
// sessionStorage (files can't be serialised, so they are the one thing lost).
// =============================================================================

import { useState, useEffect, useCallback, useMemo, useRef, useId, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchBuildingOptions,
  fetchSpacesForBuilding,
  formatSpaceLabel,
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
  isOtherLocationSpace,
} from '@shared/types/enums';
import type { IssueType, TicketSeverity } from '@shared/types/enums';
import { DEFAULT_SEVERITY } from '@shared/types/transitions';
import { ErrorBanner, friendlyError } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Loader2, Camera, Images, X, FileText, Film, ChevronLeft, ChevronDown, ChevronUp, Search, AlertTriangle, Check,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ──────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

interface Draft {
  buildingId: string;
  spaceId: string;
  locationNote: string;
  issueType: IssueType | '';
  severity: TicketSeverity | '';
  description: string;
  accessInstructions: string;
  schedType: 'asap' | 'preferred_window';
  schedDate: string;
  schedTime: string;
}

interface SelectedFile {
  id: string;
  file: File;
  previewUrl: string | null;
  error: string | null;
}

interface UploadProgress {
  fileName: string;
  status: 'pending' | 'compressing' | 'uploading' | 'registering' | 'done' | 'failed';
  error?: string;
  compressPercent?: number;
}

const EMPTY_DRAFT: Draft = {
  buildingId: '', spaceId: '', locationNote: '',
  issueType: '', severity: '',
  description: '', accessInstructions: '',
  schedType: 'asap', schedDate: '', schedTime: '',
};

const DRAFT_KEY = 'plumbtix.report-draft.v1';

const SEVERITY_HELP: Record<TicketSeverity, string> = {
  emergency: 'Pro Roto is paged the moment you send this — any hour.',
  urgent: 'Pro Roto responds within 24 hours.',
  standard: 'Scheduled at the next opening.',
};

const STEP_TITLES: Record<Step, string> = {
  1: 'Where is the problem?',
  2: "What's wrong?",
  3: 'Ready to send?',
};

function loadDraft(): { draft: Draft; step: Step } | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { draft?: Partial<Draft>; step?: number };
    if (!parsed.draft) return null;
    const step = parsed.step === 2 || parsed.step === 3 ? parsed.step : 1;
    return { draft: { ...EMPTY_DRAFT, ...parsed.draft }, step };
  } catch {
    return null;
  }
}

function saveDraft(draft: Draft, step: Step) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, step })); } catch { /* private mode etc. */ }
}

function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

function buildingTitle(b: BuildingOption): string {
  return b.name || b.address_line1;
}

function spaceTitle(s: SpaceOption): string {
  return `${formatSpaceLabel(s)}${s.floor != null ? ` · Floor ${s.floor}` : ''}`;
}

// ── Component ──────────────────────────────────────────────────────────────

export function CreateTicketWizard() {
  const navigate = useNavigate();
  const restored = useRef(loadDraft());
  const [step, setStepState] = useState<Step>(restored.current?.step ?? 1);
  const [draft, setDraft] = useState<Draft>(restored.current?.draft ?? EMPTY_DRAFT);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const ids = { bsearch: useId(), lsearch: useId(), note: useId(), desc: useId(), access: useId(), date: useId(), time: useId() };

  // Data
  const [buildings, setBuildings] = useState<BuildingOption[]>([]);
  const [spaces, setSpaces] = useState<SpaceOption[]>([]);
  const [loadingBuildings, setLoadingBuildings] = useState(true);
  const [loadingSpaces, setLoadingSpaces] = useState(false);
  const [buildingSearch, setBuildingSearch] = useState('');
  const [locationSearch, setLocationSearch] = useState('');
  const [changingBuilding, setChangingBuilding] = useState(false);
  const [showSeverityOptions, setShowSeverityOptions] = useState(false);
  const [showMore, setShowMore] = useState(false);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  const update = useCallback((patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })), []);

  const setStep = useCallback((next: Step) => {
    setStepState(next);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }, []);

  // Persist the draft (not files) so a reload or swipe-back doesn't lose it
  useEffect(() => { if (!submitting) saveDraft(draft, step); }, [draft, step, submitting]);

  // ── Data ───────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    fetchBuildingOptions().then((b) => {
      if (cancelled) return;
      setBuildings(b);
      // One building: nothing to choose
      if (b.length === 1) setDraft((d) => (d.buildingId ? d : { ...d, buildingId: b[0].id }));
    }).finally(() => { if (!cancelled) setLoadingBuildings(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!draft.buildingId) { setSpaces([]); return; }
    let cancelled = false;
    setLoadingSpaces(true);
    fetchSpacesForBuilding(draft.buildingId)
      .then((s) => { if (!cancelled) setSpaces(s); })
      .finally(() => { if (!cancelled) setLoadingSpaces(false); });
    return () => { cancelled = true; };
  }, [draft.buildingId]);

  // Object URLs for thumbnails — revoke whatever is still held on unmount
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => () => { filesRef.current.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl)); }, []);

  const selectedBuilding = buildings.find((b) => b.id === draft.buildingId);
  const otherSpace = useMemo(() => spaces.find(isOtherLocationSpace), [spaces]);
  const listedSpaces = useMemo(() => spaces.filter((s) => !isOtherLocationSpace(s)), [spaces]);
  const selectedSpace = spaces.find((s) => s.id === draft.spaceId);
  const isOther = !!selectedSpace && isOtherLocationSpace(selectedSpace);

  const filteredBuildings = useMemo(() => {
    const q = buildingSearch.trim().toLowerCase();
    if (!q) return buildings;
    return buildings.filter((b) => `${b.name ?? ''} ${b.address_line1} ${b.city}`.toLowerCase().includes(q));
  }, [buildings, buildingSearch]);

  const filteredSpaces = useMemo(() => {
    const q = locationSearch.trim().toLowerCase();
    if (!q) return listedSpaces;
    return listedSpaces.filter((s) => spaceTitle(s).toLowerCase().includes(q));
  }, [listedSpaces, locationSearch]);

  const units = filteredSpaces.filter((s) => s.space_type === 'unit');
  const commonAreas = filteredSpaces.filter((s) => s.space_type !== 'unit');

  // ── Files ──────────────────────────────────────────────────────────────

  const addFiles = (list: FileList | null) => {
    const incoming = Array.from(list ?? []);
    const validated: SelectedFile[] = incoming.map((file) => {
      const ok = ALLOWED_MIME_TYPES.includes(file.type as typeof ALLOWED_MIME_TYPES[number]) || file.type.startsWith('video/');
      const isVisual = file.type.startsWith('image/') || file.type.startsWith('video/');
      return {
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: isVisual ? URL.createObjectURL(file) : null,
        error: ok ? null : `Can't attach ${file.type || 'this file type'}`,
      };
    });
    setFiles((prev) => [...prev, ...validated]);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const gone = prev.find((f) => f.id === id);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const validFiles = files.filter((f) => !f.error);

  // ── Step gating ────────────────────────────────────────────────────────

  const whereDone = !!draft.buildingId && !!draft.spaceId && (!isOther || draft.locationNote.trim().length > 0);
  const whatDone = !!draft.issueType && !!draft.severity && draft.description.trim().length > 0;

  const chooseSpace = (s: SpaceOption) => {
    const other = isOtherLocationSpace(s);
    update({ spaceId: s.id, locationNote: other ? draft.locationNote : '' });
    if (!other) setStep(2);
  };

  const chooseIssue = (it: IssueType) => {
    update({ issueType: it, severity: DEFAULT_SEVERITY[it] });
    setShowSeverityOptions(false);
  };

  // ── Submit ─────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (submitting || !whereDone || !whatDone) return;
    setSubmitting(true);
    setError(null);

    const schedPref = draft.schedType === 'asap'
      ? { type: 'asap' as const }
      : { type: 'preferred_window' as const, preferred_date: draft.schedDate || undefined, preferred_time: draft.schedTime || undefined };

    const result = await createTicket({
      building_id: draft.buildingId,
      space_id: draft.spaceId,
      issue_type: draft.issueType as IssueType,
      severity: draft.severity as TicketSeverity,
      description: draft.description.trim(),
      access_instructions: draft.accessInstructions.trim() || undefined,
      location_note: isOther ? draft.locationNote.trim() : undefined,
      scheduling_preference: schedPref,
    });

    if (!result.ok) {
      setError(friendlyError(new Error(result.error.message), "Couldn't send the work order."));
      setSubmitting(false);
      return;
    }

    const ticketId = result.data.ticket.id;
    const ticketNumber = result.data.ticket.ticket_number;
    clearDraft();

    // Upload files — the work order already exists, so a failed photo is recoverable
    let failed = 0;
    if (validFiles.length > 0) {
      const progress: UploadProgress[] = validFiles.map((f) => ({ fileName: f.file.name, status: 'pending' }));
      setUploadProgress([...progress]);
      let videoIndex = 1;

      for (let i = 0; i < validFiles.length; i++) {
        const sf = validFiles[i];
        let file = sf.file;

        if (shouldCompress(file)) {
          progress[i] = { ...progress[i], status: 'compressing', compressPercent: 0 };
          setUploadProgress([...progress]);
          try {
            const c = await compressVideo(file, {
              maxHeight: 720, crf: 28, preset: 'fast',
              onProgress: (percent) => { progress[i] = { ...progress[i], compressPercent: percent }; setUploadProgress([...progress]); },
            });
            file = c.file;
          } catch { /* compression is best-effort; upload the original */ }
        }

        const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const filePath = `tickets/${ticketId}/${safeName}`;

        progress[i] = { ...progress[i], status: 'uploading' };
        setUploadProgress([...progress]);
        const { error: uploadError } = await supabase.storage
          .from('ticket-attachments')
          .upload(filePath, file, { contentType: file.type, upsert: false });
        if (uploadError) {
          failed++;
          progress[i] = { ...progress[i], status: 'failed', error: uploadError.message };
          setUploadProgress([...progress]);
          continue;
        }

        progress[i] = { ...progress[i], status: 'registering' };
        setUploadProgress([...progress]);
        const reg = await registerAttachment({
          ticket_id: ticketId,
          file_path: filePath,
          file_name: shouldCompress(sf.file) ? `video${videoIndex++}.mp4` : sf.file.name,
          file_type: file.type,
          file_size: file.size,
        });
        if (!reg.ok) { failed++; progress[i] = { ...progress[i], status: 'failed', error: reg.error.message }; }
        else progress[i] = { ...progress[i], status: 'done' };
        setUploadProgress([...progress]);
      }
    }

    setSubmitting(false);
    toast.success(`Work order #${ticketNumber} sent to Pro Roto`, {
      description: failed > 0
        ? `${failed} file${failed === 1 ? '' : 's'} didn't upload — you can add ${failed === 1 ? 'it' : 'them'} again from the work order.`
        : draft.severity === 'emergency'
          ? "We've been paged. Keep your phone nearby."
          : "You'll get an email when it's scheduled.",
    });
    navigate(`../${ticketId}`, { replace: true, relative: 'path' });
  }, [submitting, whereDone, whatDone, draft, isOther, validFiles, navigate]);

  // ── Screens ────────────────────────────────────────────────────────────

  const renderWhere = () => (
    <div className="space-y-5">
      {/* Building */}
      {loadingBuildings ? (
        <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
      ) : buildings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No buildings are set up for you yet. Ask your admin to add buildings or give you access.</p>
      ) : buildings.length > 1 && (!draft.buildingId || changingBuilding) ? (
        <section aria-labelledby="pick-building">
          <h3 id="pick-building" className="text-sm font-semibold mb-2">Building</h3>
          {buildings.length > 8 && (
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <label htmlFor={ids.bsearch} className="sr-only">Search buildings</label>
              <input id={ids.bsearch} type="search" className="form-input" style={{ paddingLeft: 36 }} placeholder="Search buildings…" value={buildingSearch} onChange={(e) => setBuildingSearch(e.target.value)} />
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {filteredBuildings.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`wizard-option min-h-[56px] ${draft.buildingId === b.id ? 'selected' : ''}`}
                aria-pressed={draft.buildingId === b.id}
                onClick={() => { update({ buildingId: b.id, spaceId: '', locationNote: '' }); setChangingBuilding(false); setLocationSearch(''); }}
              >
                <span className="block font-semibold text-sm">{buildingTitle(b)}</span>
                <span className="block text-xs text-muted-foreground">{b.name ? `${b.address_line1}, ` : ''}{b.city}</span>
              </button>
            ))}
            {filteredBuildings.length === 0 && <p className="text-sm text-muted-foreground">No building matches "{buildingSearch}".</p>}
          </div>
        </section>
      ) : selectedBuilding && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Building</div>
            <div className="font-semibold text-sm truncate">{buildingTitle(selectedBuilding)}</div>
          </div>
          {buildings.length > 1 && (
            <Button type="button" variant="ghost" size="sm" className="min-h-[44px] sm:min-h-0" onClick={() => setChangingBuilding(true)}>Change</Button>
          )}
        </div>
      )}

      {/* Location */}
      {draft.buildingId && !changingBuilding && (
        <section aria-labelledby="pick-location">
          <h3 id="pick-location" className="text-sm font-semibold mb-2">Location</h3>
          {loadingSpaces ? (
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
          ) : (
            <>
              {listedSpaces.length > 10 && (
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <label htmlFor={ids.lsearch} className="sr-only">Search locations</label>
                  <input id={ids.lsearch} type="search" className="form-input" style={{ paddingLeft: 36 }} placeholder="Unit number or room…" value={locationSearch} onChange={(e) => setLocationSearch(e.target.value)} />
                </div>
              )}
              {units.length > 0 && (
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 mb-3">
                  {units.map((s) => (
                    <button key={s.id} type="button" className={`wizard-option min-h-[56px] ${draft.spaceId === s.id ? 'selected' : ''}`} aria-pressed={draft.spaceId === s.id} onClick={() => chooseSpace(s)}>
                      <span className="block font-semibold text-sm">{formatSpaceLabel(s)}</span>
                      {s.floor != null && <span className="block text-xs text-muted-foreground">Floor {s.floor}</span>}
                    </button>
                  ))}
                </div>
              )}
              {commonAreas.length > 0 && (
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 mb-3">
                  {commonAreas.map((s) => (
                    <button key={s.id} type="button" className={`wizard-option min-h-[56px] ${draft.spaceId === s.id ? 'selected' : ''}`} aria-pressed={draft.spaceId === s.id} onClick={() => chooseSpace(s)}>
                      <span className="block font-semibold text-sm">{formatSpaceLabel(s)}</span>
                      {s.floor != null && <span className="block text-xs text-muted-foreground">Floor {s.floor}</span>}
                    </button>
                  ))}
                </div>
              )}
              {filteredSpaces.length === 0 && listedSpaces.length > 0 && (
                <p className="text-sm text-muted-foreground mb-3">No location matches "{locationSearch}" — describe it below.</p>
              )}
              {otherSpace ? (
                <button type="button" className={`wizard-option is-other min-h-[56px] ${isOther ? 'selected' : ''}`} aria-pressed={isOther} onClick={() => chooseSpace(otherSpace)}>
                  <span className="block font-semibold text-sm">Somewhere else</span>
                  <span className="block text-xs text-muted-foreground">A corridor, roof, loading dock — anything not listed</span>
                </button>
              ) : listedSpaces.length === 0 && (
                <p className="text-sm text-muted-foreground">No locations are set up for this building yet. Ask your admin to add units or common areas.</p>
              )}
              {isOther && (
                <div className="mt-3">
                  <label htmlFor={ids.note} className="form-label">Where exactly?</label>
                  <input
                    id={ids.note}
                    type="text"
                    className="form-input"
                    value={draft.locationNote}
                    onChange={(e) => update({ locationNote: e.target.value })}
                    placeholder="e.g. 3rd floor corridor by elevator B"
                    maxLength={300}
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter' && whereDone) { e.preventDefault(); setStep(2); } }}
                  />
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );

  const renderWhat = () => (
    <div className="space-y-6">
      {/* Issue */}
      <section aria-labelledby="pick-issue">
        <h3 id="pick-issue" className="text-sm font-semibold mb-2">Issue</h3>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
          {ISSUE_TYPES.map((it) => (
            <button key={it} type="button" className={`wizard-option min-h-[56px] ${draft.issueType === it ? 'selected' : ''}`} aria-pressed={draft.issueType === it} onClick={() => chooseIssue(it)}>
              <span className="block font-semibold text-sm">{ISSUE_TYPE_LABELS[it]}</span>
            </button>
          ))}
        </div>
      </section>

      {draft.issueType === 'gas_smell' && (
        <div role="alert" className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <p className="m-0"><strong>If you smell gas:</strong> leave the area, don't flip switches, and call 911 or your gas utility first. Then send this.</p>
        </div>
      )}

      {/* Severity — pre-chosen, one tap to change */}
      {draft.issueType && draft.severity && (
        <section aria-labelledby="severity-heading" className={`rounded-lg border p-3 ${draft.severity === 'emergency' ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted/40'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm">
              <span id="severity-heading" className="font-semibold">{SEVERITY_LABELS[draft.severity]}</span>
              <span className="text-muted-foreground"> — {SEVERITY_HELP[draft.severity]}</span>
            </div>
            <button type="button" className="text-sm text-primary underline-offset-2 hover:underline shrink-0 min-h-[44px] sm:min-h-0" aria-expanded={showSeverityOptions} onClick={() => setShowSeverityOptions((v) => !v)}>
              {showSeverityOptions ? 'Done' : 'Change'}
            </button>
          </div>
          {showSeverityOptions && (
            <div className="grid gap-2 mt-3 sm:grid-cols-3">
              {TICKET_SEVERITIES.map((sev) => (
                <button key={sev} type="button" className={`wizard-option min-h-[56px] ${sev === 'emergency' ? 'is-emergency' : ''} ${draft.severity === sev ? 'selected' : ''}`} aria-pressed={draft.severity === sev} onClick={() => { update({ severity: sev }); setShowSeverityOptions(false); }}>
                  <span className="block font-semibold text-sm">{SEVERITY_LABELS[sev]}</span>
                  <span className="block text-xs text-muted-foreground">{SEVERITY_HELP[sev]}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Photos — the most useful thing a reporter can give */}
      <section aria-labelledby="photos-heading">
        <h3 id="photos-heading" className="text-sm font-semibold mb-2">Photos <span className="font-normal text-muted-foreground">(a photo saves a trip)</span></h3>
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <input ref={libraryInput} type="file" multiple accept={ALLOWED_MIME_TYPES.join(',') + ',video/*'} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => cameraInput.current?.click()}>
            <Camera className="h-5 w-5" aria-hidden="true" /> Take photo
          </Button>
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => libraryInput.current?.click()}>
            <Images className="h-5 w-5" aria-hidden="true" /> Add from library
          </Button>
        </div>
        {files.length > 0 && (
          <ul className="report-thumbs list-none m-0 p-0" aria-label="Attached files">
            {files.map((f) => (
              <li key={f.id} className={`report-thumb ${f.error ? 'ring-2 ring-destructive' : ''}`}>
                {f.previewUrl && f.file.type.startsWith('image/') ? (
                  <img src={f.previewUrl} alt={f.file.name} />
                ) : f.previewUrl ? (
                  <video src={f.previewUrl} muted preload="metadata" aria-label={f.file.name} />
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center gap-1 p-2 text-muted-foreground">
                    {f.file.type.startsWith('video/') ? <Film className="h-6 w-6" aria-hidden="true" /> : <FileText className="h-6 w-6" aria-hidden="true" />}
                    <span className="text-[10px] text-center break-all line-clamp-2">{f.file.name}</span>
                  </div>
                )}
                {f.error && <span className="absolute inset-x-0 bottom-0 bg-destructive text-destructive-foreground text-[10px] px-1 py-0.5 truncate">{f.error}</span>}
                <button type="button" className="report-thumb-remove" aria-label={`Remove ${f.file.name}`} onClick={() => removeFile(f.id)}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Description */}
      <section>
        <label htmlFor={ids.desc} className="form-label">What's happening?</label>
        <textarea
          id={ids.desc}
          className="form-textarea"
          rows={4}
          value={draft.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="What you see, when it started, what's affected"
          required
        />
      </section>

      {/* More options */}
      <section>
        <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-primary min-h-[44px]" aria-expanded={showMore} onClick={() => setShowMore((v) => !v)}>
          {showMore ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
          More options
          {!showMore && (draft.accessInstructions || draft.schedType === 'preferred_window') && <span className="text-muted-foreground font-normal"> (filled in)</span>}
        </button>
        {showMore && (
          <div className="space-y-4 mt-2 rounded-lg border border-border bg-muted/30 p-3">
            <div>
              <label htmlFor={ids.access} className="form-label">How does the technician get in?</label>
              <input id={ids.access} type="text" className="form-input" value={draft.accessInstructions} onChange={(e) => update({ accessInstructions: e.target.value })} placeholder="e.g. Check in at the front desk, badge required" />
            </div>
            <fieldset>
              <legend className="form-label">When</legend>
              <div className="flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2 text-sm min-h-[44px] cursor-pointer">
                  <input type="radio" name="sched" className="h-4 w-4 accent-primary" checked={draft.schedType === 'asap'} onChange={() => update({ schedType: 'asap' })} /> As soon as possible
                </label>
                <label className="inline-flex items-center gap-2 text-sm min-h-[44px] cursor-pointer">
                  <input type="radio" name="sched" className="h-4 w-4 accent-primary" checked={draft.schedType === 'preferred_window'} onChange={() => update({ schedType: 'preferred_window' })} /> I'd prefer a time
                </label>
              </div>
              {draft.schedType === 'preferred_window' && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label htmlFor={ids.date} className="sr-only">Preferred date</label>
                    <input id={ids.date} type="date" className="form-input" value={draft.schedDate} onChange={(e) => update({ schedDate: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor={ids.time} className="sr-only">Preferred time</label>
                    <input id={ids.time} type="text" className="form-input" value={draft.schedTime} onChange={(e) => update({ schedTime: e.target.value })} placeholder="e.g. mornings" />
                  </div>
                </div>
              )}
            </fieldset>
          </div>
        )}
      </section>
    </div>
  );

  const renderSend = () => {
    const rows: { label: string; value: ReactNode; step: Step }[] = [
      { label: 'Building', value: selectedBuilding ? `${buildingTitle(selectedBuilding)}, ${selectedBuilding.city}` : '—', step: 1 },
      { label: 'Location', value: isOther ? draft.locationNote : selectedSpace ? spaceTitle(selectedSpace) : '—', step: 1 },
      { label: 'Issue', value: draft.issueType ? ISSUE_TYPE_LABELS[draft.issueType] : '—', step: 2 },
      { label: 'Severity', value: draft.severity ? SEVERITY_LABELS[draft.severity] : '—', step: 2 },
      { label: "What's happening", value: <span className="whitespace-pre-wrap">{draft.description}</span>, step: 2 },
    ];
    if (draft.accessInstructions) rows.push({ label: 'Getting in', value: draft.accessInstructions, step: 2 });
    rows.push({
      label: 'When',
      value: draft.schedType === 'asap' ? 'As soon as possible' : `Preferred: ${draft.schedDate || 'any day'}${draft.schedTime ? `, ${draft.schedTime}` : ''}`,
      step: 2,
    });

    return (
      <div className="space-y-5">
        <dl className="m-0 rounded-lg border border-border divide-y divide-border">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-[110px_1fr_auto] gap-3 px-4 py-3 text-sm items-start">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="m-0 min-w-0 break-words">{r.value}</dd>
              {!submitting && (
                <button type="button" className="text-xs text-primary hover:underline underline-offset-2 min-h-[44px] sm:min-h-0 -my-2" onClick={() => setStep(r.step)} aria-label={`Edit ${r.label.toLowerCase()}`}>Edit</button>
              )}
            </div>
          ))}
          <div className="grid grid-cols-[110px_1fr_auto] gap-3 px-4 py-3 text-sm items-start">
            <dt className="text-muted-foreground">Photos</dt>
            <dd className="m-0">
              {validFiles.length === 0 ? <span className="text-muted-foreground">None</span> : (
                <div className="flex flex-wrap gap-1.5">
                  {validFiles.map((f) => f.previewUrl && f.file.type.startsWith('image/')
                    ? <img key={f.id} src={f.previewUrl} alt="" className="h-12 w-12 rounded object-cover border border-border" />
                    : <span key={f.id} className="h-12 w-12 rounded border border-border bg-muted inline-flex items-center justify-center text-muted-foreground">{f.file.type.startsWith('video/') ? <Film className="h-5 w-5" aria-hidden="true" /> : <FileText className="h-5 w-5" aria-hidden="true" />}</span>)}
                </div>
              )}
            </dd>
            {!submitting && <button type="button" className="text-xs text-primary hover:underline underline-offset-2 min-h-[44px] sm:min-h-0 -my-2" onClick={() => setStep(2)} aria-label="Edit photos">Edit</button>}
          </div>
        </dl>

        {draft.severity === 'emergency' && !submitting && (
          <p className="text-sm flex gap-2 items-start"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" aria-hidden="true" /> Pro Roto is paged the moment you send this.</p>
        )}

        {uploadProgress.length > 0 && (
          <div className="rounded-lg border border-border p-3" aria-live="polite">
            <p className="text-sm font-semibold mb-2">Uploading photos</p>
            <ul className="m-0 p-0 list-none space-y-1.5 text-sm">
              {uploadProgress.map((up, i) => (
                <li key={i} className="flex items-center gap-2">
                  {up.status === 'done' ? <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
                    : up.status === 'failed' ? <X className="h-4 w-4 text-destructive" aria-hidden="true" />
                    : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />}
                  <span className="flex-1 truncate">{up.fileName}</span>
                  <span className={`text-xs ${up.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {up.status === 'compressing' && `Compressing${up.compressPercent != null ? ` ${up.compressPercent}%` : '…'}`}
                    {up.status === 'uploading' && 'Uploading…'}
                    {up.status === 'registering' && 'Saving…'}
                    {up.status === 'done' && 'Done'}
                    {up.status === 'failed' && (up.error ?? 'Failed')}
                    {up.status === 'pending' && 'Waiting'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────

  const primary = step === 1
    ? { label: "Next: what's wrong", disabled: !whereDone, onClick: () => setStep(2) }
    : step === 2
      ? { label: 'Review', disabled: !whatDone, onClick: () => setStep(3) }
      : { label: submitting ? 'Sending…' : 'Send work order', disabled: submitting || !whereDone || !whatDone, onClick: handleSubmit };

  return (
    <div className="max-w-2xl">
      <Button variant="ghost" size="sm" className="mb-2 -ml-2 gap-1 min-h-[44px] sm:min-h-0" onClick={() => navigate('..', { relative: 'path' })}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Work orders
      </Button>

      <ol className="report-progress list-none p-0" aria-label={`Step ${step} of 3`}>
        {([1, 2, 3] as Step[]).map((s) => (
          <li key={s} className={`report-progress-seg ${s < step ? 'done' : s === step ? 'active' : ''}`} aria-current={s === step ? 'step' : undefined}>
            <span className="report-progress-label block">{s === 1 ? 'Where' : s === 2 ? 'What' : 'Send'}</span>
          </li>
        ))}
      </ol>

      <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-4">{STEP_TITLES[step]}</h2>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (step === 3) handleSubmit(); else if (!primary.disabled) primary.onClick(); }}>
        {step === 1 && renderWhere()}
        {step === 2 && renderWhat()}
        {step === 3 && renderSend()}

        <div className="report-actions">
          {step > 1 ? (
            <Button type="button" variant="ghost" size="lg" onClick={() => setStep((step - 1) as Step)} disabled={submitting}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back
            </Button>
          ) : <span />}
          <Button type={step === 3 ? 'submit' : 'button'} size="lg" className="min-w-[160px]" disabled={primary.disabled} onClick={step === 3 ? undefined : primary.onClick}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {primary.label}
          </Button>
        </div>
      </form>
    </div>
  );
}
