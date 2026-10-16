import type { TicketSeverity } from '@shared/types/enums';
import { SEVERITY_LABELS } from '@shared/types/enums';
import { cn } from '@/lib/utils';
import { Zap } from 'lucide-react';

/** Red is reserved for emergencies; everything else stays quiet. */
const SEVERITY_TONE: Record<TicketSeverity, string> = {
  emergency: 'tone-danger',
  urgent:    'tone-warn',
  standard:  'tone-neutral',
};

export function SeverityBadge({ severity }: { severity: TicketSeverity }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
      SEVERITY_TONE[severity] ?? 'tone-neutral',
    )}>
      {severity === 'emergency' && <Zap className="h-3 w-3" aria-hidden="true" />}
      {SEVERITY_LABELS[severity] ?? severity}
    </span>
  );
}
