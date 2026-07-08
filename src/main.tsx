// Buffer polyfill for @react-pdf/renderer (loaded on demand)
import { Buffer } from 'buffer';
if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// Render first — the app paints without waiting for monitoring code.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Initialize Sentry AFTER first paint via dynamic import (production only).
// Keeps the ~100KB+ SDK out of the entry bundle; it attaches milliseconds
// after render. Errors thrown in that tiny window go unreported — an
// acceptable trade for a faster first load on every visit.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  import('@sentry/browser')
    .then((Sentry) => {
      Sentry.init({
        dsn: sentryDsn,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
        integrations: [
          Sentry.browserTracingIntegration(),
        ],
      });
    })
    .catch((e) => {
      console.warn('[sentry] Failed to load monitoring SDK:', e);
    });
}

// Service worker registration (moved from an inline index.html script so the
// enforced CSP can drop inline-script allowances entirely).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
