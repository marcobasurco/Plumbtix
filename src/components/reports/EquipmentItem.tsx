import { EquipmentDetailsTable, type EquipmentLike } from './EquipmentDetailsTable';
import { NotesSection } from './NotesSection';

/** One equipment record: bold title, detail table, notes.
 *  break-inside: avoid keeps the whole item on one page. */
export function EquipmentItem({ e }: { e: EquipmentLike & { id: string; name: string; notes: string | null } }) {
  return (
    <article className="rpt-item">
      <h4 className="rpt-item-title">{e.name}</h4>
      <EquipmentDetailsTable e={e} />
      <NotesSection notes={e.notes} />
    </article>
  );
}
