// =============================================================================
// Work Orders — Edge Function Shared: Background work
// =============================================================================
// Supabase Edge Functions may tear down the isolate as soon as the response is
// sent. A promise that is simply left un-awaited ("fire-and-forget") can
// therefore be cut off mid-flight — an emergency SMS or email that silently
// never sends. EdgeRuntime.waitUntil() tells the runtime to keep the isolate
// alive until the promise settles (within the function's wall-clock limit).
//
// Usage:
//   runInBackground((async () => { ...notify... })());
//   return ok(...);   // response goes out immediately; work still completes
//
// Falls back to a plain detached promise where EdgeRuntime is unavailable
// (older local `supabase functions serve` builds, unit tests).
// =============================================================================

type WaitUntilRuntime = { waitUntil?: (promise: Promise<unknown>) => void };

export function runInBackground(task: Promise<unknown>): void {
  // Never let a background failure surface as an unhandled rejection.
  const guarded = task.catch((e: unknown) => {
    console.error('[background] task failed:', e);
  });

  const runtime = (globalThis as { EdgeRuntime?: WaitUntilRuntime }).EdgeRuntime;
  if (runtime && typeof runtime.waitUntil === 'function') {
    runtime.waitUntil(guarded);
  }
  // else: detached — best effort, same as before this helper existed
}
