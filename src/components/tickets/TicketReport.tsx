// =============================================================================
// PlumbTix — Printable Work Order Report (TicketReport)
// =============================================================================
// Renders a clean, black-and-white–friendly report for printing / Save as PDF.
// Two variants controlled by `userRole` prop:
//   • pm_admin / pm_user / proroto_admin → full report with internal notes
//   • resident → limited report; internal notes stripped, header badge added
//
// Usage: rendered inside a hidden <div className="print-report"> and revealed
// by @media print CSS. The parent calls window.print() once this is mounted.
// =============================================================================

import { useEffect, useState } from 'react';
import { fetchStatusLog, fetchAttachments, type StatusLogRow, type AttachmentRow } from '@/lib/tickets';
import { getTicketComments } from '@/lib/api';
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
  /** Called once the report data is loaded and ready to print */
  onReady?: () => void;
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

// ---------------------------------------------------------------------------
// Sub-components (all inline-styled for print isolation)
// ---------------------------------------------------------------------------

const S = {
  page: {
    fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
    fontSize: '11px',
    lineHeight: '1.5',
    color: '#1a1a1a',
    maxWidth: '800px',
    margin: '0 auto',
    padding: '20px 32px',
  } as React.CSSProperties,

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: '2px solid #1a1a1a',
    paddingBottom: '12px',
    marginBottom: '20px',
  } as React.CSSProperties,

  logo: {
    fontSize: '18px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
  } as React.CSSProperties,

  subtitle: {
    fontSize: '10px',
    color: '#666',
    marginTop: '2px',
  } as React.CSSProperties,

  headerRight: {
    textAlign: 'right' as const,
    fontSize: '10px',
    color: '#666',
  } as React.CSSProperties,

  residentBadge: {
    display: 'inline-block',
    fontSize: '9px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    padding: '2px 8px',
    border: '1px solid #999',
    borderRadius: '3px',
    color: '#555',
    marginTop: '6px',
  } as React.CSSProperties,

  section: {
    marginBottom: '16px',
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    borderBottom: '1px solid #ccc',
    paddingBottom: '4px',
    marginBottom: '8px',
    color: '#333',
  } as React.CSSProperties,

  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '11px',
  } as React.CSSProperties,

  th: {
    textAlign: 'left' as const,
    fontWeight: 600,
    padding: '4px 8px',
    width: '140px',
    verticalAlign: 'top' as const,
    color: '#555',
    fontSize: '10px',
  } as React.CSSProperties,

  td: {
    padding: '4px 8px',
    verticalAlign: 'top' as const,
  } as React.CSSProperties,

  commentBox: {
    padding: '6px 10px',
    marginBottom: '8px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '10px',
  } as React.CSSProperties,

  commentInternal: {
    padding: '6px 10px',
    marginBottom: '8px',
    border: '1px dashed #999',
    borderRadius: '4px',
    fontSize: '10px',
    background: '#f9f9f9',
  } as React.CSSProperties,

  internalBadge: {
    display: 'inline-block',
    fontSize: '8px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    padding: '1px 5px',
    border: '1px solid #999',
    borderRadius: '2px',
    marginLeft: '6px',
    color: '#666',
  } as React.CSSProperties,

  commentMeta: {
    color: '#666',
    fontSize: '9px',
  } as React.CSSProperties,

  timelineRow: {
    display: 'flex',
    gap: '12px',
    padding: '3px 0',
    fontSize: '10px',
    borderBottom: '1px solid #eee',
  } as React.CSSProperties,

  timelineDate: {
    width: '130px',
    flexShrink: 0,
    color: '#666',
    fontSize: '9px',
  } as React.CSSProperties,

  footer: {
    marginTop: '24px',
    paddingTop: '12px',
    borderTop: '1px solid #ccc',
    fontSize: '9px',
    color: '#888',
    textAlign: 'center' as const,
  } as React.CSSProperties,

  attachmentItem: {
    padding: '3px 0',
    fontSize: '10px',
    borderBottom: '1px solid #eee',
  } as React.CSSProperties,
};

// ---------------------------------------------------------------------------
// Main Report Component
// ---------------------------------------------------------------------------

