import { useState, type FormEvent, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, Wrench, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';

// =============================================================================
// Reset Password
// =============================================================================
// The recovery link arrives as /reset-password#access_token=…&refresh_token=…
// &type=recovery. Our Supabase client is configured with
// detectSessionInUrl: false (deliberate, app-wide), which means NOTHING
// consumes those tokens automatically — so this page must exchange them for a
// session itself via setSession() before updateUser() can work. Skipping that
// step was the "Auth session missing!" bug: the form rendered, but every
// submission failed because no session was ever established.
// =============================================================================

type LinkState = 'verifying' | 'ready' | 'invalid';

/** Parse the recovery tokens (or an error) out of the URL hash. */
function parseRecoveryHash(): {
  access_token?: string;
  refresh_token?: string;
  error_description?: string;
} {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  return {
    access_token: params.get('access_token') ?? undefined,
    refresh_token: params.get('refresh_token') ?? undefined,
    error_description: params.get('error_description') ?? undefined,
  };
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [linkState, setLinkState] = useState<LinkState>('verifying');
  const [linkError, setLinkError] = useState<string | null>(null);

  // ── Exchange the URL tokens for a temporary session ──
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { access_token, refresh_token, error_description } = parseRecoveryHash();

      // Supabase reports expired/used links via error params in the hash
      if (error_description) {
        if (!cancelled) {
          setLinkError(error_description.replace(/\+/g, ' '));
          setLinkState('invalid');
        }
        return;
      }

      if (!access_token || !refresh_token) {
        // No tokens at all — user navigated here directly, or the link was
        // mangled. An existing session (rare: clicked twice in same tab)
        // still allows a password update, so check before declaring invalid.
        const { data } = await supabase.auth.getSession();
        if (!cancelled) setLinkState(data.session ? 'ready' : 'invalid');
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      if (cancelled) return;

      if (sessionError) {
        setLinkError(sessionError.message);
        setLinkState('invalid');
        return;
      }

      // Session established. Scrub the tokens out of the address bar so they
      // can't be shoulder-surfed, bookmarked, or leaked via copy/paste.
      window.history.replaceState(null, '', window.location.pathname);
      setLinkState('ready');
    })();

    return () => { cancelled = true; };
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
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);
      setSuccess(true);
      // End the temporary recovery session so the user signs in fresh with
      // the new password (also avoids landing half-logged-in on /login).
      await supabase.auth.signOut();
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="w-full max-w-[400px] relative z-10">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <Wrench className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-xl font-bold tracking-tight">PlumbTix</div>
            <div className="text-xs text-muted-foreground -mt-0.5">Work Order Management</div>
          </div>
        </div>

        <Card className="shadow-lg border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Set New Password</CardTitle>
            <CardDescription>
              {success ? 'Your password has been updated!' : 'Choose a strong password for your account.'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {linkState === 'verifying' ? (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying reset link…
              </div>
            ) : linkState === 'invalid' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    {linkError
                      ? `This reset link can't be used: ${linkError}.`
                      : 'Invalid or expired reset link.'}{' '}
                    Reset links work once and expire after a short time.
                  </span>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/forgot-password">Request a new reset link</Link>
                </Button>
              </div>
            ) : success ? (
              <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md px-3 py-3">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Password updated. Redirecting to login…</span>
              </div>
            ) : (
              <>
                {error && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2.5 mb-4">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">New Password</Label>
                    <Input id="password" type="password" value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required minLength={8} autoFocus placeholder="••••••••" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm">Confirm Password</Label>
                    <Input id="confirm" type="password" value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required minLength={8} placeholder="••••••••" />
                  </div>
                  <Button type="submit" className="w-full" disabled={submitting || !password || !confirm}>
                    {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating…</> : 'Update Password'}
                  </Button>
                </form>
              </>
            )}
          </CardContent>

          <CardFooter className="flex-col gap-3 pt-0">
            <Separator />
            <Link to="/login" className="flex items-center gap-1 text-sm text-primary hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
