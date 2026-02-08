import { useState, useEffect } from 'react';

interface ErrorBannerProps {
  message: string | null;
  onDismiss?: () => void;
  variant?: 'error' | 'success' | 'info';
}

export function ErrorBanner({ message, onDismiss, variant = 'error' }: ErrorBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => { setDismissed(false); }, [message]);

  if (!message || dismissed) return null;

  const cls = variant === 'success' ? 'alert-success' : variant === 'info' ? 'alert-info' : 'alert-error';
  const icons: Record<string, string> = {
    error: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z',
    success: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    info: 'M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z',
  };

  return (
    <div className={`alert ${cls}`} role="alert">
      <svg className="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={icons[variant]} />
      </svg>
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button className="alert-dismiss" onClick={() => { setDismissed(true); onDismiss(); }} aria-label="Dismiss">×</button>
      )}
    </div>
  );
}
