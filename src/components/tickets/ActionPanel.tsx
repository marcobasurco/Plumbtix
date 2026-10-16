import { useState, useEffect, useId } from 'react';
import { useAuth } from '@/lib/auth';
import { updateTicket } from '@/lib/api';
import { fetchTechnicians } from '@/lib/technicians';
import type { Technician } from '@shared/types/database';
import type { UpdateTicketRequest } from '@shared/types/api';
import { getAllowedTransitions, isTerminalStatus } from '@shared/types/transitions';
import { STATUS_LABELS } from '@shared/types/enums';
import type { TicketStatus, UserRole } from '@shared/types/enums';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Loader2, Settings2 } from 'lucide-react';

interface ActionPanelProps {
  ticketId: string;
  currentStatus: TicketStatus;
  /** Currently assigned technician (roster FK) — dropdown pre-selects this */
  currentTechnicianId: string | null;
  /** Quote on the work order, if any — shown on the approve button */
  quoteAmount?: number | null;
  onUpdated: () => void;
}

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/**
 * What the button *does*, not where the row ends up. A property manager on a
 * phone should read "Approve quote ($450)" — not "Scheduled" — and a tech
 * should read "I'm on site", not "On Site". Falls back to the status label for
 * any pair not listed here, so a new transition can't render an empty button.
 */
function actionLabel(from: TicketStatus, to: TicketStatus, role: UserRole, quote: number | null | undefined): string {
  const isPm = role === 'pm_admin' || role === 'pm_user';
  if (to === 'cancelled') return 'Cancel work order';
  if (to === 'needs_info') return isPm ? 'Need more info from reporter' : 'Ask for more info';
  if (from === 'needs_info' && to === 'new') return isPm ? "I've added the info" : 'Info received';
  if (to === 'scheduled') {
    if (from === 'waiting_approval') return quote != null ? `Approve quote (${currency.format(quote)})` : 'Approve';
    if (from === 'dispatched') return 'Back to scheduled';
    return 'Schedule';
  }
  if (to === 'dispatched') return 'Dispatch technician';
  if (to === 'on_site') return 'Technician on site';
  if (to === 'in_progress') return from === 'waiting_approval' ? 'Resume work' : 'Start work';
  if (to === 'waiting_approval') return 'Request approval';
  if (to === 'completed') return 'Mark completed';
  if (to === 'invoiced') return 'Mark invoiced';
  return STATUS_LABELS[to];
}

