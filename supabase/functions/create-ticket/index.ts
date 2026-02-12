// =============================================================================
// Work Orders — Edge Function: create-ticket
// =============================================================================
import { handleCors } from '../_shared/cors.ts';
import { createUserClient, createServiceClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { ok, err, unauthorized, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';

const ISSUE_TYPES = [
  'active_leak', 'sewer_backup', 'drain_clog', 'water_heater',
  'gas_smell', 'toilet_faucet_shower', 'other_plumbing',
] as const;

const SEVERITIES = ['emergency', 'urgent', 'standard'] as const;

const SEVERITY_RANK: Record<string, number> = {
  emergency: 0,
  urgent: 1,
  standard: 2,
};

const DEFAULT_SEVERITY: Record<string, string> = {
  active_leak: 'emergency',
  sewer_backup: 'emergency',
  gas_smell: 'emergency',
  water_heater: 'urgent',
  drain_clog: 'standard',
  toilet_faucet_shower: 'standard',
  other_plumbing: 'standard',
};

const EMERGENCY_KEYWORDS = [
  'leak', 'flood', 'flooding', 'water damage', 'burst', 'dripping',
  'sewage', 'sewer', 'backup', 'overflow', 'raw sewage',
  'gas', 'gas smell', 'rotten egg', 'gas leak',
];

const CreateTicketSchema = z.object({
  building_id: z.string().regex(UUID_REGEX, 'Invalid building_id'),
  space_id: z.string().regex(UUID_REGEX, 'Invalid space_id'),
  issue_type: z.enum(ISSUE_TYPES),
  severity: z.enum(SEVERITIES),
  description: z.string().min(1, 'Description is required').max(5000),
  access_instructions: z.string().max(2000).optional(),
  scheduling_preference: z.object({
    type: z.enum(['asap', 'preferred_window']),
    preferred_date: z.string().optional(),
    preferred_time: z.string().optional(),
  }).optional(),
});

Deno.serve(async (req: Request) => {
  console.log('[create-ticket] Handler invoked:', req.method);
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

  const parsed = await parseBody(req, CreateTicketSchema);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.message);
  }

  const {
    building_id,
    space_id,
    issue_type,
    severity: requestedSeverity,
    description,
    access_instructions,
    scheduling_preference,
  } = parsed.data;

  let finalSeverity = requestedSeverity;
  let severityEscalated = false;

  const defaultSev = DEFAULT_SEVERITY[issue_type] ?? 'standard';
  if (SEVERITY_RANK[defaultSev] < SEVERITY_RANK[finalSeverity]) {
    finalSeverity = defaultSev as typeof finalSeverity;
    severityEscalated = true;
  }

  if (description) {
    const lower = description.toLowerCase();
    const hasEmergencyKeyword = EMERGENCY_KEYWORDS.some((kw) => lower.includes(kw));
    if (hasEmergencyKeyword && SEVERITY_RANK['emergency'] < SEVERITY_RANK[finalSeverity]) {
      finalSeverity = 'emergency';
      severityEscalated = true;
    }
  }

  try {
    const { data: ticket, error: insertErr } = await userClient
      .from('tickets')
      .insert({
        building_id,
        space_id,
        created_by_user_id: userId,
        issue_type,
        severity: finalSeverity,
        status: 'new',
        description,
        access_instructions: access_instructions ?? null,
        scheduling_preference: scheduling_preference ?? null,
      })
      .select()
      .single();

    if (insertErr) {
      if (insertErr.message?.includes('row-level security')) {
        return err('FORBIDDEN', 'You do not have access to create a ticket for this building/space', 403);
      }
      if (insertErr.message?.includes('foreign key')) {
        return err('INVALID_REFERENCE', 'Invalid building or space', 400);
      }
      console.error('[create-ticket] Insert failed:', insertErr.message);
      return serverError('Failed to create ticket');
    }

    console.log('[create-ticket] Created: ticket=%s, number=%d', ticket.id, ticket.ticket_number);

    // Email notification — dynamic import so it never crashes the function
    try {
      const { notifyNewTicket } = await import('../_shared/notifications.ts');
      const svc = createServiceClient();
      const [buildingRes, spaceRes, creatorRes] = await Promise.all([
        svc.from('buildings').select('name, address_line1, city, state, company_id').eq('id', building_id).single(),
        svc.from('spaces').select('space_type, unit_number, common_area_type').eq('id', space_id).single(),
        svc.from('users').select('id, full_name, email').eq('id', userId).single(),
      ]);

      if (buildingRes.data && spaceRes.data && creatorRes.data) {
        notifyNewTicket(svc, {
          ticket_number: ticket.ticket_number,
          id: ticket.id,
          issue_type,
          severity: finalSeverity,
          status: 'new',
          description,
          assigned_technician: null,
          scheduled_date: null,
          scheduled_time_window: null,
          quote_amount: null,
          invoice_number: null,
          building: buildingRes.data,
          space: spaceRes.data,
          created_by: creatorRes.data,
        });
      }
    } catch (emailErr) {
      console.error('[create-ticket] Email error (non-blocking):', emailErr);
    }

    return ok({ ticket, severity_escalated: severityEscalated }, 201);
  } catch (e) {
    console.error('[create-ticket] Unexpected error:', e);
    return serverError('Unexpected error during ticket creation');
  }
});
