// =============================================================================
// PlumbTix — Login Page (v3 Redesign)
// =============================================================================
// Centered card with clean form, proper shadcn/ui components, error handling.
// =============================================================================

import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Loading } from '@/components/Loading';
import { roleHome } from '@/components/RoleGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, Wrench, AlertCircle } from 'lucide-react';

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

  const displayError = formError ?? authError;

  return (
    <div className="login-page">
      <div className="w-full max-w-[400px] relative z-10">
        {/* Logo */}
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
            <CardTitle className="text-lg">Sign in</CardTitle>
            <CardDescription>Enter your credentials to access your account</CardDescription>
          </CardHeader>

          <CardContent>
            {/* Error display */}
            {displayError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2.5 mb-4">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{displayError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                  placeholder="you@company.com"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    to="/forgot-password"
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  minLength={8}
                  placeholder="••••••••"
                />
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={submitting || !email || !password}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex-col gap-3 pt-0">
            <Separator />
            <div className="text-center text-xs text-muted-foreground space-y-1">
              <p>
                Have an invitation?{' '}
                <Link to="/accept-invite" className="text-primary hover:underline font-medium">
                  Accept PM Invite
                </Link>
              </p>
              <p>
                Resident?{' '}
                <Link to="/claim-account" className="text-primary hover:underline font-medium">
                  Claim Your Account
                </Link>
              </p>
            </div>
          </CardFooter>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Pro Roto Inc. — Service Portal
        </p>
      </div>
    </div>
  );
}
