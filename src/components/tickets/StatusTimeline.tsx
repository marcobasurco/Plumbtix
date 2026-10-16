import { useEffect, useState } from 'react';
import { fetchStatusLog, type StatusLogRow } from '@/lib/tickets';
import { StatusBadge } from './StatusBadge';
import type { TicketStatus } from '@shared/types/enums';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

interface StatusTimelineProps {
  ticketId: string;
  /** Bumped after a status change so we refetch */
  refreshKey: number;
}

/**
 * Status history for a work order. Uses design-system tokens only so it reads
 * correctly in dark mode (the previous version hard-coded light-theme hex
 * values and was unreadable at night).
 */
export function StatusTimeline({ ticketId, refreshKey }: StatusTimelineProps) {
  const [entries, setEntries] = useState<StatusLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchStatusLog(ticketId)
      .then((rows) => { if (!cancelled) setEntries(rows); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticketId, refreshKey, reloadKey]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading status history…</p>;
  if (error) {
    return (
      <p className="text-sm text-destructive">
        Couldn't load the status history.{' '}
        <button type="button" className="underline underline-offset-2" onClick={() => setReloadKey((k) => k + 1)}>
          Try again
        </button>
      </p>
    );
  }
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No status changes recorded yet.</p>;

  return (
    <div>
      <h3 className="text-base font-semibold mb-3 pb-2 border-b border-border">Status history</h3>
      <ol className="relative pl-5 list-none m-0">
        {/* Vertical line */}
        <div aria-hidden="true" className="absolute left-[7px] top-1 bottom-1 w-0.5 bg-border" />

        {entries.map((entry) => (
          <li key={entry.id} className="relative mb-4 last:mb-0">
            {/* Dot */}
            <span
              aria-hidden="true"
              className={`absolute -left-4 top-1 h-2.5 w-2.5 rounded-full border-2 border-card ${
                entry.new_status === 'cancelled' ? 'bg-muted-foreground' : 'bg-primary'
              }`}
            />

            <div className="text-sm">
              <div className="flex items-center gap-1.5 flex-wrap">
                {entry.old_status && (
                  <>
                    <StatusBadge status={entry.old_status as TicketStatus} />
                    <span className="text-muted-foreground" aria-label="changed to">→</span>
                  </>
                )}
                <StatusBadge status={entry.new_status as TicketStatus} />
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {entry.changed_by?.full_name ?? 'System'} · {formatDateTime(entry.created_at)}
              </div>
              {entry.notes && (
                <div className="text-sm text-foreground/80 mt-1 italic">
                  {entry.notes}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
