import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { updateTicket } from '@/lib/api';
import type { UpdateTicketRequest } from '@shared/types/api';
import { getAllowedTransitions, isTerminalStatus } from '@shared/types/transitions';
import { STATUS_LABELS } from '@shared/types/enums';
import type { TicketStatus } from '@shared/types/enums';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Loader2, Settings2 } from 'lucide-react';

interface ActionPanelProps {
  ticketId: string;
  currentStatus: TicketStatus;
  onUpdated: () => void;
}

export function ActionPanel({ ticketId, currentStatus, onUpdated }: ActionPanelProps) {
  const { role } = useAuth();
  const isAdmin = role === 'proroto_admin';
  const isPmAdmin = role === 'pm_admin';
  const canEditFields = isAdmin || isPmAdmin;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Editable fields
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

    const payload: Partial<UpdateTicketRequest> & { ticket_id: string; status: TicketStatus } = {
      ticket_id: ticketId,
      status: targetStatus,
    };

    // Attach scheduling fields if set (admin or pm_admin)
    if (canEditFields) {
      if (technician.trim()) payload.assigned_technician = technician.trim();
      if (scheduledDate) payload.scheduled_date = scheduledDate;
      if (timeWindow.trim()) payload.scheduled_time_window = timeWindow.trim();
    }
    // Financial fields: proroto_admin only
    if (isAdmin) {
      if (quoteAmount) payload.quote_amount = parseFloat(quoteAmount);
      if (invoiceNumber.trim()) payload.invoice_number = invoiceNumber.trim();
    }

    if (targetStatus === 'cancelled' && declineReason.trim()) {
      payload.decline_reason = declineReason.trim();
    }

    const result = await updateTicket(payload as UpdateTicketRequest);

    if (result.ok) {
      setSuccess(`Ticket updated to ${STATUS_LABELS[targetStatus]}`);
      setTechnician(''); setScheduledDate(''); setTimeWindow('');
      setQuoteAmount(''); setInvoiceNumber(''); setDeclineReason('');
      onUpdated();
    } else {
      setError(result.error.message);
    }
    setSubmitting(false);
  };

  const handleFieldUpdate = async () => {
    if (!canEditFields) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const payload: Partial<UpdateTicketRequest> & { ticket_id: string } = { ticket_id: ticketId };
    let hasChanges = false;

    if (technician.trim()) { payload.assigned_technician = technician.trim(); hasChanges = true; }
    if (scheduledDate) { payload.scheduled_date = scheduledDate; hasChanges = true; }
    if (timeWindow.trim()) { payload.scheduled_time_window = timeWindow.trim(); hasChanges = true; }
    // Financials: proroto_admin only
    if (isAdmin && quoteAmount) { payload.quote_amount = parseFloat(quoteAmount); hasChanges = true; }
    if (isAdmin && invoiceNumber.trim()) { payload.invoice_number = invoiceNumber.trim(); hasChanges = true; }

    if (!hasChanges) {
      setError('No fields to update');
      setSubmitting(false);
      return;
    }

    const result = await updateTicket(payload as UpdateTicketRequest);
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
    <div className="p-4 rounded-lg border border-border bg-card">
      <h3 className="text-base font-semibold mb-3 pb-2 border-b border-border flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-muted-foreground" />
        Actions
      </h3>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {success && (
        <div className="mb-3 text-sm px-3 py-2 rounded-md bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800">
          {success}
        </div>
      )}

      {terminal ? (
        <p className="text-sm text-muted-foreground">
          This ticket is {STATUS_LABELS[currentStatus].toLowerCase()} — no further transitions available.
        </p>
      ) : allowed.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No actions available for your role on this ticket.
        </p>
      ) : (
        <>
          {/* Transition buttons */}
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">
              Move ticket from <strong className="text-foreground">{STATUS_LABELS[currentStatus]}</strong> to:
            </p>
            <div className="flex flex-wrap gap-2">
              {allowed.map((target) => (
                <button
                  key={target}
                  onClick={() => handleTransition(target)}
                  disabled={submitting}
                  className={`px-4 py-2.5 text-sm font-semibold rounded-lg text-white min-h-[44px] transition-colors disabled:opacity-50 ${
                    target === 'cancelled'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {STATUS_LABELS[target]}
                </button>
              ))}
            </div>
          </div>

          {/* Decline reason */}
          {currentStatus === 'waiting_approval' && !isAdmin && allowed.includes('cancelled' as TicketStatus) && (
            <div className="mb-4">
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Decline reason (optional)</label>
              <input
                type="text"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Reason for declining the work"
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
              />
            </div>
          )}
        </>
      )}

      {/* Editable fields: scheduling (admin + pm_admin), financials (admin only) */}
      {canEditFields && !terminal && (
        <div className="border-t border-border pt-4 mt-2">
          <p className="text-xs font-semibold text-muted-foreground mb-2">
            {isAdmin ? 'Update Fields' : 'Scheduling'}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Assigned Technician</label>
              <input
                type="text"
                value={technician}
                onChange={(e) => setTechnician(e.target.value)}
                placeholder="e.g. Bryan"
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Scheduled Date</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Time Window</label>
              <input
                type="text"
                value={timeWindow}
                onChange={(e) => setTimeWindow(e.target.value)}
                placeholder="e.g. 9am-12pm"
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
              />
            </div>

            {/* Financial fields: Pro Roto admin only */}
            {isAdmin && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Quote Amount ($)</label>
                  <input
                    type="number"
                    value={quoteAmount}
                    onChange={(e) => setQuoteAmount(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Invoice Number</label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="INV-001"
                    className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
                  />
                </div>
              </>
            )}
          </div>

          <Button
            size="sm"
            onClick={handleFieldUpdate}
            disabled={submitting}
            className="mt-3"
          >
            {submitting ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
            ) : 'Save Fields'}
          </Button>
        </div>
      )}
    </div>
  );
}
