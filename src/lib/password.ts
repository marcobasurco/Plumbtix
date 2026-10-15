// =============================================================================
// Work Orders — Password policy (frontend)
// =============================================================================
// Mirrors the Supabase Auth settings (Dashboard → Authentication → Sign In /
// Providers → Email) and supabase/functions/_shared/validation.ts:
// minimum 12 characters with a lowercase letter, an uppercase letter, a number
// and a symbol. Checking client-side gives an immediate, specific message
// instead of a generic "weak password" rejection from the server.
// =============================================================================

export const PASSWORD_MIN_LENGTH = 12;

export const PASSWORD_RULES_TEXT =
  `At least ${PASSWORD_MIN_LENGTH} characters, with an uppercase letter, a lowercase letter, a number, and a symbol`;

const SYMBOLS = /[\]!@#$%^&*()_+=[{};':"\\|<>?,./`~-]/;

/** Returns null when the password meets the policy, otherwise a message to show the user. */
export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password.length > 128) return 'Password is too long';
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter';
  if (!/[0-9]/.test(password)) return 'Password must include a number';
  if (!SYMBOLS.test(password)) return 'Password must include a symbol (for example ! @ # $ %)';
  return null;
}
