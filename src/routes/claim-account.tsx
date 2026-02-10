import { useState, type FormEvent } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { claimResident } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export function ClaimAccountPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await claimResident({
      invite_token: token,
      email: email.trim(),
      password,
    });

    if (!result.ok) {
      setError(result.error.message);
      setSubmitting(false);
      return;
    }

    if (result.data.session) {
      await supabase.auth.setSession({
        access_token: result.data.session.access_token,
        refresh_token: result.data.session.refresh_token,
      });
    }

    setSuccess(true);
    setSubmitting(false);

    setTimeout(() => {
      navigate('/', { replace: true });
    }, 1500);
  };

  if (!token) {
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
          <p className="login-subtitle">Invalid Link</p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '8px' }}>
            No claim token found in the URL. Check the link from your property manager, or{' '}
            <Link to="/login">sign in</Link> if you already have an account.
          </p>
        </div>
      </div>
    );
  }

  if (success) {
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
          <div className="success-box" style={{ marginTop: '16px' }}>
            <strong>Account claimed!</strong> Redirecting to your dashboard…
          </div>
        </div>
      </div>
    );
  }

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
        <p className="login-subtitle">Claim Your Account</p>

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
              placeholder="Must match the email on file"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
              placeholder="Minimum 8 characters"
            />
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={submitting || !email || !password}
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Claiming account…</>
            ) : 'Claim Account'}
          </Button>
        </form>

        <div className="login-links">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
