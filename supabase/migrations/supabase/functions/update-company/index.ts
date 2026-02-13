// =============================================================================
// Work Orders — Edge Function: update-company
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createUserClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { ok, err, unauthorized, notFound, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';

const UpdateCompanySchema = z.object({
  id: z.string().regex(UUID_REGEX, 'Invalid company id'),
  name: z.string().min(1).max(255).optional().transform((v) => v?.trim()),
  slug: z
    .string()
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional()
    .transform((v) => v?.trim().toLowerCase()),
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'POST') return err('METHOD_NOT_ALLOWED', 'POST required', 405);

  let userClient;
  let userId: string;
  try {
    userClient = createUserClient(req);
    userId = await getAuthenticatedUserId(userClient);
  } catch {
    return unauthorized();
  }

  const parsed = await parseBody(req, UpdateCompanySchema);
  if (!parsed.success) return err('VALIDATION_ERROR', parsed.message);

  const { id, ...fields } = parsed.data;

  // Remove undefined fields
  const updateFields: Record<string, unknown> = {};
  if (fields.name !== undefined) updateFields.name = fields.name;
  if (fields.slug !== undefined) updateFields.slug = fields.slug;

  if (Object.keys(updateFields).length === 0) {
    return err('VALIDATION_ERROR', 'No fields to update');
  }

  try {
    const { data: company, error: updateErr } = await userClient
      .from('companies')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      if (updateErr.message?.includes('row-level security')) {
        return err('FORBIDDEN', 'Only Pro Roto admins can update companies', 403);
      }
      if (updateErr.code === 'PGRST116') {
        return notFound('Company not found');
      }
      if (updateErr.message?.includes('duplicate') || updateErr.message?.includes('companies_slug_key')) {
        return err('DUPLICATE', `Slug "${fields.slug}" is already taken`, 409);
      }
      console.error('[update-company] Update failed:', updateErr.message);
      return serverError('Failed to update company');
    }

    console.log('[update-company] Updated: company=%s user=%s', id, userId);
    return ok(company);
  } catch (e) {
    console.error('[update-company] Unexpected error:', e);
    return serverError('Unexpected error');
  }
});
