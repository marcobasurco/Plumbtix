import { useCallback, useEffect, useState } from 'react';
import { fetchSpaceEquipment, deleteEquipment, type EquipmentSyncRow } from '@/lib/equipment';
import { EquipmentForm } from './EquipmentForm';
import { Button } from '@/components/ui/button';
import { Wrench, Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export function SpaceEquipmentList({ spaceId, spaceLabel, canWrite = false }:
  { spaceId: string; spaceLabel: string; canWrite?: boolean }) {
  const [rows, setRows] = useState<EquipmentSyncRow[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EquipmentSyncRow | null>(null);

  const load = useCallback(() => { fetchSpaceEquipment(spaceId).then(setRows); }, [spaceId]);
  useEffect(() => { load(); }, [load]);

  const remove = async (e: EquipmentSyncRow) => {
    if (!window.confirm(`Delete "${e.name}"? This cannot be undone.`)) return;
    try { await deleteEquipment(e.id); toast.success('Equipment deleted'); load(); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Delete failed'); }
  };

  if (rows === null) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading equipment…
    </div>);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5" /> Equipment in {spaceLabel}
        </div>
        {canWrite && (
          <Button size="sm" variant="outline" className="gap-1.5"
            onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> Add Equipment
          </Button>
        )}
      </div>

      {rows.length === 0 && (
        <div className="text-sm text-muted-foreground py-1">
          No equipment recorded in {spaceLabel} yet.
        </div>
      )}

      {rows.map((e) => (
        <div key={e.id} className="rounded-lg border border-border bg-card px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-semibold text-sm">{e.name}</span>
                <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{e.category}</span>
              </div>
              <div className="text-sm text-muted-foreground mt-0.5">
                {[e.manufacturer, e.model, e.serial_number && `SN ${e.serial_number}`, e.spec].filter(Boolean).join(' · ') || '—'}
              </div>
              {e.notes && <div className="text-xs italic text-muted-foreground mt-1">{e.notes}</div>}
            </div>
            {canWrite && (
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" onClick={() => { setEditing(e); setFormOpen(true); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => remove(e)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      ))}

      <EquipmentForm spaceId={spaceId} spaceLabel={spaceLabel} existing={editing}
        open={formOpen} onClose={() => setFormOpen(false)} onSaved={load} />
    </div>
  );
}
