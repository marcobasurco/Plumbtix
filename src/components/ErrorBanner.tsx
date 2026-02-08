import { useState, useEffect } from 'react';

interface ErrorBannerProps {
  message: string | null;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when the message changes (new error arrived)
  useEffect(() => {
    setDismissed(false);
  }, [message]);

  if (!message || dismissed) return null;

  return (
    <div
      role="alert"
      style={{
        background: '#fef2f2',
        border: '1px solid #fca5a5',
        borderRadius: '6px',
        padding: '12px 16px',
        marginBottom: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: '#991b1b',
        fontSize: '0.9rem',
      }}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={() => { setDismissed(true); onDismiss(); }}
          style={{
            background: 'none',
            border: 'none',
            color: '#991b1b',
            cursor: 'pointer',
            fontSize: '1.1rem',
            padding: '0 4px',
          }}
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}
