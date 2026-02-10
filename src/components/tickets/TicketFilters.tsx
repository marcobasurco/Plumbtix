import { useEffect, useState } from 'react';
import { TICKET_STATUSES, TICKET_SEVERITIES, STATUS_LABELS, SEVERITY_LABELS } from '@shared/types/enums';
import type { TicketListFilters, BuildingOption } from '@/lib/tickets';
import { fetchBuildingOptions } from '@/lib/tickets';
import { Search } from 'lucide-react';

interface TicketFiltersProps {
  filters: TicketListFilters;
  onChange: (filters: TicketListFilters) => void;
}

export function TicketFilters({ filters, onChange }: TicketFiltersProps) {
  const [buildings, setBuildings] = useState<BuildingOption[]>([]);

  useEffect(() => { fetchBuildingOptions().then(setBuildings); }, []);

  const update = (patch: Partial<TicketListFilters>) =>
    onChange({ ...filters, ...patch });

  return (
    <div className="ticket-filters">
      <div className="ticket-filters-row">
        <select className="form-select ticket-filter-select"
          value={filters.status ?? 'all'}
          onChange={(e) => update({ status: e.target.value as TicketListFilters['status'] })}>
          <option value="all">All Statuses</option>
          <option value="open">Open (Active)</option>
          {TICKET_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>

        <select className="form-select ticket-filter-select"
          value={filters.severity ?? 'all'}
          onChange={(e) => update({ severity: e.target.value as TicketListFilters['severity'] })}>
          <option value="all">All Severities</option>
          {TICKET_SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>)}
        </select>
      </div>

      <div className="ticket-filters-row">
        {buildings.length > 1 && (
          <select className="form-select ticket-filter-select"
            value={filters.building_id ?? ''}
            onChange={(e) => update({ building_id: e.target.value || undefined })}>
            <option value="">All Buildings</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name || b.address_line1}, {b.city}</option>)}
          </select>
        )}

        <div className="ticket-filter-search-wrap">
          <Search className="ticket-filter-search-icon" />
          <input type="text" className="form-input ticket-filter-search"
            placeholder="Search # or description…"
            value={filters.search ?? ''}
            onChange={(e) => update({ search: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
