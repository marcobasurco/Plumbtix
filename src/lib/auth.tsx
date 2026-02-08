// =============================================================================
// PlumbTix — Auth Context (Frontend)
// =============================================================================
// Provides: session, user profile (from public.users), role, companyId.
//
// Auth flow:
//   1. onAuthStateChange fires INITIAL_SESSION on subscribe (supabase-js v2.39+)
//   2. If session exists → fetch profile from public.users via RLS self-read
//   3. Profile contains role + company_id → stored in context
//   4. Components consume via useAuth() hook
//   5. Subsequent events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED) update state
//
// Profile fetch uses user JWT (users_read_own RLS policy allows self-read).
// No service role key in the frontend.
// =============================================================================

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import type { User } from '@shared/types/database';
import type { UserRole } from '@shared/types/enums';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface AuthState {
  /** Supabase auth session (null when logged out) */
  session: Session | null;
  /** Profile from public.users (null when logged out or loading) */
  profile: User | null;
  /** User role extracted from profile */
  role: UserRole | null;
  /** Company UUID (null for residents, set for PMs and proroto_admin) */
  companyId: string | null;
  /** True while initial session check + profile fetch is in progress */
  loading: boolean;
  /** Error message if profile fetch failed */
  error: string | null;
  /** Sign in with email + password */
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  /** Sign out and clear state */
  signOut: () => Promise<void>;
  /** Manually refresh profile (e.g. after onboarding) */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch the user's profile from public.users via RLS self-read.
  const fetchProfile = useCallback(async (userId: string): Promise<User | null> => {
    const { data, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (fetchError || !data) {
      console.error('[auth] Profile fetch failed:', fetchError?.message);
      setError('Failed to load user profile. Please try again.');
      return null;
    }

    return data as User;
  }, []);

  // Handle session → profile flow
  const handleSession = useCallback(async (newSession: Session | null) => {
    setSession(newSession);
    setError(null);

    if (!newSession?.user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const userProfile = await fetchProfile(newSession.user.id);
    setProfile(userProfile);
    setLoading(false);
  }, [fetchProfile]);

  // Listen for auth state changes.
  // supabase-js v2 fires INITIAL_SESSION synchronously on subscribe,
  // so we do NOT also call getSession() (which would double-fetch the profile).
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        handleSession(newSession);
      },
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [handleSession]);

  // Sign in
  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setLoading(false);
      const msg = signInError.message === 'Invalid login credentials'
        ? 'Invalid email or password'
        : signInError.message;
      setError(msg);
      return { error: msg };
    }

    // onAuthStateChange will fire and call handleSession
    return { error: null };
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setError(null);
    setLoading(false);
  }, []);

  // Refresh profile (e.g. after onboarding changes user data)
  const refreshProfile = useCallback(async () => {
    if (!session?.user) return;
    const userProfile = await fetchProfile(session.user.id);
    setProfile(userProfile);
  }, [session, fetchProfile]);

  const value: AuthState = {
    session,
    profile,
    role: profile?.role ?? null,
    companyId: profile?.company_id ?? null,
    loading,
    error,
    signIn,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
