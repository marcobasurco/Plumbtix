import { useState, useEffect, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [ready, setReady] = useState(false);

  // Supabase auto-detects the recovery tokens in the URL hash
  // and fires PASSWORD_RECOVERY event
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'PASSWORD_RECOVERY') {
          setReady(true);
        }
      },
    );

    // Also check if session already exists (user may have refreshed)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setSubmitting(true);

    const { error: updateErr } = await supabase.auth.updateUser({
      password,
    });

    if (updateErr) {
      setError(updateErr.message);
      setSubmitting(false);
      return;
    }

    setSuccess(true);
    setSubmitting(false);

    setTimeout(() => {
      navigate('/', { replace: true });
    }, 2000);
  };

  // Logo block used in all states
  const logo = (
    <div className="login-logo">
      <div className="login-logo-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v6l3-3"/><path d="M12 8l-3-3"/><path d="M20 12a8 8 0 1 1-16 0"/><path d="M12 12v8"/>
        </svg>
      </div>
      <span className="login-logo-text">Work Orders</span>
    </div>
  );

  if (success) {
    return (
      <div className="login-page">
        <div className="login-card">
          {logo}
          <div className="success-box" style={{ marginTop: '16px' }}>
            <strong>Password updated!</strong> Redirecting to your dashboard…
          </div>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="login-page">
        <div className="login-card">
          {logo}
          <p className="login-subtitle">Reset Password</p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '12px' }}>
            Verifying your reset link…
          </p>
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <Loader2 className="h-5 w-5 animate-spin" style={{ display: 'inline-block', color: 'var(--primary)' }} />
          </div>
          <div className="login-links">
            Link expired? <Link to="/forgot-password">Request a new one</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {logo}
        <p className="login-subtitle">Set New Password</p>

        <ErrorBanner message={error} onDismiss={() => setError(null)} />

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="password">New Password</label>
            <input
              id="password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              autoFocus
              minLength={8}
              placeholder="Minimum 8 characters"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirm">Confirm Password</label>
            <input
              id="confirm"
              type="password"
              className="form-input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
              placeholder="Re-enter password"
            />
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={submitting || !password || !confirm}
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Updating…</>
            ) : 'Update Password'}
          </Button>
        </form>

        <div className="login-links">
          <Link to="/login">← Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
