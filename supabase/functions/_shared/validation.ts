// =============================================================================
// PlumbTix — Edge Function Shared: Validation
// =============================================================================

export { z } from 'https://esm.sh/zod@3.23.8';
export type { ZodSchema } from 'https://esm.sh/zod@3.23.8';

/** UUID v4 regex for Zod string refinement */
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
