import type { TicketSeverity } from '@shared/types/enums';
import { SEVERITY_LABELS } from '@shared/types/enums';

const SEVERITY_BADGE: Record<TicketSeverity, string> = {
  emergency: 'badge-red',
  urgent:    'badge-amber',
  standard:  'badge-slate',
};

export function SeverityBadge({ severity }: { severity: TicketSeverity }) {
  return (
    <span className={`badge ${SEVERITY_BADGE[severity] ?? 'badge-slate'}`}>
      {SEVERITY_LABELS[severity] ?? severity}
    </span>
  );
}
