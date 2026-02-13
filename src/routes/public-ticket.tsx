// =============================================================================
// PlumbTix — Public Ticket View
// =============================================================================
// Standalone page for QR code / shareable links. No login required.
// Shows limited, resident-safe ticket data.
// Route: /p/:ticketId
// =============================================================================

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { STATUS_LABELS, SEVERITY_LABELS, ISSUE_TYPE_LABELS } from '@shared/types/enums';
import type { TicketStatus, TicketSeverity, IssueType } from '@shared/types/enums';

// ---------------------------------------------------------------------------
// Types (mirrors edge function response)
// ---------------------------------------------------------------------------

interface PublicBuilding {
  id: string;
  name: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  company: { id: string; name: string; logo_url: string | null } | null;
}

interface PublicSpace {
  id: string;
  space_type: string;
  unit_number: string | null;
  common_area_type: string | null;
  floor: number | null;
}

interface PublicTicket {
  id: string;
  ticket_number: number;
  status: TicketStatus;
  severity: TicketSeverity;
  issue_type: string;
  description: string | null;
  assigned_technician: string | null;
  scheduled_date: string | null;
  scheduled_time_window: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  building: PublicBuilding;
  space: PublicSpace;
  created_by: { id: string; full_name: string } | null;
}

interface PublicComment {
  id: string;
  comment_text: string;
  created_at: string;
  author_name: string;
}

interface PublicStatusLog {
  id: string;
  old_status: string | null;
  new_status: string;
  created_at: string;
  changed_by_name: string | null;
}

interface PublicPhoto {
  name: string;
  url: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

const SEV_CLASSES: Record<string, string> = {
  emergency: 'bg-red-600 text-white',
  urgent: 'bg-amber-500 text-white',
  standard: 'bg-blue-600 text-white',
};

const STATUS_CLASSES: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  needs_info: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  scheduled: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  dispatched: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  on_site: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  invoiced: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PublicTicketView() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const [ticket, setTicket] = useState<PublicTicket | null>(null);
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [statusLog, setStatusLog] = useState<PublicStatusLog[]>([]);
  const [photos, setPhotos] = useState<PublicPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);

    const base = import.meta.env.VITE_EDGE_BASE_URL || '';
    fetch(`${base}/functions/v1/get-public-ticket?id=${ticketId}`)
      .then(async (res) => {
        const json = await res.json();
        if (!json.ok) throw new Error(json.error?.message || 'Failed to load ticket');
        setTicket(json.data.ticket);
        setComments(json.data.comments ?? []);
        setStatusLog(json.data.statusLog ?? []);
        setPhotos(json.data.photos ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [ticketId]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading work order…</p>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-foreground mb-2">Work Order Not Found</h1>
          <p className="text-sm text-muted-foreground mb-6">
            {error || 'This work order doesn't exist or the link may have expired.'}
          </p>
          <Link
            to="/login"
            className="text-sm text-primary hover:underline"
          >
            Sign in to PlumbTix →
          </Link>
        </div>
      </div>
    );
  }

  const bld = ticket.building;
  const spc = ticket.space;
  const spaceLabel = spc.space_type === 'unit' && spc.unit_number
    ? `Unit ${spc.unit_number}`
    : spc.common_area_type?.replace(/_/g, ' ') ?? spc.space_type;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top bar ── */}
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs font-bold">P</span>
            </div>
            <span className="text-sm font-semibold text-foreground">PlumbTix</span>
            <span className="text-xs text-muted-foreground">· Pro Roto Inc.</span>
          </div>
          <Link
            to="/login"
            className="text-xs text-primary hover:underline font-medium"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Header ── */}
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Work Order #{ticket.ticket_number}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Opened {fmtDate(ticket.created_at)}
                {ticket.created_by && ` by ${ticket.created_by.full_name}`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wide ${SEV_CLASSES[ticket.severity] || SEV_CLASSES.standard}`}>
                {SEVERITY_LABELS[ticket.severity] ?? ticket.severity}
              </span>
              <span className={`px-2.5 py-1 rounded text-xs font-semibold ${STATUS_CLASSES[ticket.status] || STATUS_CLASSES.new}`}>
                {STATUS_LABELS[ticket.status] ?? ticket.status}
              </span>
            </div>
          </div>
          {ticket.completed_at && (
            <p className="text-sm text-green-600 dark:text-green-400 font-medium mt-1">
              ✓ Completed {fmtDate(ticket.completed_at)}
            </p>
          )}
        </div>

        {/* ── Ticket Details ── */}
        <Section title="Ticket Details">
          <Row label="Issue Type" value={ISSUE_TYPE_LABELS[ticket.issue_type as IssueType] ?? ticket.issue_type} />
          {ticket.description && <Row label="Description" value={ticket.description} />}
          {ticket.assigned_technician && <Row label="Technician" value={ticket.assigned_technician} />}
          {ticket.scheduled_date && (
            <Row
              label="Scheduled"
              value={`${ticket.scheduled_date}${ticket.scheduled_time_window ? ` (${ticket.scheduled_time_window})` : ''}`}
            />
          )}
        </Section>

        {/* ── Location ── */}
        <Section title="Location">
          <Row
            label="Building"
            value={`${bld.name ? `${bld.name} — ` : ''}${bld.address_line1}${bld.address_line2 ? `, ${bld.address_line2}` : ''}, ${bld.city}, ${bld.state} ${bld.zip}`}
            bold
          />
          <Row label="Space" value={`${spaceLabel}${spc.floor != null ? ` (Floor ${spc.floor})` : ''}`} />
        </Section>

        {/* ── Photos ── */}
        {photos.length > 0 && (
          <Section title={`Photos (${photos.length})`}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photos.map((p, i) => (
                <div key={i} className="group">
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={p.url}
                      alt={p.name}
                      className="w-full h-36 object-cover rounded-md border border-border group-hover:opacity-90 transition-opacity"
                    />
                  </a>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{p.name}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Comments ── */}
        {comments.length > 0 && (
          <Section title={`Comments (${comments.length})`}>
            <div className="space-y-3">
              {comments.map((c) => (
                <div key={c.id} className="rounded-md border border-border bg-card px-3.5 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{c.author_name}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{fmtDateTime(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{c.comment_text}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Timeline ── */}
        {statusLog.length > 0 && (
          <Section title="Activity Timeline">
            <div className="space-y-2">
              {statusLog.map((entry) => (
                <div key={entry.id} className="flex gap-3 text-sm py-2 border-b border-border last:border-0">
                  <span className="text-xs text-muted-foreground w-[120px] flex-shrink-0 pt-0.5">
                    {fmtDateTime(entry.created_at)}
                  </span>
                  <span className="text-foreground">
                    {entry.old_status
                      ? `${STATUS_LABELS[entry.old_status as TicketStatus] ?? entry.old_status} → ${STATUS_LABELS[entry.new_status as TicketStatus] ?? entry.new_status}`
                      : `Created as ${STATUS_LABELS[entry.new_status as TicketStatus] ?? entry.new_status}`}
                    {entry.changed_by_name && (
                      <span className="text-muted-foreground"> by {entry.changed_by_name}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Managed by ── */}
        {bld.company && (
          <div className="text-center pt-4 pb-8 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Managed by <span className="font-medium text-foreground">{bld.company.name}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Powered by PlumbTix · Pro Roto Inc. · (650) 338-8332
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/50 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">{title}</h2>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground w-[100px] flex-shrink-0 uppercase text-xs font-medium tracking-wide pt-0.5">
        {label}
      </span>
      <span className={`text-foreground ${bold ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  );
}
