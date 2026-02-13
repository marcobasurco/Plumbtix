// =============================================================================
// PlumbTix — Printable Work Order Report (TicketReport)
// =============================================================================
// Renders a clean, professional report for printing / PDF export.
// Variants by `userRole`:
//   • proroto_admin / pm_admin / pm_user → full report with internal notes
//   • resident → limited report (no internal notes, no financials)
//
// New in v0.8: QR code, photo grid, signatures section, ref forwarding for
// PDF capture, improved severity badge with print-safe colors.
// =============================================================================

import { useEffect, useState, forwardRef } from 'react';
import { fetchStatusLog, fetchAttachments, type StatusLogRow, type AttachmentRow } from '@/lib/tickets';
import { getTicketComments } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import type { TicketDetailRow } from '@/lib/tickets';
import type { UserRole, TicketStatus, IssueType } from '@shared/types/enums';
import { STATUS_LABELS, ISSUE_TYPE_LABELS, SEVERITY_LABELS } from '@shared/types/enums';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommentEntry {
  id: string;
  ticket_id: string;
  user_id: string;
  comment_text: string;
  is_internal: boolean;
  created_at: string;
  author: { id: string; full_name: string; role: string };
}

export interface TicketReportProps {
  ticket: TicketDetailRow;
  userRole: UserRole;
  onReady?: () => void;
  /** 'print' = browser print (default), 'pdf' = for html2canvas capture */
  mode?: 'print' | 'pdf';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function fmtCurrency(amount: number | null): string {
  if (amount === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function getTicketUrl(ticketId: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://workorders.proroto.com';
  return `${base}/p/${ticketId}`;
}

// QR via public API — works in browser and PDF capture
function qrImgUrl(data: string, size = 80): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&format=png`;
}

// ---------------------------------------------------------------------------
// Inline styles (for print isolation — no Tailwind dependency)
// ---------------------------------------------------------------------------

const S = {
  page: {
    fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
    fontSize: '11px', lineHeight: '1.5', color: '#1a1a1a',
    maxWidth: '800px', margin: '0 auto', padding: '20px 32px', background: '#fff',
  } as React.CSSProperties,
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    borderBottom: '2px solid #1a1a1a', paddingBottom: '12px', marginBottom: '20px',
  } as React.CSSProperties,
  logo: { fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em' } as React.CSSProperties,
  sub: { fontSize: '10px', color: '#666', marginTop: '2px' } as React.CSSProperties,
  headerRight: { textAlign: 'right' as const, fontSize: '10px', color: '#666' } as React.CSSProperties,
  section: { marginBottom: '16px' } as React.CSSProperties,
  sectionTitle: {
    fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' as const,
    letterSpacing: '0.05em', borderBottom: '1px solid #ccc',
    paddingBottom: '4px', marginBottom: '8px', color: '#333',
  } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '11px' } as React.CSSProperties,
  th: { textAlign: 'left' as const, fontWeight: 600, padding: '4px 8px', width: '140px', verticalAlign: 'top' as const, color: '#555', fontSize: '10px' } as React.CSSProperties,
  td: { padding: '4px 8px', verticalAlign: 'top' as const } as React.CSSProperties,
  commentBox: { padding: '6px 10px', marginBottom: '8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '10px' } as React.CSSProperties,
  commentInternal: { padding: '6px 10px', marginBottom: '8px', border: '1px dashed #999', borderRadius: '4px', fontSize: '10px', background: '#f9f9f9' } as React.CSSProperties,
  internalBadge: { display: 'inline-block', fontSize: '8px', fontWeight: 700, textTransform: 'uppercase' as const, padding: '1px 5px', border: '1px solid #999', borderRadius: '2px', marginLeft: '6px', color: '#666' } as React.CSSProperties,
  commentMeta: { color: '#666', fontSize: '9px' } as React.CSSProperties,
  timelineRow: { display: 'flex', gap: '12px', padding: '3px 0', fontSize: '10px', borderBottom: '1px solid #eee' } as React.CSSProperties,
  timelineDate: { width: '130px', flexShrink: 0, color: '#666', fontSize: '9px' } as React.CSSProperties,
  attachmentItem: { padding: '3px 0', fontSize: '10px', borderBottom: '1px solid #eee' } as React.CSSProperties,
  photoGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '8px' } as React.CSSProperties,
  photoThumb: { width: '100%', height: '140px', objectFit: 'cover' as const, borderRadius: '4px', border: '1px solid #ddd' } as React.CSSProperties,
  sigSection: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '12px' } as React.CSSProperties,
  sigLine: { borderTop: '1px solid #333', paddingTop: '4px', fontSize: '10px', color: '#555' } as React.CSSProperties,
  footer: { marginTop: '24px', paddingTop: '12px', borderTop: '1px solid #ccc', fontSize: '9px', color: '#888', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as React.CSSProperties,
  badge: (bg: string) => ({ display: 'inline-block', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', padding: '2px 8px', borderRadius: '3px', color: '#fff', background: bg, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties),
  residentBadge: { display: 'inline-block', fontSize: '9px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', padding: '2px 8px', border: '1px solid #999', borderRadius: '3px', color: '#555', marginTop: '6px' } as React.CSSProperties,
};

const SEV_COLORS: Record<string, string> = { emergency: '#dc2626', urgent: '#d97706', standard: '#2563eb' };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TicketReport = forwardRef<HTMLDivElement, TicketReportProps>(
  function TicketReport({ ticket, userRole, onReady, mode = 'print' }, ref) {
    const [comments, setComments] = useState<CommentEntry[]>([]);
    const [statusLog, setStatusLog] = useState<StatusLogRow[]>([]);
    const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
    const [photoUrls, setPhotoUrls] = useState<{ name: string; url: string }[]>([]);
    const [dataLoaded, setDataLoaded] = useState(false);

    const isResident = userRole === 'resident';
    const isFullReport = !isResident;

    useEffect(() => {
      let cancelled = false;
      async function load() {
        try {
          const [commentsRes, logRows, attachRows] = await Promise.all([
            getTicketComments(ticket.id),
            fetchStatusLog(ticket.id),
            fetchAttachments(ticket.id),
          ]);
          if (cancelled) return;
          if (commentsRes.ok) setComments(commentsRes.data.comments as CommentEntry[]);
          setStatusLog(logRows);
          setAttachments(attachRows);

          // Signed URLs for image attachments (max 6 for layout)
          const imgs = attachRows.filter(a => a.file_type?.startsWith('image/')).slice(0, 6);
          if (imgs.length > 0) {
            const urls: { name: string; url: string }[] = [];
            for (const att of imgs) {
              const { data } = await supabase.storage
                .from('ticket-attachments')
                .createSignedUrl(att.file_path, 300);
              if (data?.signedUrl) urls.push({ name: att.file_name, url: data.signedUrl });
            }
            if (!cancelled) setPhotoUrls(urls);
          }
        } catch { /* report still renders with ticket data */ }
        finally { if (!cancelled) setDataLoaded(true); }
      }
      load();
      return () => { cancelled = true; };
    }, [ticket.id]);

    // Wait for ALL images (photos + QR) to finish loading before signaling ready
    useEffect(() => {
      if (!dataLoaded || !onReady) return;

      const container = ref && typeof ref !== 'function' ? ref.current : document.getElementById('plumbtix-report');
      if (!container) {
        const t = setTimeout(onReady, mode === 'pdf' ? 600 : 300);
        return () => clearTimeout(t);
      }

      const images = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
      if (images.length === 0) {
        const t = setTimeout(onReady, mode === 'pdf' ? 600 : 150);
        return () => clearTimeout(t);
      }

      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        // Small extra delay for browser paint
        setTimeout(onReady, mode === 'pdf' ? 300 : 100);
      };

      // Timeout fallback — don't block print forever if an image fails
      const timeout = setTimeout(finish, 8000);

      let loaded = 0;
      const total = images.length;
      const check = () => { loaded++; if (loaded >= total) finish(); };

      images.forEach(img => {
        if (img.complete && img.naturalWidth > 0) {
          check();
        } else {
          img.addEventListener('load', check, { once: true });
          img.addEventListener('error', check, { once: true });
        }
      });

      return () => { resolved = true; clearTimeout(timeout); };
    }, [dataLoaded, onReady, mode, ref, photoUrls]);

    const internalComments = isFullReport ? comments.filter(c => c.is_internal) : [];
    const externalComments = comments.filter(c => !c.is_internal);

    const bld = ticket.building;
    const spc = ticket.space;
    const spaceLabel = spc.space_type === 'unit' && spc.unit_number
      ? `Unit ${spc.unit_number}`
      : spc.common_area_type?.replace(/_/g, ' ') ?? spc.space_type;

    const sched = ticket.scheduling_preference as {
      type?: string; preferred_date?: string; preferred_time?: string;
    } | null;

    const ticketUrl = getTicketUrl(ticket.id);

    return (
      <div ref={ref} style={S.page} id="plumbtix-report">
        {/* ── HEADER ── */}
        <div style={S.header}>
          <div>
            <div style={S.logo}>PlumbTix — Work Order</div>
            <div style={S.sub}>Pro Roto Inc. · CA License #947961</div>
            <div style={S.sub}>(650) 338-8332 · proroto.com</div>
            {isResident && <div style={S.residentBadge}>Resident Copy</div>}
          </div>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <div style={S.headerRight}>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>#{ticket.ticket_number}</div>
              <div>Status: {STATUS_LABELS[ticket.status as TicketStatus] ?? ticket.status}</div>
              <div style={S.badge(SEV_COLORS[ticket.severity] || '#2563eb')}>
                {SEVERITY_LABELS[ticket.severity] ?? ticket.severity}
              </div>
              <div style={{ marginTop: '4px' }}>Opened: {fmtDate(ticket.created_at)}</div>
              {ticket.completed_at && <div>Completed: {fmtDate(ticket.completed_at)}</div>}
            </div>
            <div style={{ textAlign: 'center' }}>
              <img src={qrImgUrl(ticketUrl)} alt="QR" style={{ width: 68, height: 68 }} />
              <div style={{ fontSize: '7px', color: '#aaa' }}>Scan to view</div>
            </div>
          </div>
        </div>

        {/* ── TICKET SUMMARY ── */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Ticket Summary</div>
          <table style={S.table}><tbody>
            <tr><td style={S.th}>Issue Type</td><td style={S.td}>{ISSUE_TYPE_LABELS[ticket.issue_type as IssueType] ?? ticket.issue_type}</td></tr>
            {ticket.description && <tr><td style={S.th}>Description</td><td style={{ ...S.td, whiteSpace: 'pre-wrap' }}>{ticket.description}</td></tr>}
            {ticket.access_instructions && <tr><td style={S.th}>Access</td><td style={S.td}>{ticket.access_instructions}</td></tr>}
            {sched && <tr><td style={S.th}>Scheduling</td><td style={S.td}>{sched.type === 'asap' ? 'ASAP' : 'Preferred'}{sched.preferred_date && ` — ${sched.preferred_date}`}{sched.preferred_time && ` (${sched.preferred_time})`}</td></tr>}
          </tbody></table>
        </div>

        {/* ── LOCATION ── */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Location</div>
          <table style={S.table}><tbody>
            <tr><td style={S.th}>Building</td><td style={S.td}>{bld.name && <strong>{bld.name} — </strong>}{bld.address_line1}{bld.address_line2 && `, ${bld.address_line2}`}, {bld.city}, {bld.state} {bld.zip}</td></tr>
            <tr><td style={S.th}>Space</td><td style={S.td}>{spaceLabel}{spc.floor != null && ` (Floor ${spc.floor})`}</td></tr>
            {isFullReport && bld.gate_code && <tr><td style={S.th}>Gate Code</td><td style={S.td}><span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{bld.gate_code}</span></td></tr>}
            {isFullReport && bld.onsite_contact_name && <tr><td style={S.th}>Onsite Contact</td><td style={S.td}>{bld.onsite_contact_name}{bld.onsite_contact_phone && ` — ${bld.onsite_contact_phone}`}</td></tr>}
          </tbody></table>
        </div>

        {/* ── WORK DETAILS ── */}
        {(ticket.assigned_technician || ticket.scheduled_date || ticket.quote_amount !== null || ticket.invoice_number || ticket.completed_at) && (
          <div style={S.section}>
            <div style={S.sectionTitle}>Work Details</div>
            <table style={S.table}><tbody>
              {ticket.assigned_technician && <tr><td style={S.th}>Technician</td><td style={S.td}>{ticket.assigned_technician}</td></tr>}
              {ticket.scheduled_date && <tr><td style={S.th}>Scheduled</td><td style={S.td}>{ticket.scheduled_date}{ticket.scheduled_time_window && ` (${ticket.scheduled_time_window})`}</td></tr>}
              {isFullReport && ticket.quote_amount !== null && <tr><td style={S.th}>Quote</td><td style={S.td}>{fmtCurrency(ticket.quote_amount)}</td></tr>}
              {isFullReport && ticket.invoice_number && <tr><td style={S.th}>Invoice #</td><td style={S.td}>{ticket.invoice_number}</td></tr>}
              {ticket.completed_at && <tr><td style={S.th}>Completed</td><td style={S.td}>{fmtDateTime(ticket.completed_at)}</td></tr>}
            </tbody></table>
          </div>
        )}

        {/* ── REPORTED BY ── */}
        {ticket.created_by && (
          <div style={S.section}>
            <div style={S.sectionTitle}>Reported By</div>
            <table style={S.table}><tbody>
              <tr><td style={S.th}>Name</td><td style={S.td}>{ticket.created_by.full_name}</td></tr>
              <tr><td style={S.th}>Email</td><td style={S.td}>{ticket.created_by.email}</td></tr>
              {ticket.created_by.phone && <tr><td style={S.th}>Phone</td><td style={S.td}>{ticket.created_by.phone}</td></tr>}
            </tbody></table>
          </div>
        )}

        {/* ── PHOTOS ── */}
        {photoUrls.length > 0 && (
          <div style={S.section}>
            <div style={S.sectionTitle}>Photos ({photoUrls.length})</div>
            <div style={S.photoGrid}>
              {photoUrls.map((p, i) => (
                <img key={i} src={p.url} alt={p.name} style={S.photoThumb} />
              ))}
            </div>
          </div>
        )}

        {/* ── INTERNAL NOTES ── */}
        {isFullReport && internalComments.length > 0 && (
          <div style={S.section}>
            <div style={S.sectionTitle}>Internal Notes</div>
            {internalComments.map(c => (
              <div key={c.id} style={S.commentInternal}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span><strong>{c.author.full_name}</strong><span style={S.internalBadge}>Internal</span></span>
                  <span style={S.commentMeta}>{fmtDateTime(c.created_at)}</span>
                </div>
                <div style={{ marginTop: '3px', whiteSpace: 'pre-wrap' }}>{c.comment_text}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── COMMENTS ── */}
        {externalComments.length > 0 && (
          <div style={S.section}>
            <div style={S.sectionTitle}>{isResident ? 'Comments' : 'Resident Communications'}</div>
            {externalComments.map(c => (
              <div key={c.id} style={S.commentBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <strong>{c.author.full_name}</strong>
                  <span style={S.commentMeta}>{fmtDateTime(c.created_at)}</span>
                </div>
                <div style={{ marginTop: '3px', whiteSpace: 'pre-wrap' }}>{c.comment_text}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── FILE ATTACHMENTS ── */}
        {attachments.length > 0 && (
          <div style={S.section}>
            <div style={S.sectionTitle}>Attachments ({attachments.length})</div>
            {attachments.map(a => (
              <div key={a.id} style={S.attachmentItem}>
                📎 {a.file_name}
                {a.file_type && <span style={{ color: '#888', marginLeft: '6px' }}>({a.file_type})</span>}
                <span style={{ color: '#888', marginLeft: '6px' }}>{fmtDateTime(a.created_at)}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── ACTIVITY TIMELINE ── */}
        {statusLog.length > 0 && (
          <div style={S.section}>
            <div style={S.sectionTitle}>Activity Timeline</div>
            {statusLog.map(entry => (
              <div key={entry.id} style={S.timelineRow}>
                <div style={S.timelineDate}>{fmtDateTime(entry.created_at)}</div>
                <div style={{ flex: 1 }}>
                  {entry.old_status
                    ? `${STATUS_LABELS[entry.old_status] ?? entry.old_status} → ${STATUS_LABELS[entry.new_status] ?? entry.new_status}`
                    : `Created as ${STATUS_LABELS[entry.new_status] ?? entry.new_status}`}
                  {entry.changed_by && <span style={{ color: '#666' }}> by {entry.changed_by.full_name}</span>}
                  {isFullReport && entry.notes && <div style={{ color: '#555', fontStyle: 'italic', marginTop: '1px' }}>{entry.notes}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── SIGNATURES ── */}
        {isFullReport && (
          <div style={S.section}>
            <div style={S.sectionTitle}>Signatures</div>
            <div style={S.sigSection}>
              <div><div style={{ height: '40px' }} /><div style={S.sigLine}>Technician Signature / Date</div></div>
              <div><div style={{ height: '40px' }} /><div style={S.sigLine}>Client / PM Signature / Date</div></div>
            </div>
          </div>
        )}

        {/* ── FOOTER ── */}
        <div style={S.footer}>
          <div>
            {isResident
              ? <>Resident Copy · Printed {fmtDate(new Date().toISOString())}<br />PlumbTix · Pro Roto Inc.</>
              : <>Printed {fmtDateTime(new Date().toISOString())} · PlumbTix<br />Pro Roto Inc. · CA Lic #947961 · Confidential</>
            }
          </div>
          <div style={{ fontSize: '8px', color: '#aaa', textAlign: 'right' as const }}>
            Ticket #{ticket.ticket_number}
          </div>
        </div>
      </div>
    );
  }
);
