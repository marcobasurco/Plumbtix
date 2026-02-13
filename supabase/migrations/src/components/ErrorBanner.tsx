import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

interface ErrorBannerProps {
  message: string | null;
  onDismiss?: () => void;
  variant?: 'error' | 'success' | 'info';
}

const VARIANTS = {
  error: {
    wrapper: 'bg-destructive/10 text-destructive border-destructive/20',
    icon: AlertCircle,
  },
  success: {
    wrapper: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
    icon: CheckCircle2,
  },
  info: {
    wrapper: 'bg-primary/10 text-primary border-primary/20',
    icon: Info,
  },
};

export function ErrorBanner({ message, onDismiss, variant = 'error' }: ErrorBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => { setDismissed(false); }, [message]);
  if (!message || dismissed) return null;

  const v = VARIANTS[variant];
  const Icon = v.icon;

  return (
    <div className={`flex items-center gap-2.5 text-sm border rounded-lg px-4 py-3 mb-4 ${v.wrapper}`} role="alert">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          onClick={() => { setDismissed(true); onDismiss(); }}
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
