/// <reference types="vite/client" />

// Buffer polyfill for @react-pdf/renderer
declare global {
  // eslint-disable-next-line no-var
  var Buffer: typeof import('buffer').Buffer;
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_EDGE_BASE_URL: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_RESEND_SANDBOX?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
