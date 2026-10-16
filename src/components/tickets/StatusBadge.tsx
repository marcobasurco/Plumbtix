import type { TicketStatus } from '@shared/types/enums';
import { STATUS_LABELS } from '@shared/types/enums';
import { cn } from '@/lib/utils';

/**
 * Status badges use five quiet tones instead of ten hues: the colour says
 * what KIND of state this is (waiting on someone, in motion, done) and the
 * text says which one. Tones are defined once in index.css for both themes.
 */
const STATUS_TONE: Record<TicketStatus, string> = {
  new:              'tone-info',
  needs_info:       'tone-warn',
  scheduled:        'tone-active',
  dispatched:       'tone-active',
  on_site:          'tone-active',
  in_progress:      'tone-active',
  waiting_approval: 'tone-warn',
  completed:        'tone-ok',
  invoiced:         'tone-ok',
  cancelled:        'tone-neutral',
};

export function StatusBadge({ status, showDot = true }: { status: TicketStatus; showDot?: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
      STATUS_TONE[status] ?? 'tone-neutral',
    )}>
      {showDot && <span className="tone-dot h-1.5 w-1.5 rounded-full" aria-hidden="true" />}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
