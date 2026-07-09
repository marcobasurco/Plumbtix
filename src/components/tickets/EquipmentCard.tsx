import { useEffect, useState } from 'react';
import { fetchBuildingEquipment, type EquipmentRow } from '@/lib/equipment';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wrench } from 'lucide-react';

export function EquipmentCard({ buildingId }: { buildingId: string | null }) {
  const [rows, setRows] = useState<EquipmentRow[]>([]);
  useEffect(() => {
    if (buildingId) fetchBuildingEquipment(buildingId).then(setRows);
  }, [buildingId]);
  if (!buildingId || rows.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          Equipment at this building
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {rows.map((e) => (
          <div key={e.id} className="text-sm border-b border-border/50 last:border-0 pb-2">
            <div className="font-medium">
              {(e.space.label || e.space.common_area_type || e.space.unit_number) ?? 'Building'} — {e.name}
            </div>
            <div className="text-muted-foreground">
              {[e.manufacturer, e.model, e.serial_number && `SN ${e.serial_number}`, e.spec].filter(Boolean).join(' · ')}
            </div>
            {e.notes && <div className="text-xs italic text-muted-foreground mt-0.5">{e.notes}</div>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
