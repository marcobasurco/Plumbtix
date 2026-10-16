import { useEffect, useId, useState } from 'react';
import { TICKET_STATUSES, TICKET_SEVERITIES, STATUS_LABELS, SEVERITY_LABELS } from '@shared/types/enums';
import type { TicketListFilters, BuildingOption } from '@/lib/tickets';
import { fetchBuildingOptions } from '@/lib/tickets';
import { Search, SlidersHorizontal, X } from 'lucide-react';

interface TicketFiltersProps {
  filters: TicketListFilters;
  onChange: (filters: TicketListFilters) => void;
}

type Chip = { key: string; label: string; active: boolean; patch: Partial<TicketListFilters> };

/**
 * Filters for the work-order list.
 *
 * On a phone the person usually wants one of three things — what's open, what's
 * an emergency, or a specific number — so those are one-tap chips above the
 * list. Everything else (status, building, dates) lives behind "More filters"
 * so the first work order is visible without scrolling.
 */
export function TicketFilters({ filters, onChange }: TicketFiltersProps) {
  const [buildings, setBuildings] = useState<BuildingOption[]>([]);
  const [showMore, setShowMore] = useState(false);
  const ids = {
    search: useId(), status: useId(), severity: useId(), building: useId(), from: useId(), to: useId(),
  };

  useEffect(() => { fetchBuildingOptions().then(setBuildings); }, []);

  const update = (patch: Partial<TicketListFilters>) =>
    onChange({ ...filters, ...patch });

  const status = filters.status ?? 'open';
  const severity = filters.severity ?? 'all';

  const chips: Chip[] = [
    { key: 'open', label: 'Open', active: status === 'open' && severity === 'all', patch: { status: 'open', severity: 'all' } },
    { key: 'emergency', label: 'Emergencies', active: severity === 'emergency', patch: { status: 'open', severity: 'emergency' } },
    { key: 'approval', label: 'Awaiting approval', active: status === 'waiting_approval', patch: { status: 'waiting_approval', severity: 'all' } },
    { key: 'all', label: 'All', active: status === 'all' && severity === 'all', patch: { status: 'all', severity: 'all' } },
  ];

  const advancedCount = [
    status !== 'open' && status !== 'all' && status !== 'waiting_approval' ? 1 : 0,
    filters.building_id ? 1 : 0,
    filters.date_from ? 1 : 0,
    filters.date_to ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const hasActiveFilters = !!(
    status !== 'open' || severity !== 'all' || filters.building_id || filters.search || filters.date_from || filters.date_to
  );

  const clearFilters = () => { onChange({}); setShowMore(false); };

  return (
    <div className="ticket-filters" role="search" aria-label="Filter work orders">
      {/* Row 1: search + more-filters toggle */}
      <div className="ticket-filters-row">
        <div className="ticket-filter-search-wrap">
          <Search className="ticket-filter-search-icon" aria-hidden="true" />
          <label htmlFor={ids.search} className="sr-only">Search work orders</label>
          <input id={ids.search} type="search" className="form-input ticket-filter-search"
            placeholder="Search by number, description or building…"
            value={filters.search ?? ''}
            onChange={(e) => update({ search: e.target.value })} />
        </div>
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          aria-controls="ticket-filters-more"
          className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          More filters{advancedCount > 0 ? ` (${advancedCount})` : ''}
        </button>
      </div>

      {/* Row 2: one-tap chips */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick filters">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => update(c.patch)}
            aria-pressed={c.active}
            className={
              'min-h-[44px] sm:min-h-[36px] px-3.5 rounded-full border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
              (c.active
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-foreground border-input hover:bg-accent')
            }
          >
            {c.label}
          </button>
        ))}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 min-h-[44px] sm:min-h-[36px] px-2 text-sm text-muted-foreground hover:text-foreground transition-colors ml-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear
          </button>
        )}
      </div>

      {/* Row 3: advanced (collapsed by default) */}
      {showMore && (
        <div id="ticket-filters-more" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-lg border border-border bg-muted/30 p-3">
          <div>
            <label htmlFor={ids.status} className="form-label">Status</label>
            <select id={ids.status} className="form-select"
              value={status}
              onChange={(e) => update({ status: e.target.value as TicketListFilters['status'] })}>
              <option value="open">Open</option>
              <option value="all">All statuses</option>
              {TICKET_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor={ids.severity} className="form-label">Severity</label>
            <select id={ids.severity} className="form-select"
              value={severity}
              onChange={(e) => update({ severity: e.target.value as TicketListFilters['severity'] })}>
              <option value="all">All severities</option>
              {TICKET_SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>)}
            </select>
          </div>

          {buildings.length > 1 && (
            <div>
              <label htmlFor={ids.building} className="form-label">Building</label>
              <select id={ids.building} className="form-select"
                value={filters.building_id ?? ''}
                onChange={(e) => update({ building_id: e.target.value || undefined })}>
                <option value="">All buildings</option>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.name || b.address_line1}, {b.city}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={ids.from} className="form-label">From</label>
              <input id={ids.from} type="date" className="form-input"
                value={filters.date_from ?? ''}
                onChange={(e) => update({ date_from: e.target.value || undefined })} />
            </div>
            <div>
              <label htmlFor={ids.to} className="form-label">To</label>
              <input id={ids.to} type="date" className="form-input"
                value={filters.date_to ?? ''}
                onChange={(e) => update({ date_to: e.target.value || undefined })} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
