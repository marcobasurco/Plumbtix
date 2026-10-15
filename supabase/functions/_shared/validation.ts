// =============================================================================
// Work Orders — Edge Function Shared: Validation
// =============================================================================

import { z } from 'https://esm.sh/zod@3.23.8';
export { z };
export type { ZodSchema } from 'https://esm.sh/zod@3.23.8';

/** UUID v4 regex for Zod string refinement */
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Password policy ────────────────────────────────────────────────────────
// Mirrors the Supabase Auth settings (Dashboard → Authentication → Sign In /
// Providers → Email): minimum 12 characters, lowercase + uppercase + digit +
// symbol. Validating here gives the user a clear message instead of a raw
// "weak password" error from the Auth admin API. Keep in sync with
// src/lib/password.ts.

export const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_SYMBOLS = /[\]!@#$%^&*()_+=[{};':"\\|<>?,./`~-]/;

export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(128, 'Password is too long')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number')
  .regex(PASSWORD_SYMBOLS, 'Password must include a symbol (e.g. ! @ # $ %)');

/**
 * Parse and validate a JSON request body against a Zod schema.
 *
 * @returns { success: true, data: T } or { success: false, message: string }
 */
export async function parseBody<T>(
  req: Request,
  schema: { parse: (input: unknown) => T },
): Promise<{ success: true; data: T } | { success: false; message: string }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { success: false, message: 'Invalid JSON body' };
  }

  try {
    const data = schema.parse(raw);
    return { success: true, data };
  } catch (e: unknown) {
    // Zod errors have a .issues array
    if (e && typeof e === 'object' && 'issues' in e) {
      const issues = (e as { issues: Array<{ path: (string | number)[]; message: string }> }).issues;
      const messages = issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      );
      return { success: false, message: messages.join('; ') };
    }
    return { success: false, message: 'Validation failed' };
  }
}
