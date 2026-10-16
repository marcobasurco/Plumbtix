// =============================================================================
// Phone numbers — ONE standard for the whole product
// =============================================================================
// Stored:    E.164, always. "+16505551234". Every phone column has a CHECK
//            constraint and a normalizing trigger (migration 00031).
// Displayed: "(650) 555-1234" for US/Canada numbers; other countries are
//            shown as stored ("+44 7700 900123" style grouping is not
//            attempted — we don't know the country's digit groups).
// Dialed:    tel:+16505551234 (E.164, never the display form).
// Typed:     anything reasonable — "650-555-1234", "(650) 555 1234",
//            "1 650 555 1234", "+1 650 555 1234", "+44 7700 900123" — and
//            normalized before it is saved.
//
// Deno copy of shared/phone.ts — MUST stay identical below this header. A unit
// test (src/__tests__/phone.test.ts) checks both files agree.
// =============================================================================

export const E164_REGEX = /^\+[1-9]\d{1,14}$/;

/** US / Canada: +1 then 10 digits, area code and exchange can't start with 0 or 1. */
const NANP_REGEX = /^\+1([2-9]\d{2})([2-9]\d{2})(\d{4})$/;

/**
 * Turn whatever a person typed into E.164, or null when it can't be a phone
 * number. Empty / whitespace → null (callers treat that as "no phone").
 *
 *   "650-555-1234"      → "+16505551234"
 *   "1 (650) 555-1234"  → "+16505551234"
 *   "+1 650 555 1234"   → "+16505551234"
 *   "+44 7700 900123"   → "+447700900123"
 *   "555-1234"          → null   (too short)
 *   "0065055512345678"  → null   (not a plausible number)
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (hasPlus) {
    // International as typed. 8–15 digits, can't start with 0.
    if (digits.length >= 8 && digits.length <= 15 && digits[0] !== '0') return `+${digits}`;
    return null;
  }

  // No "+": assume North America.
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return null;
}

/** True when the text can be saved as a phone number (or is empty). */
export function isValidPhone(raw: string | null | undefined): boolean {
  if (raw == null || !String(raw).trim()) return true;
  return normalizePhone(raw) !== null;
}

/** Display form. Accepts E.164 or anything normalizePhone understands. */
export function formatPhone(value: string | null | undefined, empty = ''): string {
  const e164 = normalizePhone(value);
  if (!e164) return value ? String(value) : empty;
  const m = e164.match(NANP_REGEX);
  if (m) return `(${m[1]}) ${m[2]}-${m[3]}`;
  if (e164.startsWith('+1') && e164.length === 12) {
    // +1 but an unusual area/exchange — still group it the familiar way
    return `(${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}`;
  }
  return e164;
}

/** href for a tel: link, or null when there is nothing dialable. */
export function telHref(value: string | null | undefined): string | null {
  const e164 = normalizePhone(value);
  return e164 ? `tel:${e164}` : null;
}

/**
 * Format as the person types, for a text input. US numbers get the familiar
 * "(650) 555-1234" shape as digits arrive; anything starting with "+" is left
 * as digits with the plus. Never throws away characters the person is still
 * typing, so backspace works naturally.
 */
export function formatPhoneAsYouType(raw: string): string {
  const trimmed = raw.replace(/[^\d+()\-\s.]/g, '');
  if (trimmed.startsWith('+')) {
    const d = trimmed.replace(/\D/g, '');
    return d ? `+${d}` : '+';
  }
  let d = trimmed.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  if (d.length > 10) d = d.slice(0, 10);
  if (d.length === 0) return '';
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** The error message to show next to a phone field that failed isValidPhone. */
export const PHONE_ERROR = 'Enter a 10-digit US number like (650) 555-1234, or an international number starting with +';

