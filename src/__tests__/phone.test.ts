import { describe, it, expect } from 'vitest';
import * as browser from '@shared/phone';
// The Deno copy must behave identically. It is dependency-free on purpose
// so this test can import it straight from the edge-function tree.
import * as deno from '../../supabase/functions/_shared/phone';

const CASES: Array<[string, string | null]> = [
  ['650-555-1234', '+16505551234'],
  ['(650) 555-1234', '+16505551234'],
  ['650.555.1234', '+16505551234'],
  ['1 650 555 1234', '+16505551234'],
  ['+1 650 555 1234', '+16505551234'],
  ['+16505551234', '+16505551234'],
  ['  +1 (650) 555-1234  ', '+16505551234'],
  ['+44 7700 900123', '+447700900123'],
  ['+52 55 1234 5678', '+525512345678'],
  ['555-1234', null],            // too short
  ['65055512345', null],         // 11 digits not starting with 1
  ['0065055512345678', null],    // nonsense
  ['+0 123 456 789', null],      // international can't start with 0
  ['abc', null],
  ['', null],
  ['   ', null],
];

describe('normalizePhone', () => {
  it.each(CASES)('%s → %s', (input, expected) => {
    expect(browser.normalizePhone(input)).toBe(expected);
  });
  it('treats null / undefined as no phone', () => {
    expect(browser.normalizePhone(null)).toBeNull();
    expect(browser.normalizePhone(undefined)).toBeNull();
  });
});

describe('formatPhone', () => {
  it('shows US numbers the familiar way', () => {
    expect(browser.formatPhone('+16505551234')).toBe('(650) 555-1234');
    expect(browser.formatPhone('6505551234')).toBe('(650) 555-1234');
  });
  it('leaves international numbers in E.164', () => {
    expect(browser.formatPhone('+447700900123')).toBe('+447700900123');
  });
  it('falls back to the raw text, or the empty marker', () => {
    expect(browser.formatPhone('garbage')).toBe('garbage');
    expect(browser.formatPhone(null, '—')).toBe('—');
    expect(browser.formatPhone('', '—')).toBe('—');
  });
});

describe('telHref', () => {
  it('always dials E.164', () => {
    expect(browser.telHref('(650) 555-1234')).toBe('tel:+16505551234');
    expect(browser.telHref('nope')).toBeNull();
  });
});

describe('formatPhoneAsYouType', () => {
  it('shapes a US number as digits arrive', () => {
    expect(browser.formatPhoneAsYouType('6')).toBe('(6');
    expect(browser.formatPhoneAsYouType('650')).toBe('(650');
    expect(browser.formatPhoneAsYouType('6505')).toBe('(650) 5');
    expect(browser.formatPhoneAsYouType('6505551234')).toBe('(650) 555-1234');
    expect(browser.formatPhoneAsYouType('16505551234')).toBe('(650) 555-1234');
  });
  it('leaves international input alone', () => {
    expect(browser.formatPhoneAsYouType('+44 7700')).toBe('+447700');
  });
  it('clears cleanly', () => {
    expect(browser.formatPhoneAsYouType('')).toBe('');
    expect(browser.formatPhoneAsYouType('(')).toBe('');
  });
});

describe('browser and edge copies agree', () => {
  it.each(CASES)('normalizePhone(%s)', (input) => {
    expect(deno.normalizePhone(input)).toBe(browser.normalizePhone(input));
  });
  it('formatPhone', () => {
    for (const [input] of CASES) expect(deno.formatPhone(input)).toBe(browser.formatPhone(input));
  });
});
