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

export function StatusTimeline({ ticketId, refreshKey }: StatusTimelineProps) {
  const [entries, setEntries] = useState<StatusLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchStatusLog(ticketId)
      .then((rows) => { if (!cancelled) setEntries(rows); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticketId, refreshKey]);

  if (loading) return <p style={mutedStyle}>Loading status history…</p>;
  if (error) return <p style={{ color: '#991b1b', fontSize: '0.85rem' }}>Error: {error}</p>;
  if (entries.length === 0) return <p style={mutedStyle}>No status changes recorded.</p>;

  return (
    <div>
      <h3 style={sectionTitle}>Status History</h3>
      <div style={{ position: 'relative', paddingLeft: '20px' }}>
        {/* Vertical line */}
        <div style={{
          position: 'absolute', left: '7px', top: '4px', bottom: '4px',
          width: '2px', background: '#e5e7eb',
        }} />

        {entries.map((entry) => (
          <div key={entry.id} style={{ position: 'relative', marginBottom: '16px' }}>
            {/* Dot */}
            <div style={{
              position: 'absolute', left: '-16px', top: '4px',
              width: '10px', height: '10px', borderRadius: '50%',
              background: entry.new_status === 'cancelled' ? '#9ca3af' : '#2563eb',
              border: '2px solid #fff',
            }} />

            <div style={{ fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {entry.old_status && (
                  <>
                    <StatusBadge status={entry.old_status as TicketStatus} />
                    <span style={{ color: '#9ca3af' }}>→</span>
                  </>
                )}
                <StatusBadge status={entry.new_status as TicketStatus} />
              </div>
              <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '2px' }}>
                {entry.changed_by?.full_name ?? 'System'} · {formatDateTime(entry.created_at)}
              </div>
              {entry.notes && (
                <div style={{ color: '#374151', fontSize: '0.85rem', marginTop: '4px', fontStyle: 'italic' }}>
                  {entry.notes}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  fontSize: '1rem', fontWeight: 600, marginBottom: '12px',
  paddingBottom: '8px', borderBottom: '1px solid #e5e7eb',
};
const mutedStyle: React.CSSProperties = { color: '#9ca3af', fontSize: '0.85rem' };
