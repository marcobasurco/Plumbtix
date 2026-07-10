import { fmtCategory, fmtSerial, fmtValue, parseSpec } from './format';

export interface EquipmentLike {
  category: string; manufacturer: string | null; model: string | null;
  serial_number: string | null; spec: string | null;
}

/** Two-column label/value table — labels vertically aligned, thin borders. */
export function EquipmentDetailsTable({ e }: { e: EquipmentLike }) {
  const s = parseSpec(e.spec);
  const rows: [string, string][] = [
    ['Equipment Type', fmtCategory(e.category)],
    ['Manufacturer', fmtValue(e.manufacturer)],
    ['Model', fmtValue(e.model)],
    ['Serial Number', fmtSerial(e.serial_number)],
  ];
  if (s.capacity) rows.push(['Capacity', s.capacity]);
  if (s.fuel) rows.push(['Fuel Type', s.fuel]);
  if (s.spec) rows.push(['Specifications', s.spec]);
  return (
    <table className="rpt-kv rpt-kv-bordered">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
