// =============================================================================
// Work Orders — Edge Function: create-company
// =============================================================================
// Route:  POST /functions/v1/create-company
// Auth:   JWT required (proroto_admin only — RLS enforces)
// =============================================================================

import { handleCors } from '../_shared/cors.ts';
import { createUserClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { ok, err, unauthorized, serverError } from '../_shared/response.ts';
import { z, parseBody } from '../_shared/validation.ts';

const CreateCompanySchema = z.object({
  name: z.string().min(1, 'Company name is required').max(255).transform((v) => v.trim()),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')
    .transform((v) => v.trim().toLowerCase()),
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

  const parsed = await parseBody(req, CreateCompanySchema);
  if (!parsed.success) return err('VALIDATION_ERROR', parsed.message);

  const { name, slug } = parsed.data;

  try {
    const { data: company, error: insertErr } = await userClient
      .from('companies')
      .insert({ name, slug })
      .select()
      .single();

    if (insertErr) {
      if (insertErr.message?.includes('row-level security')) {
        return err('FORBIDDEN', 'Only Pro Roto admins can create companies', 403);
      }
      if (insertErr.message?.includes('duplicate') || insertErr.message?.includes('companies_slug_key')) {
        return err('DUPLICATE', `Slug "${slug}" is already taken`, 409);
      }
      console.error('[create-company] Insert failed:', insertErr.message);
      return serverError('Failed to create company');
    }

    console.log('[create-company] Created: company=%s slug=%s user=%s', company.id, slug, userId);
    return ok(company, 201);
  } catch (e) {
    console.error('[create-company] Unexpected error:', e);
    return serverError('Unexpected error');
  }
});
