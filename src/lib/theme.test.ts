import { describe, it, expect, beforeEach } from 'vitest';
import { applyTheme, resetTheme, getTheme, normalizeTheme } from './theme';

describe('theme', () => {
  beforeEach(() => {
    resetTheme();
  });

  it('is daylight by default', () => {
    expect(getTheme()).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('treats anything that is not "dark" as daylight', () => {
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme(undefined)).toBe('light');
    expect(normalizeTheme(null)).toBe('light');
    expect(normalizeTheme('system')).toBe('light');
  });

  it('applies dark and remembers it in the browser', () => {
    applyTheme('dark');
    expect(getTheme()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('proroto-theme')).toBe('dark');
  });

  it('goes back to daylight and forgets the choice when nobody is signed in', () => {
    applyTheme('dark');
    resetTheme();
    expect(getTheme()).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('proroto-theme')).toBeNull();
  });
});
