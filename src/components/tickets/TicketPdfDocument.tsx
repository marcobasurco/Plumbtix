// =============================================================================
// PlumbTix — Programmatic PDF Work Order (@react-pdf/renderer)
// =============================================================================
// Generates a crisp, vector-based PDF with perfect typography, multi-page
// support, embedded images, and QR code. NO html2canvas, no blank/black pages.
// =============================================================================

import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from '@react-pdf/renderer';
import type { TicketDetailRow, StatusLogRow } from '@/lib/tickets';
import type { UserRole, TicketStatus, IssueType } from '@shared/types/enums';
import { STATUS_LABELS, ISSUE_TYPE_LABELS, SEVERITY_LABELS } from '@shared/types/enums';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PdfCommentEntry {
  id: string;
  comment_text: string;
  is_internal: boolean;
  created_at: string;
  author: { full_name: string; role: string };
}

export interface PdfTicketData {
  statusLog: StatusLogRow[];
  comments: PdfCommentEntry[];
  photoUrls: { name: string; url: string }[];
}

interface Props {
  ticket: TicketDetailRow;
  userRole: UserRole;
  data: PdfTicketData;
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
  if (amount === null) return '\u2014';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function fmtPhone(raw: string | null): string {
  if (!raw) return '';
  const d = raw.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

function qrUrl(data: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(data)}&format=png`;
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const C = {
  black: '#1a1a1a',
  dark: '#333333',
  mid: '#555555',
  light: '#888888',
  faint: '#cccccc',
  hairline: '#e5e5e5',
  bg: '#f8f9fa',
  white: '#ffffff',
  red: '#dc2626',
  amber: '#d97706',
  blue: '#2563eb',
};

const SEV_BG: Record<string, string> = {
  emergency: C.red,
  urgent: C.amber,
  standard: C.blue,
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.black,
    paddingTop: 50,
    paddingBottom: 60,
    paddingHorizontal: 50,
    backgroundColor: C.white,
  },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  headerLeft: { maxWidth: '55%' },
  headerRight: { alignItems: 'flex-end', maxWidth: '45%' },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', letterSpacing: -0.3 },
  subtitle: { fontSize: 8, color: C.mid, marginTop: 1 },
  woLabel: {
    fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.white,
    backgroundColor: C.black, paddingHorizontal: 8, paddingVertical: 3,
    marginBottom: 4, textAlign: 'center', letterSpacing: 1.5,
  },
  ticketNum: { fontSize: 20, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  headerMeta: { fontSize: 8, color: C.mid, textAlign: 'right', marginTop: 1 },
  headerLine: { borderBottomWidth: 2, borderBottomColor: C.black, marginVertical: 8 },
  qrWrap: { alignItems: 'center', marginTop: 4 },
  qrImg: { width: 56, height: 56 },
  qrLabel: { fontSize: 6, color: C.light, marginTop: 1 },

  // Badge
  sevBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2, marginTop: 3, alignSelf: 'flex-end' },
  sevText: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.white, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Sections
  section: { marginTop: 12 },
  sectionHead: {
    fontSize: 9, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase',
    letterSpacing: 0.8, color: C.dark, borderBottomWidth: 1,
    borderBottomColor: C.faint, paddingBottom: 3, marginBottom: 6,
  },

  // Table rows
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.mid, width: 110, textTransform: 'uppercase', letterSpacing: 0.3 },
  value: { fontSize: 9, color: C.black, flex: 1 },
  valueBold: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.black, flex: 1 },

  // Inline badge
  inlineBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 2, alignSelf: 'flex-start' },
  inlineBadgeText: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.white, textTransform: 'uppercase' },

  // Timeline
  timelineEntry: { flexDirection: 'row', marginBottom: 4, paddingBottom: 4, borderBottomWidth: 0.5, borderBottomColor: C.hairline },
  timelineDate: { fontSize: 7, color: C.light, width: 100 },
  timelineContent: { fontSize: 8, color: C.dark, flex: 1 },
  timelineNote: { fontSize: 7, fontFamily: 'Helvetica-Oblique', color: C.mid, marginTop: 1 },

  // Comments
  commentBox: { padding: 6, marginBottom: 5, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 3, backgroundColor: C.bg },
  commentInternal: { padding: 6, marginBottom: 5, borderWidth: 0.5, borderColor: C.faint, borderRadius: 3, borderStyle: 'dashed' },
  commentAuthor: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  commentMeta: { fontSize: 7, color: C.light },
  commentText: { fontSize: 8, color: C.dark, marginTop: 2 },
  internalTag: { fontSize: 6, fontFamily: 'Helvetica-Bold', color: C.mid, backgroundColor: C.hairline, paddingHorizontal: 3, paddingVertical: 1, borderRadius: 1, marginLeft: 4 },

  // Photos
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  photoWrap: { width: '48%', marginBottom: 6, marginRight: '2%' },
  photo: { width: '100%', height: 150, objectFit: 'cover', borderRadius: 3, borderWidth: 0.5, borderColor: C.faint },
  photoCaption: { fontSize: 6, color: C.light, marginTop: 2, textAlign: 'center' },

  // Signatures
  sigGrid: { flexDirection: 'row', marginTop: 16 },
  sigBlock: { flex: 1 },
  sigLine: { borderTopWidth: 1, borderTopColor: C.dark, paddingTop: 4 },
  sigLabel: { fontSize: 8, color: C.mid },

  // Footer
  footer: {
    position: 'absolute', bottom: 25, left: 50, right: 50,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 0.5, borderTopColor: C.faint, paddingTop: 6,
  },
  footerText: { fontSize: 7, color: C.light },
  footerRight: { fontSize: 7, color: C.light, textAlign: 'right' },

  // Logo
  logo: { width: 100, height: 36, objectFit: 'contain', marginBottom: 4 },

  emptyText: { fontSize: 8, color: C.light, fontFamily: 'Helvetica-Oblique' },

  // Resident badge
  resBadge: { marginTop: 4, borderWidth: 0.5, borderColor: C.light, borderRadius: 2, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  resBadgeText: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.mid, textTransform: 'uppercase', letterSpacing: 0.5 },
  companyName: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.dark, marginTop: 3 },
});

// ---------------------------------------------------------------------------
// Main Document Component
// ---------------------------------------------------------------------------

export function TicketPdfDocument({ ticket, userRole, data }: Props) {
  const isResident = userRole === 'resident';
  const isFullReport = !isResident;
  const { statusLog, comments, photoUrls } = data;

  const bld = ticket.building;
  const spc = ticket.space;
  const spaceLabel = spc.space_type === 'unit' && spc.unit_number
    ? `Unit ${spc.unit_number}`
    : spc.common_area_type?.replace(/_/g, ' ') ?? spc.space_type;

  const sched = ticket.scheduling_preference as {
    type?: string; preferred_date?: string; preferred_time?: string;
  } | null;

  const ticketUrl = `https://workorders.proroto.com/tickets/${ticket.id}`;
  const qrSrc = qrUrl(ticketUrl);
  const logoUrl = bld.company?.logo_url || null;
  const companyName = bld.company?.name || 'Pro Roto Inc.';

  const internalComments = isFullReport ? comments.filter(c => c.is_internal) : [];
  const externalComments = comments.filter(c => !c.is_internal);

  const printDate = fmtDateTime(new Date().toISOString());
  const sevColor = SEV_BG[ticket.severity] || C.blue;

  return (
    <Document
      title={`Work Order #${ticket.ticket_number}`}
      author="PlumbTix — Pro Roto Inc."
      subject={`Work Order ${ticket.ticket_number}`}
    >
      <Page size="LETTER" style={s.page} wrap>

        {/* ── HEADER ── */}
        <View style={s.header} fixed>
          <View style={s.headerLeft}>
            {logoUrl && <Image src={logoUrl} style={s.logo} />}
            <Text style={s.title}>PlumbTix — Work Order</Text>
            <Text style={s.subtitle}>Pro Roto Inc. · CA License #947961</Text>
            <Text style={s.subtitle}>(650) 338-8332 · proroto.com</Text>
            {companyName !== 'Pro Roto Inc.' && (
              <Text style={s.companyName}>Managed by: {companyName}</Text>
            )}
            {isResident && (
              <View style={s.resBadge}>
                <Text style={s.resBadgeText}>Resident Copy</Text>
              </View>
            )}
          </View>
          <View style={s.headerRight}>
            <Text style={s.woLabel}>WORK ORDER</Text>
            <Text style={s.ticketNum}>#{ticket.ticket_number}</Text>
            <Text style={s.headerMeta}>
              Status: {STATUS_LABELS[ticket.status as TicketStatus] ?? ticket.status}
            </Text>
            <View style={[s.sevBadge, { backgroundColor: sevColor }]}>
              <Text style={s.sevText}>
                {SEVERITY_LABELS[ticket.severity as keyof typeof SEVERITY_LABELS] ?? ticket.severity}
              </Text>
            </View>
            <Text style={[s.headerMeta, { marginTop: 4 }]}>Opened: {fmtDate(ticket.created_at)}</Text>
            {ticket.completed_at && (
              <Text style={s.headerMeta}>Completed: {fmtDate(ticket.completed_at)}</Text>
            )}
            <View style={s.qrWrap}>
              <Image src={qrSrc} style={s.qrImg} />
              <Text style={s.qrLabel}>Scan to view online</Text>
            </View>
          </View>
        </View>

        <View style={s.headerLine} />

        {/* ── TICKET SUMMARY ── */}
        <View style={s.section}>
          <Text style={s.sectionHead}>Ticket Summary</Text>
          <View style={s.row}>
            <Text style={s.label}>Issue Type</Text>
            <Text style={s.value}>{ISSUE_TYPE_LABELS[ticket.issue_type as IssueType] ?? ticket.issue_type}</Text>
          </View>
          {ticket.description && (
            <View style={s.row}>
              <Text style={s.label}>Description</Text>
              <Text style={s.value}>{ticket.description}</Text>
            </View>
          )}
          {ticket.access_instructions && (
            <View style={s.row}>
              <Text style={s.label}>Access</Text>
              <Text style={s.value}>{ticket.access_instructions}</Text>
            </View>
          )}
          {sched && (
            <View style={s.row}>
              <Text style={s.label}>Scheduling</Text>
              <Text style={s.value}>
                {sched.type === 'asap' ? 'ASAP' : 'Preferred'}
                {sched.preferred_date ? ` \u2014 ${sched.preferred_date}` : ''}
                {sched.preferred_time ? ` (${sched.preferred_time})` : ''}
              </Text>
            </View>
          )}
          <View style={s.row}>
            <Text style={s.label}>Priority</Text>
            <View style={[s.inlineBadge, { backgroundColor: sevColor }]}>
              <Text style={s.inlineBadgeText}>
                {SEVERITY_LABELS[ticket.severity as keyof typeof SEVERITY_LABELS] ?? ticket.severity}
              </Text>
            </View>
          </View>
        </View>

        {/* ── LOCATION ── */}
        <View style={s.section}>
          <Text style={s.sectionHead}>Location</Text>
          <View style={s.row}>
            <Text style={s.label}>Building</Text>
            <Text style={s.valueBold}>
              {bld.name ? `${bld.name} \u2014 ` : ''}
              {bld.address_line1}
              {bld.address_line2 ? `, ${bld.address_line2}` : ''}
              , {bld.city}, {bld.state} {bld.zip}
            </Text>
          </View>
          <View style={s.row}>
            <Text style={s.label}>Space</Text>
            <Text style={s.value}>{spaceLabel}{spc.floor != null ? ` (Floor ${spc.floor})` : ''}</Text>
          </View>
          {isFullReport && bld.gate_code && (
            <View style={s.row}>
              <Text style={s.label}>Gate Code</Text>
              <Text style={s.valueBold}>{bld.gate_code}</Text>
            </View>
          )}
          {isFullReport && bld.onsite_contact_name && (
            <View style={s.row}>
              <Text style={s.label}>Onsite Contact</Text>
              <Text style={s.value}>
                {bld.onsite_contact_name}
                {bld.onsite_contact_phone ? ` \u2014 ${fmtPhone(bld.onsite_contact_phone)}` : ''}
              </Text>
            </View>
          )}
        </View>

        {/* ── WORK DETAILS ── */}
        {(ticket.assigned_technician || ticket.scheduled_date || ticket.quote_amount !== null || ticket.invoice_number || ticket.completed_at) && (
          <View style={s.section}>
            <Text style={s.sectionHead}>Work Details</Text>
            {ticket.assigned_technician && (
              <View style={s.row}>
                <Text style={s.label}>Technician</Text>
                <Text style={s.valueBold}>{ticket.assigned_technician}</Text>
              </View>
            )}
            {ticket.scheduled_date && (
              <View style={s.row}>
                <Text style={s.label}>Scheduled</Text>
                <Text style={s.value}>
                  {ticket.scheduled_date}{ticket.scheduled_time_window ? ` (${ticket.scheduled_time_window})` : ''}
                </Text>
              </View>
            )}
            {isFullReport && ticket.quote_amount !== null && (
              <View style={s.row}>
                <Text style={s.label}>Quote</Text>
                <Text style={s.value}>{fmtCurrency(ticket.quote_amount)}</Text>
              </View>
            )}
            {isFullReport && ticket.invoice_number && (
              <View style={s.row}>
                <Text style={s.label}>Invoice #</Text>
                <Text style={s.value}>{ticket.invoice_number}</Text>
              </View>
            )}
            {ticket.completed_at && (
              <View style={s.row}>
                <Text style={s.label}>Completed</Text>
                <Text style={s.value}>{fmtDateTime(ticket.completed_at)}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── REPORTED BY ── */}
        {ticket.created_by && (
          <View style={s.section}>
            <Text style={s.sectionHead}>Reported By</Text>
            <View style={s.row}>
              <Text style={s.label}>Name</Text>
              <Text style={s.value}>{ticket.created_by.full_name}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>Email</Text>
              <Text style={s.value}>{ticket.created_by.email}</Text>
            </View>
            {ticket.created_by.phone && (
              <View style={s.row}>
                <Text style={s.label}>Phone</Text>
                <Text style={s.value}>{fmtPhone(ticket.created_by.phone)}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── PHOTOS ── */}
        <View style={s.section} wrap>
          <Text style={s.sectionHead}>Photos ({photoUrls.length})</Text>
          {photoUrls.length > 0 ? (
            <View style={s.photoGrid}>
              {photoUrls.map((p, i) => (
                <View key={i} style={s.photoWrap} wrap={false}>
                  <Image src={p.url} style={s.photo} />
                  <Text style={s.photoCaption}>{p.name}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.emptyText}>No photos attached</Text>
          )}
        </View>

        {/* ── INTERNAL NOTES ── */}
        {isFullReport && internalComments.length > 0 && (
          <View style={s.section} wrap>
            <Text style={s.sectionHead}>Internal Notes</Text>
            {internalComments.map(c => (
              <View key={c.id} style={s.commentInternal} wrap={false}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={s.commentAuthor}>{c.author.full_name}</Text>
                    <Text style={s.internalTag}>INTERNAL</Text>
                  </View>
                  <Text style={s.commentMeta}>{fmtDateTime(c.created_at)}</Text>
                </View>
                <Text style={s.commentText}>{c.comment_text}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── COMMENTS ── */}
        {externalComments.length > 0 && (
          <View style={s.section} wrap>
            <Text style={s.sectionHead}>{isResident ? 'Comments' : 'Resident Communications'}</Text>
            {externalComments.map(c => (
              <View key={c.id} style={s.commentBox} wrap={false}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={s.commentAuthor}>{c.author.full_name}</Text>
                  <Text style={s.commentMeta}>{fmtDateTime(c.created_at)}</Text>
                </View>
                <Text style={s.commentText}>{c.comment_text}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── ACTIVITY TIMELINE ── */}
        {statusLog.length > 0 && (
          <View style={s.section} wrap>
            <Text style={s.sectionHead}>Activity Timeline</Text>
            {statusLog.map(entry => (
              <View key={entry.id} style={s.timelineEntry} wrap={false}>
                <Text style={s.timelineDate}>{fmtDateTime(entry.created_at)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.timelineContent}>
                    {entry.old_status
                      ? `${STATUS_LABELS[entry.old_status] ?? entry.old_status} \u2192 ${STATUS_LABELS[entry.new_status] ?? entry.new_status}`
                      : `Created as ${STATUS_LABELS[entry.new_status] ?? entry.new_status}`}
                    {entry.changed_by ? ` by ${entry.changed_by.full_name}` : ''}
                  </Text>
                  {isFullReport && entry.notes && (
                    <Text style={s.timelineNote}>{entry.notes}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── SIGNATURES ── */}
        {isFullReport && (
          <View style={s.section} wrap={false}>
            <Text style={s.sectionHead}>Signatures</Text>
            <View style={s.sigGrid}>
              <View style={[s.sigBlock, { marginRight: 20 }]}>
                <View style={{ height: 36 }} />
                <View style={s.sigLine}>
                  <Text style={s.sigLabel}>Technician Signature / Date</Text>
                </View>
              </View>
              <View style={[s.sigBlock, { marginLeft: 20 }]}>
                <View style={{ height: 36 }} />
                <View style={s.sigLine}>
                  <Text style={s.sigLabel}>Client / PM Signature / Date</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ── FOOTER (every page) ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {isResident
              ? `Resident Copy \u00B7 Printed ${printDate} \u00B7 PlumbTix \u00B7 Pro Roto Inc.`
              : `Printed ${printDate} \u00B7 PlumbTix \u00B7 Pro Roto Inc. \u00B7 CA Lic #947961 \u00B7 Confidential`}
          </Text>
          <Text
            style={s.footerRight}
            render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
              `Ticket #${ticket.ticket_number}  \u00B7  Page ${pageNumber} / ${totalPages}`
            }
          />
        </View>

      </Page>
    </Document>
  );
}