export function TicketReport({ ticket, userRole, onReady }: TicketReportProps) {
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [statusLog, setStatusLog] = useState<StatusLogRow[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  const isResident = userRole === 'resident';
  const isPM = userRole === 'pm_admin' || userRole === 'pm_user';
  const isFullReport = !isResident; // proroto_admin, pm_admin, pm_user

  // Fetch supporting data
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

        if (commentsRes.ok) {
          setComments(commentsRes.data.comments as CommentEntry[]);
        }
        setStatusLog(logRows);
        setAttachments(attachRows);
      } catch {
        // Silently handle — report will still render with ticket data
      } finally {
        if (!cancelled) setDataLoaded(true);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [ticket.id]);

  // Signal ready to print
  useEffect(() => {
    if (dataLoaded && onReady) {
      // Small delay to let React paint the DOM
      const t = setTimeout(onReady, 150);
      return () => clearTimeout(t);
    }
  }, [dataLoaded, onReady]);

  // Filter comments by role
  const visibleComments = isResident
    ? comments.filter((c) => !c.is_internal)
    : comments;

  const internalComments = isFullReport
    ? comments.filter((c) => c.is_internal)
    : [];

  const externalComments = comments.filter((c) => !c.is_internal);

  // Build location string
  const bld = ticket.building;
  const spc = ticket.space;
  const spaceLabel = spc.space_type === 'unit' && spc.unit_number
    ? `Unit ${spc.unit_number}`
    : spc.common_area_type?.replace(/_/g, ' ') ?? spc.space_type;

  const sched = ticket.scheduling_preference as {
    type?: string; preferred_date?: string; preferred_time?: string;
  } | null;

  return (
    <div style={S.page}>
      {/* ─── HEADER ─── */}
      <div style={S.header}>
        <div>
          <div style={S.logo}>PlumbTix — Work Order</div>
          <div style={S.subtitle}>Pro Roto Inc. · CA License #947961</div>
          {isResident && (
            <div style={S.residentBadge}>Resident Copy — For your records</div>
          )}
        </div>
        <div style={S.headerRight}>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>
            #{ticket.ticket_number}
          </div>
          <div>Status: {STATUS_LABELS[ticket.status as TicketStatus] ?? ticket.status}</div>
          <div>Severity: {SEVERITY_LABELS[ticket.severity] ?? ticket.severity}</div>
          <div>Opened: {fmtDate(ticket.created_at)}</div>
          {ticket.completed_at && <div>Completed: {fmtDate(ticket.completed_at)}</div>}
        </div>
      </div>

      {/* ─── TICKET SUMMARY ─── */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Ticket Summary</div>
        <table style={S.table}>
          <tbody>
            <tr><td style={S.th}>Issue Type</td><td style={S.td}>{ISSUE_TYPE_LABELS[ticket.issue_type as IssueType] ?? ticket.issue_type}</td></tr>
            {ticket.description && (
              <tr><td style={S.th}>Description</td><td style={S.td}>{ticket.description}</td></tr>
            )}
            {ticket.access_instructions && (
              <tr><td style={S.th}>Access Instructions</td><td style={S.td}>{ticket.access_instructions}</td></tr>
            )}
            {sched && (
              <tr>
                <td style={S.th}>Scheduling</td>
                <td style={S.td}>
                  {sched.type === 'asap' ? 'ASAP' : 'Preferred window'}
                  {sched.preferred_date && ` — ${sched.preferred_date}`}
                  {sched.preferred_time && ` (${sched.preferred_time})`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ─── LOCATION ─── */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Location</div>
        <table style={S.table}>
          <tbody>
            <tr>
              <td style={S.th}>Building</td>
              <td style={S.td}>
                {bld.name && <strong>{bld.name} — </strong>}
                {bld.address_line1}
                {bld.address_line2 && `, ${bld.address_line2}`}
                , {bld.city}, {bld.state} {bld.zip}
              </td>
            </tr>
            <tr><td style={S.th}>Space</td><td style={S.td}>{spaceLabel}{spc.floor != null && ` (Floor ${spc.floor})`}</td></tr>
            {/* Gate code & onsite contact — only for full report */}
            {isFullReport && bld.gate_code && (
              <tr><td style={S.th}>Gate Code</td><td style={S.td}>{bld.gate_code}</td></tr>
            )}
            {isFullReport && bld.onsite_contact_name && (
              <tr>
                <td style={S.th}>Onsite Contact</td>
                <td style={S.td}>
                  {bld.onsite_contact_name}
                  {bld.onsite_contact_phone && ` — ${bld.onsite_contact_phone}`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ─── WORK DETAILS ─── */}
      {(ticket.assigned_technician || ticket.scheduled_date || ticket.quote_amount !== null || ticket.invoice_number || ticket.completed_at) && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Work Details</div>
          <table style={S.table}>
            <tbody>
              {ticket.assigned_technician && (
                <tr><td style={S.th}>Technician</td><td style={S.td}>{ticket.assigned_technician}</td></tr>
              )}
              {ticket.scheduled_date && (
                <tr>
                  <td style={S.th}>Scheduled</td>
                  <td style={S.td}>
                    {ticket.scheduled_date}
                    {ticket.scheduled_time_window && ` (${ticket.scheduled_time_window})`}
                  </td>
                </tr>
              )}
              {/* Quote & Invoice — hide from residents for privacy */}
              {isFullReport && ticket.quote_amount !== null && (
                <tr><td style={S.th}>Quote</td><td style={S.td}>{fmtCurrency(ticket.quote_amount)}</td></tr>
              )}
              {isFullReport && ticket.invoice_number && (
                <tr><td style={S.th}>Invoice #</td><td style={S.td}>{ticket.invoice_number}</td></tr>
              )}
              {ticket.completed_at && (
                <tr><td style={S.th}>Completed</td><td style={S.td}>{fmtDateTime(ticket.completed_at)}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── REPORTED BY ─── */}
      {ticket.created_by && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Reported By</div>
          <table style={S.table}>
            <tbody>
              <tr><td style={S.th}>Name</td><td style={S.td}>{ticket.created_by.full_name}</td></tr>
              <tr><td style={S.th}>Email</td><td style={S.td}>{ticket.created_by.email}</td></tr>
              {ticket.created_by.phone && (
                <tr><td style={S.th}>Phone</td><td style={S.td}>{ticket.created_by.phone}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── INTERNAL NOTES (full report only) ─── */}
      {isFullReport && internalComments.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Internal Notes</div>
          {internalComments.map((c) => (
            <div key={c.id} style={S.commentInternal}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span>
                  <strong>{c.author.full_name}</strong>
                  <span style={S.internalBadge}>Internal</span>
                </span>
                <span style={S.commentMeta}>{fmtDateTime(c.created_at)}</span>
              </div>
              <div style={{ marginTop: '3px', whiteSpace: 'pre-wrap' }}>{c.comment_text}</div>
            </div>
          ))}
        </div>
      )}

      {/* ─── COMMENTS ─── */}
      {externalComments.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>
            {isResident ? 'Comments' : 'Resident Communications'}
          </div>
          {externalComments.map((c) => (
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

      {/* ─── ATTACHMENTS ─── */}
      {attachments.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Attachments ({attachments.length})</div>
          {attachments.map((a) => (
            <div key={a.id} style={S.attachmentItem}>
              📎 {a.file_name}
              {a.file_type && <span style={{ color: '#888', marginLeft: '6px' }}>({a.file_type})</span>}
              <span style={{ color: '#888', marginLeft: '6px' }}>{fmtDateTime(a.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ─── ACTIVITY TIMELINE ─── */}
      {statusLog.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Activity Timeline</div>
          {statusLog.map((entry) => (
            <div key={entry.id} style={S.timelineRow}>
              <div style={S.timelineDate}>{fmtDateTime(entry.created_at)}</div>
              <div style={{ flex: 1 }}>
                {entry.old_status
                  ? `${STATUS_LABELS[entry.old_status] ?? entry.old_status} → ${STATUS_LABELS[entry.new_status] ?? entry.new_status}`
                  : `Created as ${STATUS_LABELS[entry.new_status] ?? entry.new_status}`}
                {entry.changed_by && (
                  <span style={{ color: '#666' }}> by {entry.changed_by.full_name}</span>
                )}
                {/* Status change notes — hide from residents */}
                {isFullReport && entry.notes && (
                  <div style={{ color: '#555', fontStyle: 'italic', marginTop: '1px' }}>
                    {entry.notes}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── FOOTER ─── */}
      <div style={S.footer}>
        {isResident ? (
          <div>
            Resident Copy — For your records · Printed {fmtDate(new Date().toISOString())}
            <br />PlumbTix Work Order Management · Pro Roto Inc.
          </div>
        ) : (
          <div>
            Printed {fmtDateTime(new Date().toISOString())} · PlumbTix Work Order Management
            <br />Pro Roto Inc. · CA Lic #947961 · Confidential
          </div>
        )}
      </div>
    </div>
  );
}
