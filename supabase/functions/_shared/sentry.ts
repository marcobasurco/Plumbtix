// =============================================================================
// PlumbTix — Edge Function Shared: Sentry Error Reporting
// =============================================================================
// Central error reporting for all edge functions. Two integration points:
//   • response.ts serverError() — every 500 any function returns is reported
//   • notifications.ts catch blocks — fire-and-forget email/SMS failures
//
// Behavior without configuration: if the SENTRY_DSN secret is not set, every
// export here is a silent no-op — safe to deploy before Sentry exists.
//
// Setup:
//   Supabase Dashboard → Edge Functions → Secrets:
//     SENTRY_DSN        = https://…ingest.sentry.io/…   (required)
//     SENTRY_BOOT_PING  = true                          (optional, temporary:
//       sends one "edge boot" info event on cold start so you can verify the
//       pipeline end-to-end, then delete the secret to silence it)
//
// SDK: official Sentry Deno SDK, per Supabase's monitoring guide.
// =============================================================================

// deno-lint-ignore-file no-explicit-any
import * as Sentry from 'https://deno.land/x/sentry/index.mjs';

const dsn = Deno.env.get('SENTRY_DSN');
let enabled = false;

if (dsn) {
  try {
    Sentry.init({
      dsn,
      environment: 'edge',
      // Errors only — no performance tracing from functions (keeps quota tiny)
      tracesSampleRate: 0,
    });
    enabled = true;

    if (Deno.env.get('SENTRY_BOOT_PING') === 'true') {
      Sentry.captureMessage('PlumbTix edge boot ping — Sentry pipeline OK', 'info');
    }
  } catch (e) {
    // Reporting must never break the function itself
    console.error('[sentry] init failed:', e);
  }
}

/**
 * Report an error (or message) to Sentry with optional context tags.
 * Always safe to call: no-ops when Sentry isn't configured, never throws.
 */
export function reportError(
  errOrMessage: unknown,
  context?: Record<string, string>,
): void {
  if (!enabled) return;
  try {
    Sentry.withScope((scope: any) => {
      if (context) {
        for (const [k, v] of Object.entries(context)) scope.setTag(k, v);
      }
      if (errOrMessage instanceof Error) {
        Sentry.captureException(errOrMessage);
      } else {
        Sentry.captureMessage(String(errOrMessage), 'error');
      }
    });
  } catch (e) {
    console.error('[sentry] report failed:', e);
  }
}
