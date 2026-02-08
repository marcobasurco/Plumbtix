import type { TicketSeverity } from '@shared/types/enums';
import { SEVERITY_LABELS } from '@shared/types/enums';

const SEVERITY_COLORS: Record<TicketSeverity, { bg: string; color: string }> = {
  emergency: { bg: '#fee2e2', color: '#991b1b' },
  urgent:    { bg: '#fef3c7', color: '#92400e' },
  standard:  { bg: '#f3f4f6', color: '#374151' },
};

export function SeverityBadge({ severity }: { severity: TicketSeverity }) {
  const c = SEVERITY_COLORS[severity] ?? { bg: '#f3f4f6', color: '#374151' };
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
      {SEVERITY_LABELS[severity] ?? severity}
    </span>
  );
}
