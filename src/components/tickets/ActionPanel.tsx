import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { updateTicket } from '@/lib/api';
import { getAllowedTransitions, isTerminalStatus } from '@shared/types/transitions';
import { STATUS_LABELS } from '@shared/types/enums';
import type { TicketStatus } from '@shared/types/enums';
import { ErrorBanner } from '@/components/ErrorBanner';

interface ActionPanelProps {
  ticketId: string;
  currentStatus: TicketStatus;
  /** Called after a successful update so parent can refetch */
  onUpdated: () => void;
}

export function ActionPanel({ ticketId, currentStatus, onUpdated }: ActionPanelProps) {
  const { role } = useAuth();
  const isAdmin = role === 'proroto_admin';

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Admin-only fields
  const [technician, setTechnician] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [timeWindow, setTimeWindow] = useState('');
  const [quoteAmount, setQuoteAmount] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [declineReason, setDeclineReason] = useState('');

  if (!role) return null;

  const allowed = getAllowedTransitions(currentStatus, role);
  const terminal = isTerminalStatus(currentStatus);

  const handleTransition = async (targetStatus: TicketStatus) => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    // Build payload
    const payload: Record<string, unknown> = {
      ticket_id: ticketId,
      status: targetStatus,
    };

    // Attach admin fields if set
    if (isAdmin) {
      if (technician.trim()) payload.assigned_technician = technician.trim();
      if (scheduledDate) payload.scheduled_date = scheduledDate;
      if (timeWindow.trim()) payload.scheduled_time_window = timeWindow.trim();
      if (quoteAmount) payload.quote_amount = parseFloat(quoteAmount);
      if (invoiceNumber.trim()) payload.invoice_number = invoiceNumber.trim();
    }

    // Decline reason for PM cancellation of waiting_approval
    if (targetStatus === 'cancelled' && declineReason.trim()) {
      payload.decline_reason = declineReason.trim();
    }

    const result = await updateTicket(payload as Parameters<typeof updateTicket>[0]);

    if (result.ok) {
      setSuccess(`Ticket updated to ${STATUS_LABELS[targetStatus]}`);
      // Clear fields
      setTechnician('');
      setScheduledDate('');
      setTimeWindow('');
      setQuoteAmount('');
      setInvoiceNumber('');
      setDeclineReason('');
      onUpdated();
    } else {
      setError(result.error.message);
    }
    setSubmitting(false);
  };

  const handleFieldUpdate = async () => {
    if (!isAdmin) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const payload: Record<string, unknown> = { ticket_id: ticketId };
    let hasChanges = false;

    if (technician.trim()) { payload.assigned_technician = technician.trim(); hasChanges = true; }
    if (scheduledDate) { payload.scheduled_date = scheduledDate; hasChanges = true; }
    if (timeWindow.trim()) { payload.scheduled_time_window = timeWindow.trim(); hasChanges = true; }
    if (quoteAmount) { payload.quote_amount = parseFloat(quoteAmount); hasChanges = true; }
    if (invoiceNumber.trim()) { payload.invoice_number = invoiceNumber.trim(); hasChanges = true; }

    if (!hasChanges) {
      setError('No fields to update');
      setSubmitting(false);
      return;
    }

    const result = await updateTicket(payload as Parameters<typeof updateTicket>[0]);
    if (result.ok) {
      setSuccess('Ticket fields updated');
      setTechnician(''); setScheduledDate(''); setTimeWindow('');
      setQuoteAmount(''); setInvoiceNumber('');
      onUpdated();
    } else {
      setError(result.error.message);
    }
    setSubmitting(false);
  };

  return (
    <div style={panelStyle}>
      <h3 style={sectionTitle}>Actions</h3>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {success && (
        <div className="success-box" style={{ marginBottom: '12px', fontSize: '0.85rem' }}>
          {success}
        </div>
      )}

      {terminal ? (
        <p style={mutedStyle}>
          This ticket is {STATUS_LABELS[currentStatus].toLowerCase()} — no further transitions available.
        </p>
      ) : allowed.length === 0 ? (
        <p style={mutedStyle}>
          No actions available for your role on this ticket.
        </p>
      ) : (
        <>
          {/* Transition buttons */}
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '8px' }}>
              Move ticket from <strong>{STATUS_LABELS[currentStatus]}</strong> to:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {allowed.map((target) => (
                <button
                  key={target}
                  onClick={() => handleTransition(target)}
                  disabled={submitting}
                  style={{
                    ...transitionBtn,
                    ...(target === 'cancelled' ? cancelledBtn : {}),
                  }}
                >
                  {STATUS_LABELS[target]}
                </button>
              ))}
            </div>
          </div>

          {/* Decline reason for PM cancellation of waiting_approval */}
          {currentStatus === 'waiting_approval' && !isAdmin && allowed.includes('cancelled') && (
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Decline reason (optional)</label>
              <input
                type="text"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Reason for declining the work"
                style={inputStyle}
              />
            </div>
          )}
        </>
      )}

      {/* Admin-only: editable fields */}
      {isAdmin && !terminal && (
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginTop: '8px' }}>
          <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '8px', fontWeight: 600 }}>
            Update Fields (Admin Only)
          </p>

          <div style={fieldGrid}>
            <div>
              <label style={labelStyle}>Assigned Technician</label>
              <input type="text" value={technician} onChange={(e) => setTechnician(e.target.value)} placeholder="e.g. Bryan" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Scheduled Date</label>
              <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Time Window</label>
              <input type="text" value={timeWindow} onChange={(e) => setTimeWindow(e.target.value)} placeholder="e.g. 9am-12pm" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Quote Amount ($)</label>
              <input type="number" value={quoteAmount} onChange={(e) => setQuoteAmount(e.target.value)} placeholder="0.00" min="0" step="0.01" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Invoice Number</label>
              <input type="text" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-001" style={inputStyle} />
            </div>
          </div>

          <button
            onClick={handleFieldUpdate}
            disabled={submitting}
            className="btn btn-primary"
            style={{ width: 'auto', padding: '6px 16px', fontSize: '0.85rem', marginTop: '8px' }}
          >
            {submitting ? 'Saving…' : 'Save Fields'}
          </button>
        </div>
      )}
    </div>
  );
}

// Styles
const panelStyle: React.CSSProperties = {
  padding: '16px', background: '#f9fafb', borderRadius: '8px',
  border: '1px solid #e5e7eb',
};
const sectionTitle: React.CSSProperties = {
  fontSize: '1rem', fontWeight: 600, marginBottom: '12px',
  paddingBottom: '8px', borderBottom: '1px solid #e5e7eb',
};
const mutedStyle: React.CSSProperties = { color: '#9ca3af', fontSize: '0.85rem' };
const transitionBtn: React.CSSProperties = {
  padding: '6px 14px', fontSize: '0.85rem', fontWeight: 600,
  background: '#2563eb', color: '#fff', border: 'none',
  borderRadius: '6px', cursor: 'pointer',
};
const cancelledBtn: React.CSSProperties = {
  background: '#dc2626',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.8rem', fontWeight: 600,
  color: '#374151', marginBottom: '4px',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px',
  border: '1px solid #d1d5db', borderRadius: '6px',
  fontSize: '0.85rem',
};
const fieldGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: '12px',
};
