// =============================================================================
// Work Orders — Ticket Audit Trail (migration 00024)
// =============================================================================
// Read-only, proroto_admin-only change history for a work order. Rendered
// from the trigger-written ticket_audit_log, so it reflects EVERY write path
// (UI, edge functions, direct SQL) — nothing can change a ticket without
// appearing here.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { fetchTicketAudit, type TicketAuditRow } from '@/lib/audit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { History, ShieldCheck, ArrowRight, Plus } from 'lucide-react';

// Human labels for audited fields
const FIELD_LABELS: Record<string, string> = {
  __created__: 'Ticket created',
  status: 'Status',
  severity: 'Severity',
  issue_type: 'Issue type',
  description: 'Description',
  access_instructions: 'Access instructions',
  assigned_technician: 'Assigned technician',
  scheduled_date: 'Scheduled date',
  scheduled_time_window: 'Time window',
  quote_amount: 'Quote amount',
  invoice_number: 'Invoice number',
  decline_reason: 'Decline reason',
  public_enabled: 'Public sharing',
  public_token: 'Public link',
};

function formatValue(field: string, value: string | null): string {
  if (value === null || value === '') return '—';
  if (field === 'quote_amount') {
    const n = parseFloat(value);
    return Number.isNaN(n) ? value : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  }
  if (field === 'public_enabled') return value === 'true' ? 'Enabled' : 'Disabled';
  if (field === 'status' || field === 'severity' || field === 'issue_type') {
    return value.replace(/_/g, ' ');
  }
  // Keep long free-text values readable in a compact row
  return value.length > 120 ? value.slice(0, 117) + '…' : value;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export function AuditTrail({ ticketId }: { ticketId: string }) {
  const [rows, setRows] = useState<TicketAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchTicketAudit(ticketId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          Change History
          <span className="ml-auto flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Database-recorded · Pro Roto admin only
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recorded changes yet. History capture began with migration 00024 —
            changes made before it was applied are not shown.
          </p>
        ) : (
          <ul className="space-y-1">
            {rows.map((r) => (
              <li key={r.id}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm py-1.5 border-b border-border/50 last:border-0">
                <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                  {formatWhen(r.changed_at)}
                </span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs font-medium">
                  {r.changed_by_name ?? 'System'}
                </span>
                {r.field === '__created__' ? (
                  <span className="flex items-center gap-1.5 font-medium">
                    <Plus className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    Created {r.new_value}
                  </span>
                ) : (
                  <span className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span className="font-medium">{FIELD_LABELS[r.field] ?? r.field}:</span>
                    <span className="text-muted-foreground break-all">{formatValue(r.field, r.old_value)}</span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="break-all">{formatValue(r.field, r.new_value)}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
