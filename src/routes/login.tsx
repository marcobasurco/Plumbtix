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

  // Already logged in → redirect to intended page or role home
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
    if (error) {
      setFormError(error);
    }
    setSubmitting(false);
  };

  return (
    <div className="page">
      <h1>PlumbTix</h1>
      <p className="subtitle">Pro Roto Work Orders Portal — Sign In</p>

      <ErrorBanner message={formError ?? authError} onDismiss={() => setFormError(null)} />

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            minLength={8}
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting || !email || !password}
        >
          {submitting ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      <p style={{ marginTop: '24px', fontSize: '0.85rem', color: '#666', textAlign: 'center' }}>
        Have an invitation? <Link to="/accept-invite">Accept PM Invite</Link>
        {' · '}
        <Link to="/claim-account">Claim Resident Account</Link>
      </p>
    </div>
  );
}
