import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Loading } from '@/components/Loading';
import { ErrorBanner } from '@/components/ErrorBanner';
import { roleHome } from '@/components/RoleGate';

export function LoginPage() {
  const { session, role, loading, error: authError, signIn } = useAuth();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!loading && session && role) {
    const from = (location.state as { from?: string })?.from;
    return <Navigate to={from ?? roleHome(role)} replace />;
  }

  if (loading) return <Loading message="Checking session…" />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    const { error } = await signIn(email.trim(), password);
    if (error) setFormError(error);
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
          <span className="login-logo-text">PlumbTix</span>
        </div>
        <p className="login-subtitle">Pro Roto Work Orders Portal</p>

        <ErrorBanner message={formError ?? authError} onDismiss={() => setFormError(null)} />

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email" type="email" className="form-input"
              value={email} onChange={(e) => setEmail(e.target.value)}
              required autoComplete="email" autoFocus
              placeholder="you@company.com"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password" type="password" className="form-input"
              value={password} onChange={(e) => setPassword(e.target.value)}
              required autoComplete="current-password" minLength={8}
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={submitting || !email || !password}>
            {submitting ? (
              <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Signing in…</>
            ) : 'Sign In'}
          </button>
        </form>

        <div className="login-links">
          Have an invitation? <Link to="/accept-invite">Accept PM Invite</Link>
          {' · '}
          <Link to="/claim-account">Claim Resident Account</Link>
        </div>
      </div>
    </div>
  );
}
