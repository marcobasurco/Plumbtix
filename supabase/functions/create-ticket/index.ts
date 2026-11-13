// =============================================================================
// Work Orders — Edge Function: create-ticket
// =============================================================================
import { handleCors } from '../_shared/cors.ts';
import { createUserClient, createServiceClient, getAuthenticatedUserId } from '../_shared/supabase.ts';
import { ok, err, unauthorized, serverError } from '../_shared/response.ts';
import { z, parseBody, UUID_REGEX } from '../_shared/validation.ts';
import { runInBackground } from '../_shared/background.ts';

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

// MUST match shared/types/transitions.ts (EMERGENCY_KEYWORDS + detectEmergencyKeywords).
const EMERGENCY_KEYWORDS = [
  // Whole words / phrases only, and only wording that means "this cannot
  // wait" on its own. Ordinary words (leak, dripping, backup, gas, sewer,
  // overflow) are NOT here: a "dripping faucet" or a "gasket" must not page
  // the on-call person at night. The reporter's own urgency choice and the
  // problem type (active leak, sewer backup, gas smell) still set Emergency.
  'flood', 'flooded', 'flooding', 'burst', 'bursting', 'gushing', 'sewage',
  'gas leak', 'gas smell', 'smell gas', 'smell of gas', 'smells like gas', 'rotten egg', 'rotten eggs',
  'overflowing', 'water damage',
];

const CreateTicketSchema = z.object({
  building_id: z.string().regex(UUID_REGEX, 'Invalid building_id'),
  space_id: z.string().regex(UUID_REGEX, 'Invalid space_id'),
  issue_type: z.enum(ISSUE_TYPES),
  severity: z.enum(SEVERITIES),
  description: z.string().min(1, 'Description is required').max(5000),
  access_instructions: z.string().max(2000).optional(),
  /** Where exactly, when the space is the building's "Other / not listed" catch-all (00029) */
  location_note: z.string().trim().min(1).max(300).optional(),
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
  } catch (authError) {
    const msg = authError instanceof Error ? authError.message : 'Unknown auth error';
    console.error('[create-ticket] Auth failed:', msg);
    return unauthorized(msg);
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
    location_note,
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
    const hasEmergencyKeyword = EMERGENCY_KEYWORDS.some((kw) => new RegExp(`(^|[^a-z])${kw}([^a-z]|$)`).test(lower));
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
        location_note: location_note ?? null,
        scheduling_preference: scheduling_preference ?? null,
      })
      .select()
      .single();

    if (insertErr) {
      if (insertErr.message?.includes('row-level security')) {
        return err('FORBIDDEN', 'You do not have access to report a problem for this building or location', 403);
      }
      if (insertErr.message?.includes('foreign key')) {
        return err('INVALID_REFERENCE', 'Invalid building or space', 400);
      }
      console.error('[create-ticket] Insert failed:', insertErr.message);
      return serverError('Could not create the work order');
    }

    console.log('[create-ticket] Created: ticket=%s, number=%d', ticket.id, ticket.ticket_number);

    // Email + SMS notifications. Kept alive after the response is sent via
    // EdgeRuntime.waitUntil — an emergency alert must not die with the isolate.
    runInBackground((async () => {
      try {
        const { notifyNewTicket } = await import('../_shared/notifications.ts');
        const svc = createServiceClient();
        const [buildingRes, spaceRes, creatorRes] = await Promise.all([
          svc.from('buildings').select('name, address_line1, city, state, company_id').eq('id', building_id).single(),
          svc.from('spaces').select('space_type, unit_number, common_area_type, label').eq('id', space_id).single(),
          svc.from('users').select('id, full_name, email').eq('id', userId).single(),
        ]);

        if (buildingRes.data && spaceRes.data && creatorRes.data) {
          await notifyNewTicket(svc, {
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
            location_note: location_note ?? null,
            created_by: creatorRes.data,
          });
        }
      } catch (emailErr) {
        console.error('[create-ticket] Email error (non-blocking):', emailErr);
      }
    })());

    return ok({ ticket, severity_escalated: severityEscalated }, 201);
  } catch (e) {
    console.error('[create-ticket] Unexpected error:', e);
    return serverError('Unexpected error while creating the work order');
  }
});
