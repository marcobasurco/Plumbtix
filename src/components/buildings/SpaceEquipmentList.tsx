import { useEffect, useState } from 'react';
import { fetchSpaceEquipment, type EquipmentSyncRow } from '@/lib/equipment';
import { Wrench, Loader2 } from 'lucide-react';

/** Common areas house assets, not residents — this replaces the occupant
 *  list for common-area spaces, showing each machine with tech-prep detail. */
export function SpaceEquipmentList({ spaceId, spaceLabel }: { spaceId: string; spaceLabel: string }) {
  const [rows, setRows] = useState<EquipmentSyncRow[] | null>(null);
  useEffect(() => { fetchSpaceEquipment(spaceId).then(setRows); }, [spaceId]);

  if (rows === null) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading equipment…
    </div>;
  }
  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground py-2">
      No equipment recorded in {spaceLabel} yet. Equipment is added via the Sync page (Equipment tab).
    </div>;
  }
  return (
    <div className="space-y-2.5">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Wrench className="h-3.5 w-3.5" /> Equipment in {spaceLabel}
      </div>
      {rows.map((e) => (
        <div key={e.id} className="rounded-lg border border-border bg-card px-3 py-2.5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold text-sm">{e.name}</span>
            <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{e.category}</span>
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">
            {[e.manufacturer, e.model, e.serial_number && `SN ${e.serial_number}`, e.spec]
              .filter(Boolean).join(' · ') || '—'}
          </div>
          {e.notes && <div className="text-xs italic text-muted-foreground mt-1">{e.notes}</div>}
        </div>
      ))}
    </div>
  );
}
