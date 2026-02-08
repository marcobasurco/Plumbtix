import { useEffect, useState } from 'react';
import { TICKET_STATUSES, TICKET_SEVERITIES, STATUS_LABELS, SEVERITY_LABELS } from '@shared/types/enums';
import type { TicketListFilters, BuildingOption } from '@/lib/tickets';
import { fetchBuildingOptions } from '@/lib/tickets';

interface TicketFiltersProps {
  filters: TicketListFilters;
  onChange: (filters: TicketListFilters) => void;
}

export function TicketFilters({ filters, onChange }: TicketFiltersProps) {
  const [buildings, setBuildings] = useState<BuildingOption[]>([]);

  useEffect(() => {
    fetchBuildingOptions().then(setBuildings);
  }, []);

  const update = (patch: Partial<TicketListFilters>) =>
    onChange({ ...filters, ...patch });

  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
      <select
        value={filters.status ?? 'all'}
        onChange={(e) => update({ status: e.target.value as TicketListFilters['status'] })}
        style={selectStyle}
      >
        <option value="all">All Statuses</option>
        {TICKET_STATUSES.map((s) => (
          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
        ))}
      </select>

      <select
        value={filters.severity ?? 'all'}
        onChange={(e) => update({ severity: e.target.value as TicketListFilters['severity'] })}
        style={selectStyle}
      >
        <option value="all">All Severities</option>
        {TICKET_SEVERITIES.map((s) => (
          <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
        ))}
      </select>

      {buildings.length > 1 && (
        <select
          value={filters.building_id ?? ''}
          onChange={(e) => update({ building_id: e.target.value || undefined })}
          style={selectStyle}
        >
          <option value="">All Buildings</option>
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name || b.address_line1}, {b.city}
            </option>
          ))}
        </select>
      )}

      <input
        type="text"
        placeholder="Search # or description…"
        value={filters.search ?? ''}
        onChange={(e) => update({ search: e.target.value })}
        style={{ ...selectStyle, minWidth: '180px' }}
      />
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '0.85rem',
  background: '#fff',
};
