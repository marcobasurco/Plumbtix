import type { TicketStatus } from '@shared/types/enums';
import { STATUS_LABELS } from '@shared/types/enums';

const STATUS_BADGE: Record<TicketStatus, string> = {
  new:              'badge-blue badge-dot',
  needs_info:       'badge-amber badge-dot',
  scheduled:        'badge-indigo badge-dot',
  dispatched:       'badge-purple badge-dot',
  on_site:          'badge-purple badge-dot',
  in_progress:      'badge-cyan badge-dot',
  waiting_approval: 'badge-orange badge-dot',
  completed:        'badge-green badge-dot',
  invoiced:         'badge-green',
  cancelled:        'badge-slate',
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`badge ${STATUS_BADGE[status] ?? 'badge-slate'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
