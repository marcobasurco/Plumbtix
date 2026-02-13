// =============================================================================
// Work Orders — Edge Function Shared: CORS
// =============================================================================

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PATCH, DELETE',
};

/**
 * Handle OPTIONS preflight. Call at the top of every function:
 *   if (req.method === 'OPTIONS') return handleCors();
 */
export function handleCors(): Response {
  return new Response('ok', { headers: corsHeaders });
}
