import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const redirectTo = `${window.location.origin}/reset-password`;

    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo },
    );

    if (resetErr) {
      setError(resetErr.message);
      setSubmitting(false);
      return;
    }

    setSent(true);
    setSubmitting(false);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v6l3-3"/><path d="M12 8l-3-3"/><path d="M20 12a8 8 0 1 1-16 0"/><path d="M12 12v8"/>
            </svg>
          </div>
          <span className="login-logo-text">Work Orders</span>
        </div>
        <p className="login-subtitle">Reset Password</p>

        {sent ? (
          <div className="success-box" style={{ marginTop: '16px' }}>
            <strong>Check your email!</strong>
            <p style={{ margin: '8px 0 0', fontSize: '0.9rem' }}>
              If an account exists for <strong>{email}</strong>, we sent a password reset link.
              It may take a minute to arrive.
            </p>
          </div>
        ) : (
          <>
            <ErrorBanner message={error} onDismiss={() => setError(null)} />

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                  placeholder="you@company.com"
                />
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={submitting || !email}
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                ) : 'Send Reset Link'}
              </Button>
            </form>
          </>
        )}

        <div className="login-links">
          <Link to="/login">← Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
