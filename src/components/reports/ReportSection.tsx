import type { ReactNode } from 'react';

/** Location/category section: uppercase heading + thin rule.
 *  break-after: avoid keeps the heading with its first item. */
export function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rpt-section">
      <h3 className="rpt-section-title">{title}</h3>
      <hr className="rpt-rule-light" />
      {children}
    </section>
  );
}
