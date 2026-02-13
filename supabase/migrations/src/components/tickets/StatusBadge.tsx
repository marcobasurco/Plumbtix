import type { TicketStatus } from '@shared/types/enums';
import { STATUS_LABELS } from '@shared/types/enums';
import { cn } from '@/lib/utils';

const STATUS_STYLE: Record<TicketStatus, string> = {
  new:              'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  needs_info:       'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  scheduled:        'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  dispatched:       'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  on_site:          'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  in_progress:      'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  waiting_approval: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  completed:        'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  invoiced:         'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  cancelled:        'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const DOT_COLOR: Record<TicketStatus, string> = {
  new: 'bg-blue-500', needs_info: 'bg-amber-500', scheduled: 'bg-indigo-500',
  dispatched: 'bg-purple-500', on_site: 'bg-violet-500', in_progress: 'bg-cyan-500',
  waiting_approval: 'bg-orange-500', completed: 'bg-green-500', invoiced: 'bg-emerald-500',
  cancelled: 'bg-gray-400',
};

export function StatusBadge({ status, showDot = true }: { status: TicketStatus; showDot?: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
      STATUS_STYLE[status] ?? 'bg-gray-100 text-gray-600',
    )}>
      {showDot && <span className={cn('h-1.5 w-1.5 rounded-full', DOT_COLOR[status] ?? 'bg-gray-400')} />}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
