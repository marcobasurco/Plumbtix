import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, RefreshCw, X } from 'lucide-react';

interface ErrorBannerProps {
  message: string | null;
  onDismiss?: () => void;
  /** When provided, a "Try again" button is shown — use it for load failures. */
  onRetry?: () => void;
  variant?: 'error' | 'success' | 'info';
}

const VARIANTS = {
  error: {
    wrapper: 'tone-danger tone-notice',
    icon: AlertCircle,
  },
  success: {
    wrapper: 'tone-ok tone-notice',
    icon: CheckCircle2,
  },
  info: {
    wrapper: 'tone-info tone-notice',
    icon: Info,
  },
};

/**
 * Turn a raw error into something a person can act on. Network and session
 * failures are the common cases in the field (basements, one bar of signal);
 * the raw text ("Failed to fetch", "JWT expired") stays in the console.
 */
export function friendlyError(raw: unknown, fallback = 'Something went wrong.'): string {
  const msg = raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : '';
  const lower = msg.toLowerCase();
  if (!msg) return fallback;
  if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('load failed')) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  if (lower.includes('jwt') || lower.includes('expired') || lower.includes('not authenticated')) {
    return 'Your session has expired. Sign in again to continue.';
  }
  if (lower.includes('row-level security') || lower.includes('permission')) {
    return "You don't have access to this. If you think you should, contact your admin.";
  }
  return msg;
}

export function ErrorBanner({ message, onDismiss, onRetry, variant = 'error' }: ErrorBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => { setDismissed(false); }, [message]);
  if (!message || dismissed) return null;

  const v = VARIANTS[variant];
  const Icon = v.icon;

  return (
    <div className={`flex items-center gap-2.5 text-sm rounded-lg px-4 py-3 mb-4 ${v.wrapper}`} role="alert">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-black/15 dark:border-white/20 px-3 py-2 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={() => { setDismissed(true); onDismiss(); }}
          className="shrink-0 h-9 w-9 -mr-2 inline-flex items-center justify-center rounded-md opacity-60 hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
