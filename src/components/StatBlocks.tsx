// =============================================================================
// Pro Roto App — Stat blocks (shared by Overview and Analytics)
// =============================================================================
// Building blocks for pages that show numbers to people who are not analysts:
//   • SummaryTile — label on top, big number, one sentence saying what it counts
//   • Section     — a card whose title says what you are looking at + a hint
//   • CountRows   — "Label ...... 4 (40%)" with a bar underneath
//   • MonthlyBars — work orders reported per month, count printed on each bar
// Tokens only (no raw hex), readable in dark mode, phone-first.
// =============================================================================

import type { ReactNode } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { ChevronRight } from 'lucide-react';
import type { TicketSeverity } from '@shared/types/enums';

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

// Severity presentation — always the word plus a color, never color alone.
export const SEVERITY_ORDER: TicketSeverity[] = ['emergency', 'urgent', 'standard'];
export const SEVERITY_BAR: Record<TicketSeverity, string> = {
  emergency: 'bg-[hsl(var(--tone-danger-dot))]',
  urgent: 'bg-[hsl(var(--tone-warn-dot))]',
  standard: 'bg-[hsl(var(--tone-info-dot))]',
};

// ---------------------------------------------------------------------------
// Summary tile
// ---------------------------------------------------------------------------

interface SummaryTileProps {
  label: string;
  value: number;
  /** One short sentence saying what the number counts. */
  note: string;
  icon: ReactNode;
  /** Makes the tile a button (e.g. open the matching list). */
  onClick?: () => void;
  /** Emergency emphasis — red is reserved for emergencies. */
  alert?: boolean;
}

export function SummaryTile({ label, value, note, icon, onClick, alert }: SummaryTileProps) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className={`shrink-0 ${alert ? 'text-[hsl(var(--tone-danger-dot))]' : 'text-primary'}`} aria-hidden="true">{icon}</span>
        <span className="min-w-0 flex-1">{label}</span>
        {onClick && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      </div>
      <div className={`mt-2 text-3xl font-bold tracking-tight tabular-nums ${alert ? 'text-[hsl(var(--tone-danger-fg))]' : 'text-foreground'}`}>
        {value}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </>
  );
  if (!onClick) return <div className="card p-4">{body}</div>;
  return (
    <button type="button" onClick={onClick}
      className="card card-button p-4 transition-colors hover:border-primary/40">
      {body}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Section card
// ---------------------------------------------------------------------------

export function Section({ title, hint, children, className }: {
  title: string; hint: string; children: ReactNode; className?: string;
}) {
  return (
    <section className={`card p-4 ${className ?? ''}`}>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground mt-0.5 mb-4">{hint}</p>
      {children}
    </section>
  );
}

export function NothingYet() {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">
      No work orders reported yet.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Count rows
// ---------------------------------------------------------------------------

export interface CountRow {
  key: string;
  label: string;
  count: number;
  /** Tailwind background class for the bar; defaults to the primary color. */
  barClass?: string;
  /** Makes the row a button (e.g. open the list filtered to this row). */
  onClick?: () => void;
}

export function CountRows({ rows, total }: { rows: CountRow[]; total: number }) {
  if (rows.length === 0 || total === 0) return <NothingYet />;
  return (
    <ul className="space-y-3">
      {rows.map(({ key, label, count, barClass, onClick }) => {
        const pct = Math.round((count / total) * 100);
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 text-foreground">{label}</span>
              <span className="shrink-0 tabular-nums">
                <span className="font-semibold text-foreground">{count}</span>
                <span className="text-muted-foreground"> ({pct}%)</span>
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden" aria-hidden="true">
              <div className={`h-full rounded-full ${barClass ?? 'bg-primary'}`}
                style={{ width: `${count === 0 ? 0 : Math.max(pct, 2)}%` }} />
            </div>
          </>
        );
        return (
          <li key={key}>
            {onClick ? (
              <button type="button" onClick={onClick}
                className="card-button rounded-md py-1.5 -my-1.5 hover:bg-muted/50 transition-colors">
                {inner}
              </button>
            ) : inner}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Monthly bars
// ---------------------------------------------------------------------------

/** "Oct 26" (month + 2-digit year from the data layer) → "Oct 2026". */
function fullMonth(label: string): string {
  const [mon, yy] = label.split(' ');
  return yy ? `${mon} 20${yy}` : label;
}

function MonthTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ value: number }>; label?: string;
}) {
  if (!active || !payload?.length) return null;
  const n = payload[0].value;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-xs">
      <div className="font-semibold text-foreground">{fullMonth(label ?? '')}</div>
      <div className="text-muted-foreground">{n} {plural(n, 'work order', 'work orders')} reported</div>
    </div>
  );
}

export function MonthlyBars({ data }: { data: { month: string; count: number }[] }) {
  if (data.length === 0 || data.every(d => d.count === 0)) return <NothingYet />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="month" tickFormatter={(m: string) => m.split(' ')[0]}
          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false}
          allowDecimals={false} width={28} />
        <Tooltip content={<MonthTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={56}>
          <LabelList dataKey="count" position="top"
            style={{ fontSize: 12, fontWeight: 600, fill: 'hsl(var(--foreground))' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
