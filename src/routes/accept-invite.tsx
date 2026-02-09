import { useState, type FormEvent } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { acceptInvitation } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    // Call Edge Function (no auth required — token is credential)
    const result = await acceptInvitation({
      token,
      email: email.trim(),
      password,
      full_name: fullName.trim(),
      phone: phone.trim() || undefined,
    });

    if (!result.ok) {
      setError(result.error.message);
      setSubmitting(false);
      return;
    }

    // If the Edge Function returned session tokens, set them in Supabase client
    if (result.data.session) {
      await supabase.auth.setSession({
        access_token: result.data.session.access_token,
        refresh_token: result.data.session.refresh_token,
      });
    }

    setSuccess(true);
    setSubmitting(false);

    // Brief delay to show success, then redirect to dashboard
    setTimeout(() => {
      navigate('/', { replace: true });
    }, 1500);
  };

  if (!token) {
    return (
      <div className="page">
        <h1>Invalid Invitation</h1>
        <p className="subtitle">No invitation token found in the URL.</p>
        <p style={{ fontSize: '0.9rem', color: '#666' }}>
          Check your invitation email for the correct link, or{' '}
          <Link to="/login">sign in</Link> if you already have an account.
        </p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="page">
        <div className="success-box">
          <strong>Account created!</strong> Redirecting to your dashboard…
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Accept Invitation</h1>
      <p className="subtitle">Create your Property Manager account</p>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="fullName">Full Name</label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="Must match the invitation email"
          />
        </div>

        <div className="form-group">
          <label htmlFor="phone">Phone (optional)</label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
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
            autoComplete="new-password"
            minLength={8}
            placeholder="Minimum 8 characters"
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={submitting || !email || !password || !fullName}
        >
          {submitting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Creating account…</>
          ) : 'Create Account'}
        </Button>
      </form>

      <p style={{ marginTop: '24px', fontSize: '0.85rem', color: '#666', textAlign: 'center' }}>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
