import type { TicketSeverity } from '@shared/types/enums';
import { SEVERITY_LABELS } from '@shared/types/enums';
import { cn } from '@/lib/utils';
import { Zap } from 'lucide-react';

const SEVERITY_STYLE: Record<TicketSeverity, string> = {
  emergency: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  urgent:    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  standard:  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export function SeverityBadge({ severity }: { severity: TicketSeverity }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
      SEVERITY_STYLE[severity] ?? 'bg-gray-100 text-gray-600',
    )}>
      {severity === 'emergency' && <Zap className="h-3 w-3" />}
      {SEVERITY_LABELS[severity] ?? severity}
    </span>
  );
}
