// Presentation-layer normalization for reports. Stored values are never
// altered — only their display (per report spec: "Not provided" for gaps,
// no "SN SN-" duplication, "400k BTU" → "400,000 BTU", long dates).

export function fmtValue(v: string | null | undefined): string {
  const t = (v ?? '').trim();
  return t || 'Not provided';
}

export function fmtDate(d: Date | string = new Date()): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** "SN-127100" stays; a leading "SN " label prefix in data is dropped. */
export function fmtSerial(v: string | null | undefined): string {
  const t = (v ?? '').trim().replace(/^SN\s+(?=SN-)/i, '');
  return t || 'Not provided';
}

/** Expand "400k BTU" → "400,000 BTU"; thousands-separate plain BTU numbers. */
function expandBtu(s: string): string {
  return s
    .replace(/(\d+)\s*k\s*BTU/gi, (_, n) => `${Number(n).toLocaleString('en-US')},000 BTU`
      .replace(/^(\d)/, '$1')) // no-op guard
    .replace(/(\d{4,})\s*BTU/g, (_, n) => `${Number(n).toLocaleString('en-US')} BTU`);
}

/** Try to split a spec like "400k BTU natural gas" into Capacity + Fuel Type.
 *  Falls back to a single normalized Specifications value. */
export function parseSpec(v: string | null | undefined):
  { capacity?: string; fuel?: string; spec?: string } {
  const t = (v ?? '').trim();
  if (!t) return {};
  const norm = expandBtu(t);
  const m = norm.match(/^([\d,]+\s*BTU)\s+(.+)$/i);
  if (m) {
    return { capacity: m[1], fuel: m[2].replace(/^\w/, c => c.toUpperCase()) };
  }
  return { spec: norm };
}

/** "boiler" → "Boiler", "circulation pump" → "Circulation Pump" */
export function fmtCategory(v: string | null | undefined): string {
  const t = (v ?? '').trim();
  if (!t) return 'Not provided';
  return t.replace(/\b\w/g, c => c.toUpperCase());
}

export function makeReportId(prefix: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
