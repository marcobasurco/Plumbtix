/** Notes as readable paragraphs, user line breaks preserved. */
export function NotesSection({ notes }: { notes: string | null }) {
  const t = (notes ?? '').trim();
  if (!t) return null;
  return (
    <div className="rpt-notes">
      <div className="rpt-notes-label">Notes</div>
      {t.split(/\r?\n/).filter(Boolean).map((line, i) => (
        <p key={i} className="rpt-notes-line">{line}</p>
      ))}
    </div>
  );
}
