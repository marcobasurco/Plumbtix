// =============================================================================
// Pro Roto App — Light / dark theme
// =============================================================================
// Rules (Marco, Nov 2026):
//   • Daylight (light) is the default. The sign-in screen is always daylight;
//     the device's own dark-mode setting is not followed.
//   • A person who switches to dark keeps it: the choice is saved on their
//     profile (users.theme_preference, migration 00034) and follows them to
//     any device after they sign in.
//
// How it fits together:
//   • auth.tsx calls applyTheme(profile.theme_preference) once the profile
//     loads, and resetTheme() whenever nobody is signed in.
//   • The browser also remembers the signed-in person's choice (localStorage)
//     so public/theme-init.js can paint the right theme before React starts —
//     no flash on reload. That copy is cleared on sign-out.
// =============================================================================

import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'proroto-theme';
const listeners = new Set<() => void>();

function readStored(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

let current: Theme = typeof window === 'undefined' ? 'light' : readStored();

/** Anything that is not exactly 'dark' is daylight. */
export function normalizeTheme(value: unknown): Theme {
  return value === 'dark' ? 'dark' : 'light';
}

export function getTheme(): Theme {
  return current;
}

/** Show a theme now and remember it in this browser for the signed-in person. */
export function applyTheme(theme: Theme): void {
  current = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode / storage blocked — the theme still applies for this visit */
  }
  listeners.forEach((notify) => notify());
}

/** Nobody is signed in: back to daylight, and forget the last person's choice. */
export function resetTheme(): void {
  current = 'light';
  document.documentElement.classList.remove('dark');
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/** Current theme, re-rendering when it changes. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, () => 'light' as Theme);
}
