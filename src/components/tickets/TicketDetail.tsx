import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchTicketDetail, type TicketDetailRow } from '@/lib/tickets';
import { useAuth } from '@/lib/auth';
import { StatusBadge } from './StatusBadge';
import { SeverityBadge } from './SeverityBadge';
import { StatusTimeline } from './StatusTimeline';
import { CommentsThread } from './CommentsThread';
import { AttachmentsList } from './AttachmentsList';
import { ActionPanel } from './ActionPanel';
import { Loading } from '@/components/Loading';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ISSUE_TYPE_LABELS } from '@shared/types/enums';
import type { TicketStatus } from '@shared/types/enums';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function formatCurrency(amount: number | null): string {
  if (amount === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function TicketDetail() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === 'proroto_admin';

  const [ticket, setTicket] = useState<TicketDetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTicketDetail(ticketId);
      setTicket(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  const handleUpdated = () => {
    load();
    setRefreshKey((k) => k + 1);
  };

  if (loading) return <Loading message="Loading ticket…" />;
  if (error) return <ErrorBanner message={error} />;
  if (!ticket) return <ErrorBanner message="Ticket not found" />;

  const bld = ticket.building;
  const spc = ticket.space;
  const sched = ticket.scheduling_preference as { type?: string; preferred_date?: string; preferred_time?: string } | null;

  return (
    <div>
      {/* Back link */}
      <button
        onClick={() => navigate('..')}
        style={backLink}
      >
        ← Back to tickets
      </button>

      {/* Header */}
      <div style={headerStyle}>
        <div>
          <h2 style={{ fontSize: '1.3rem', margin: 0 }}>
            Ticket #{ticket.ticket_number}
          </h2>
          <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '2px' }}>
            Opened {formatDateTime(ticket.created_at)} by {ticket.created_by?.full_name ?? 'Unknown'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <SeverityBadge severity={ticket.severity} />
          <StatusBadge status={ticket.status} />
        </div>
      </div>

      {/* Two-column layout on wider screens */}
      <div style={gridLayout}>
        {/* Left: ticket info + timeline + comments */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Ticket info */}
          <section style={cardStyle}>
            <h3 style={sectionTitle}>Ticket Details</h3>
            <dl style={dlStyle}>
              <dt>Issue Type</dt>
              <dd>{ISSUE_TYPE_LABELS[ticket.issue_type as keyof typeof ISSUE_TYPE_LABELS] ?? ticket.issue_type}</dd>

              <dt>Description</dt>
              <dd style={{ whiteSpace: 'pre-wrap' }}>{ticket.description ?? '—'}</dd>

              {ticket.access_instructions && (
                <>
                  <dt>Access Instructions</dt>
                  <dd>{ticket.access_instructions}</dd>
                </>
              )}

              {sched && (
                <>
                  <dt>Scheduling Preference</dt>
                  <dd>
                    {sched.type === 'asap' ? 'ASAP' : 'Preferred window'}
                    {sched.preferred_date && ` — ${sched.preferred_date}`}
                    {sched.preferred_time && ` (${sched.preferred_time})`}
                  </dd>
                </>
              )}
            </dl>
          </section>

          {/* Building + space info */}
          <section style={cardStyle}>
            <h3 style={sectionTitle}>Location</h3>
            <dl style={dlStyle}>
              <dt>Building</dt>
              <dd>
                {bld.name && <>{bld.name} — </>}
                {bld.address_line1}
                {bld.address_line2 && `, ${bld.address_line2}`}
                , {bld.city}, {bld.state} {bld.zip}
              </dd>

              <dt>Space</dt>
              <dd>
                {spc.space_type === 'unit' && spc.unit_number
                  ? `Unit ${spc.unit_number}`
                  : spc.common_area_type?.replace(/_/g, ' ') ?? spc.space_type}
                {spc.floor !== null && spc.floor !== undefined && ` (Floor ${spc.floor})`}
              </dd>

              {isAdmin && bld.gate_code && (
                <>
                  <dt>Gate Code</dt>
                  <dd>{bld.gate_code}</dd>
                </>
              )}

              {isAdmin && bld.onsite_contact_name && (
                <>
                  <dt>Onsite Contact</dt>
                  <dd>{bld.onsite_contact_name} {bld.onsite_contact_phone && `— ${bld.onsite_contact_phone}`}</dd>
                </>
              )}
            </dl>
          </section>

          {/* Work details (admin-visible fields) */}
          {(ticket.assigned_technician || ticket.scheduled_date || ticket.quote_amount !== null || ticket.invoice_number || ticket.completed_at) && (
            <section style={cardStyle}>
              <h3 style={sectionTitle}>Work Details</h3>
              <dl style={dlStyle}>
                {ticket.assigned_technician && (
                  <>
                    <dt>Technician</dt>
                    <dd>{ticket.assigned_technician}</dd>
                  </>
                )}
                {ticket.scheduled_date && (
                  <>
                    <dt>Scheduled</dt>
                    <dd>{ticket.scheduled_date}{ticket.scheduled_time_window && ` (${ticket.scheduled_time_window})`}</dd>
                  </>
                )}
                {ticket.quote_amount !== null && (
                  <>
                    <dt>Quote</dt>
                    <dd>{formatCurrency(ticket.quote_amount)}</dd>
                  </>
                )}
                {ticket.invoice_number && (
                  <>
                    <dt>Invoice</dt>
                    <dd>{ticket.invoice_number}</dd>
                  </>
                )}
                {ticket.completed_at && (
                  <>
                    <dt>Completed</dt>
                    <dd>{formatDateTime(ticket.completed_at)}</dd>
                  </>
                )}
              </dl>
            </section>
          )}

          {/* Status timeline */}
          <section style={cardStyle}>
            <StatusTimeline ticketId={ticket.id} refreshKey={refreshKey} />
          </section>

          {/* Comments */}
          <section style={cardStyle}>
            <CommentsThread ticketId={ticket.id} />
          </section>
        </div>

        {/* Right: action panel + attachments */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <ActionPanel
            ticketId={ticket.id}
            currentStatus={ticket.status as TicketStatus}
            onUpdated={handleUpdated}
          />
          <div style={cardStyle}>
            <AttachmentsList ticketId={ticket.id} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Styles
const backLink: React.CSSProperties = {
  background: 'none', border: 'none', color: '#2563eb',
  cursor: 'pointer', fontSize: '0.85rem', padding: '0',
  marginBottom: '16px', display: 'inline-block',
};
const headerStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  flexWrap: 'wrap', gap: '12px', marginBottom: '24px',
  paddingBottom: '16px', borderBottom: '1px solid #e5e7eb',
};
const gridLayout: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)',
  gap: '24px',
  alignItems: 'start',
};
const cardStyle: React.CSSProperties = {
  padding: '16px', background: '#fff', borderRadius: '8px',
  border: '1px solid #e5e7eb',
};
const sectionTitle: React.CSSProperties = {
  fontSize: '1rem', fontWeight: 600, marginBottom: '12px',
  paddingBottom: '8px', borderBottom: '1px solid #e5e7eb',
};
const dlStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'auto 1fr',
  gap: '6px 16px', fontSize: '0.9rem', margin: 0,
};