export function ActionPanel({ ticketId, currentStatus, currentTechnicianId, quoteAmount: quote, onUpdated }: ActionPanelProps) {
  const { role } = useAuth();
  const isAdmin = role === 'proroto_admin';
  const isPmAdmin = role === 'pm_admin';
  const canEditFields = isAdmin || isPmAdmin;
  const ids = {
    tech: useId(), date: useId(), window: useId(), quote: useId(), invoice: useId(),
  };

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Editable fields
  // technicianId mirrors the CURRENT assignment ('' = unassigned); a change
  // is sent only when it differs from currentTechnicianId on save.
  const [technicianId, setTechnicianId] = useState(currentTechnicianId ?? '');
  const [technicians, setTechnicians] = useState<Technician[]>([]);

  // Keep the dropdown in sync when the ticket refreshes after a save
  useEffect(() => {
    setTechnicianId(currentTechnicianId ?? '');
  }, [currentTechnicianId]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [timeWindow, setTimeWindow] = useState('');
  const [quoteAmount, setQuoteAmount] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [declineReason, setDeclineReason] = useState('');

  // Load the roster for the assignment dropdown (admin + pm_admin)
  useEffect(() => {
    if (!canEditFields) return;
    fetchTechnicians(true)
      .then(setTechnicians)
      .catch((e) => console.error('[ActionPanel] Failed to load technicians:', e));
  }, [canEditFields]);

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
      if (technicianId !== (currentTechnicianId ?? '')) payload.technician_id = technicianId || null;
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
      setSuccess(`Work order is now ${STATUS_LABELS[targetStatus].toLowerCase()}.`);
      setScheduledDate(''); setTimeWindow('');
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

    if (technicianId !== (currentTechnicianId ?? '')) { payload.technician_id = technicianId || null; hasChanges = true; }
    if (scheduledDate) { payload.scheduled_date = scheduledDate; hasChanges = true; }
    if (timeWindow.trim()) { payload.scheduled_time_window = timeWindow.trim(); hasChanges = true; }
    // Financials: proroto_admin only
    if (isAdmin && quoteAmount) { payload.quote_amount = parseFloat(quoteAmount); hasChanges = true; }
    if (isAdmin && invoiceNumber.trim()) { payload.invoice_number = invoiceNumber.trim(); hasChanges = true; }

    if (!hasChanges) {
      setError('Nothing to save yet — change a field first.');
      setSubmitting(false);
      return;
    }

    const result = await updateTicket(payload as UpdateTicketRequest);
    if (result.ok) {
      setSuccess('Changes saved.');
      setScheduledDate(''); setTimeWindow('');
      setQuoteAmount(''); setInvoiceNumber('');
      onUpdated();
    } else {
      setError(result.error.message);
    }
    setSubmitting(false);
  };

  const fieldClass = 'w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]';
  const labelClass = 'block text-xs font-semibold text-muted-foreground mb-1';

  return (
    <section className="p-4 rounded-lg border border-border bg-card" aria-labelledby="action-panel-heading">
      <h3 id="action-panel-heading" className="text-base font-semibold mb-3 pb-2 border-b border-border flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        Actions
      </h3>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {success && (
        <div role="status" className="mb-3 text-sm px-3 py-2 rounded-md bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800">
          {success}
        </div>
      )}

      {terminal ? (
        <p className="text-sm text-muted-foreground">
          This work order is {STATUS_LABELS[currentStatus].toLowerCase()} and can't be changed.
        </p>
      ) : allowed.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing for you to do right now — it's {STATUS_LABELS[currentStatus].toLowerCase()}. You'll be notified when that changes.
        </p>
      ) : (
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-2">
            Currently <strong className="text-foreground">{STATUS_LABELS[currentStatus]}</strong>
          </p>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            {allowed.map((target) => {
              const destructive = target === 'cancelled';
              return (
                <button
                  key={target}
                  type="button"
                  onClick={() => destructive ? setConfirmCancel(true) : handleTransition(target)}
                  disabled={submitting}
                  className={`px-4 py-2.5 text-sm font-semibold rounded-lg min-h-[44px] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    destructive
                      ? 'border border-destructive/40 text-destructive bg-background hover:bg-destructive/10'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  }`}
                >
                  {actionLabel(currentStatus, target, role, quote)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Editable fields: scheduling (admin + pm_admin), financials (admin only) */}
      {canEditFields && !terminal && (
        <div className="border-t border-border pt-4 mt-2">
          <p className="text-xs font-semibold text-muted-foreground mb-2">
            {isAdmin ? 'Scheduling & billing' : 'Scheduling'}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor={ids.tech} className={labelClass}>Assigned technician</label>
              <select id={ids.tech} value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} className={fieldClass}>
                <option value="">— Unassigned —</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={ids.date} className={labelClass}>Scheduled date</label>
              <input id={ids.date} type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className={fieldClass} />
            </div>
            <div>
              <label htmlFor={ids.window} className={labelClass}>Time window</label>
              <input id={ids.window} type="text" value={timeWindow} onChange={(e) => setTimeWindow(e.target.value)} placeholder="e.g. 9am–12pm" className={fieldClass} />
            </div>

            {/* Financial fields: Pro Roto admin only */}
            {isAdmin && (
              <>
                <div>
                  <label htmlFor={ids.quote} className={labelClass}>Quote amount ($)</label>
                  <input id={ids.quote} type="number" inputMode="decimal" value={quoteAmount} onChange={(e) => setQuoteAmount(e.target.value)} placeholder="0.00" min="0" step="0.01" className={fieldClass} />
                </div>
                <div>
                  <label htmlFor={ids.invoice} className={labelClass}>Invoice number</label>
                  <input id={ids.invoice} type="text" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-001" className={fieldClass} />
                </div>
              </>
            )}
          </div>

          <Button size="sm" onClick={handleFieldUpdate} disabled={submitting} className="mt-3 min-h-[44px] sm:min-h-0">
            {submitting ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Saving…</>
            ) : 'Save changes'}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this work order?"
        description="The reporter will be notified and no technician will be dispatched. This can't be undone."
        confirmLabel="Cancel work order"
        cancelLabel="Keep it open"
        variant="destructive"
        onConfirm={() => { setConfirmCancel(false); handleTransition('cancelled'); }}
      />
    </section>
  );
}
