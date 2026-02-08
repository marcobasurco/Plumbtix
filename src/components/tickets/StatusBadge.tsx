import type { TicketStatus } from '@shared/types/enums';
import { STATUS_LABELS } from '@shared/types/enums';

const STATUS_COLORS: Record<TicketStatus, { bg: string; color: string }> = {
  new:              { bg: '#dbeafe', color: '#1e40af' },
  needs_info:       { bg: '#fef3c7', color: '#92400e' },
  scheduled:        { bg: '#e0e7ff', color: '#3730a3' },
  dispatched:       { bg: '#fae8ff', color: '#86198f' },
  on_site:          { bg: '#ede9fe', color: '#5b21b6' },
  in_progress:      { bg: '#cffafe', color: '#155e75' },
  waiting_approval: { bg: '#ffedd5', color: '#9a3412' },
  completed:        { bg: '#d1fae5', color: '#065f46' },
  invoiced:         { bg: '#f0fdf4', color: '#166534' },
  cancelled:        { bg: '#f3f4f6', color: '#6b7280' },
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  const c = STATUS_COLORS[status] ?? { bg: '#f3f4f6', color: '#374151' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: 600,
        background: c.bg,
        color: c.color,
        whiteSpace: 'nowrap',
      }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
