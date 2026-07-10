import { useEffect, useState } from 'react';
import { createEquipment, updateEquipment, type EquipmentSyncRow } from '@/lib/equipment';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface Props {
  spaceId: string;
  spaceLabel: string;
  existing: EquipmentSyncRow | null;   // null = create
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const empty = { name: '', category: '', manufacturer: '', model: '', serial_number: '', spec: '', notes: '' };

export function EquipmentForm({ spaceId, spaceLabel, existing, open, onClose, onSaved }: Props) {
  const [f, setF] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setF(existing ? {
      name: existing.name ?? '', category: existing.category ?? '',
      manufacturer: existing.manufacturer ?? '', model: existing.model ?? '',
      serial_number: existing.serial_number ?? '', spec: existing.spec ?? '',
      notes: existing.notes ?? '',
    } : empty);
  }, [existing, open]);

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.name.trim() || !f.category.trim()) { toast.error('Name and category are required'); return; }
    setSaving(true);
    try {
      if (existing) await updateEquipment(existing.id, f);
      else await createEquipment({ space_id: spaceId, ...f });
      toast.success(existing ? 'Equipment updated' : 'Equipment added');
      onSaved(); onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit equipment' : `Add equipment — ${spaceLabel}`}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Name *</Label>
            <Input value={f.name} onChange={set('name')} placeholder="e.g. Backup Circulation Pump" />
          </div>
          <div className="space-y-1.5">
            <Label>Category *</Label>
            <Input value={f.category} onChange={set('category')} placeholder="boiler, pump, water heater…" />
          </div>
          <div className="space-y-1.5">
            <Label>Manufacturer</Label>
            <Input value={f.manufacturer} onChange={set('manufacturer')} placeholder="Grundfos" />
          </div>
          <div className="space-y-1.5">
            <Label>Model</Label>
            <Input value={f.model} onChange={set('model')} placeholder="UPS26-99" />
          </div>
          <div className="space-y-1.5">
            <Label>Serial number</Label>
            <Input value={f.serial_number} onChange={set('serial_number')} placeholder="SN-123456" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Spec</Label>
            <Input value={f.spec} onChange={set('spec')} placeholder="1/6 HP · 3-speed" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes (parts intel for techs)</Label>
            <textarea value={f.notes} onChange={set('notes')} rows={3}
              placeholder="Isolation valves both sides. Spare impeller kit fits all speeds."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : existing ? 'Save changes' : 'Add equipment'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
