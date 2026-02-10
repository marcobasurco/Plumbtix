// =============================================================================
// Work Orders — Edge Function Shared: Notification Dispatcher
// =============================================================================
// High-level functions that resolve recipients, check preferences,
// build emails from templates, and fire them via Resend.
//
// All notification functions are fire-and-forget safe — they catch errors
// internally and log them. They never throw to avoid blocking edge functions.
//
// Usage:
//   import { notifyNewTicket, notifyStatusChange, notifyComment } from '../_shared/notifications.ts';
//   await notifyNewTicket(svc, ticketData);
// =============================================================================

import type { SupabaseClient } from './supabase.ts';
import { sendEmail, sendEmailBatch, type EmailPayload } from './email.ts';
import {
  newTicketEmail,
  statusChangeEmail,
  commentEmail,
  invitationEmail,
  residentClaimEmail,
  type NewTicketEmailData,
  type StatusChangeEmailData,
  type CommentEmailData,
  type InvitationEmailData,
  type ResidentClaimEmailData,
} from './email-templates.ts';

// ─── Pro Roto notification recipients ────────────────────────────────────────

function getProRotoEmails(): string[] {
  const override = Deno.env.get('PROROTO_NOTIFY_EMAILS');
  if (override) return override.split(',').map(e => e.trim()).filter(Boolean);
  return ['dispatch@proroto.com'];
}

function getProRotoEmergencyEmails(): string[] {
  const override = Deno.env.get('PROROTO_EMERGENCY_EMAILS');
  if (override) return override.split(',').map(e => e.trim()).filter(Boolean);
  return getProRotoEmails();
}

// ─── Recipient resolution helpers ────────────────────────────────────────────

interface TicketContext {
  ticket_number: number;
  id: string;
  issue_type: string;
  severity: string;
  status: string;
  description: string | null;
  assigned_technician: string | null;
  scheduled_date: string | null;
  scheduled_time_window: string | null;
  quote_amount: number | null;
  invoice_number: string | null;
  building: {
    name: string | null;
    address_line1: string;
    city: string;
    state: string;
    company_id: string;
  };
  space: {
    space_type: string;
    unit_number: string | null;
    common_area_type: string | null;
  };
  created_by: {
    full_name: string;
    email: string;
  };
}

/** Get all PM users (pm_admin + pm_user) for a company who want email notifications */
async function getCompanyPMEmails(
  svc: SupabaseClient,
  companyId: string,
): Promise<Array<{ email: string; full_name: string }>> {
  const { data, error } = await svc
    .from('users')
    .select('email, full_name')
    .eq('company_id', companyId)
    .in('role', ['pm_admin', 'pm_user']);

  if (error) {
    console.error('[notifications] Failed to fetch PM emails:', error.message);
    return [];
  }
  return data ?? [];
}

/** Get the ticket creator's email */
async function getTicketCreator(
  svc: SupabaseClient,
  userId: string,
): Promise<{ email: string; full_name: string } | null> {
  const { data, error } = await svc
    .from('users')
    .select('email, full_name')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[notifications] Failed to fetch ticket creator:', error.message);
    return null;
  }
  return data;
}

function spaceLabel(space: TicketContext['space']): string {
  if (space.space_type === 'unit' && space.unit_number) return `Unit ${space.unit_number}`;
  if (space.common_area_type) {
    return space.common_area_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  return 'Common Area';
}

// =============================================================================
// Notification: New Ticket Created
// =============================================================================

export async function notifyNewTicket(
  svc: SupabaseClient,
  ticket: TicketContext,
): Promise<void> {
  try {
    const buildingName = ticket.building.name || ticket.building.address_line1;
    const address = `${ticket.building.address_line1}, ${ticket.building.city}, ${ticket.building.state}`;

    // Get company name
    const { data: company } = await svc
      .from('companies')
      .select('name')
      .eq('id', ticket.building.company_id)
      .single();

    const emailData: NewTicketEmailData = {
      ticketNumber: ticket.ticket_number,
      ticketId: ticket.id,
      issueType: ticket.issue_type,
      severity: ticket.severity,
      description: ticket.description || '',
      buildingName,
      buildingAddress: address,
      unitNumber: spaceLabel(ticket.space),
      createdByName: ticket.created_by.full_name,
      companyName: company?.name || 'Unknown',
    };

    const { subject, html } = newTicketEmail(emailData);

    // Send to Pro Roto
    const recipients = ticket.severity === 'emergency'
      ? getProRotoEmergencyEmails()
      : getProRotoEmails();

    await sendEmail({
      to: recipients,
      subject,
      html,
      tags: [
        { name: 'type', value: 'new_ticket' },
        { name: 'ticket_id', value: ticket.id },
        { name: 'severity', value: ticket.severity },
      ],
    });

    console.log('[notifications] New ticket email sent for #%d to %d recipients',
      ticket.ticket_number, recipients.length);
  } catch (e) {
    console.error('[notifications] notifyNewTicket error:', e);
  }
}

// =============================================================================
// Notification: Ticket Status Changed
// =============================================================================

export async function notifyStatusChange(
  svc: SupabaseClient,
  ticket: TicketContext,
  oldStatus: string,
  newStatus: string,
  updatedByRole: string,
): Promise<void> {
  try {
    const buildingName = ticket.building.name || ticket.building.address_line1;
    const unit = spaceLabel(ticket.space);

    const baseData: Omit<StatusChangeEmailData, 'recipientName'> = {
      ticketNumber: ticket.ticket_number,
      ticketId: ticket.id,
      issueType: ticket.issue_type,
      severity: ticket.severity,
      buildingName,
      unitNumber: unit,
      oldStatus,
      newStatus,
      details: {
        technician: ticket.assigned_technician || undefined,
        scheduledDate: ticket.scheduled_date || undefined,
        timeWindow: ticket.scheduled_time_window || undefined,
        quoteAmount: ticket.quote_amount || undefined,
        invoiceNumber: ticket.invoice_number || undefined,
      },
    };

    const emails: EmailPayload[] = [];

    // Determine who to notify based on who made the change
    if (updatedByRole === 'proroto_admin') {
      // Pro Roto updated → notify PM company + ticket creator
      const pmUsers = await getCompanyPMEmails(svc, ticket.building.company_id);

      for (const pm of pmUsers) {
        const { subject, html } = statusChangeEmail({ ...baseData, recipientName: pm.full_name });
        emails.push({
          to: pm.email,
          subject,
          html,
          tags: [
            { name: 'type', value: 'status_change' },
            { name: 'ticket_id', value: ticket.id },
            { name: 'new_status', value: newStatus },
          ],
        });
      }
    } else {
      // PM / resident updated → notify Pro Roto
      const { subject, html } = statusChangeEmail({ ...baseData, recipientName: 'Pro Roto' });
      emails.push({
        to: getProRotoEmails(),
        subject,
        html,
        tags: [
          { name: 'type', value: 'status_change' },
          { name: 'ticket_id', value: ticket.id },
          { name: 'new_status', value: newStatus },
        ],
      });
    }

    if (emails.length > 0) {
      if (emails.length === 1) {
        await sendEmail(emails[0]);
      } else {
        await sendEmailBatch(emails);
      }
    }

    console.log('[notifications] Status change email sent for #%d (%s→%s) to %d recipients',
      ticket.ticket_number, oldStatus, newStatus, emails.length);
  } catch (e) {
    console.error('[notifications] notifyStatusChange error:', e);
  }
}

// =============================================================================
// Notification: New Comment
// =============================================================================

export async function notifyComment(
  svc: SupabaseClient,
  data: {
    ticketId: string;
    ticketNumber: number;
    buildingName: string;
    companyId: string;
    authorName: string;
    authorRole: string;
    authorEmail: string;
    commentText: string;
    isInternal: boolean;
  },
): Promise<void> {
  try {
    const emails: EmailPayload[] = [];

    if (data.isInternal) {
      // Internal notes → only Pro Roto staff (exclude the author)
      const recipients = getProRotoEmails().filter(e => e !== data.authorEmail);
      if (recipients.length > 0) {
        const { subject, html } = commentEmail({
          ticketNumber: data.ticketNumber,
          ticketId: data.ticketId,
          buildingName: data.buildingName,
          authorName: data.authorName,
          authorRole: data.authorRole,
          commentText: data.commentText,
          recipientName: 'Team',
          isInternal: true,
        });
        emails.push({ to: recipients, subject, html,
          tags: [{ name: 'type', value: 'comment_internal' }, { name: 'ticket_id', value: data.ticketId }],
        });
      }
    } else {
      // Public comment → notify the other side
      if (data.authorRole === 'proroto_admin') {
        // Pro Roto commented → notify PMs
        const pmUsers = await getCompanyPMEmails(svc, data.companyId);
        for (const pm of pmUsers) {
          const { subject, html } = commentEmail({
            ticketNumber: data.ticketNumber,
            ticketId: data.ticketId,
            buildingName: data.buildingName,
            authorName: data.authorName,
            authorRole: 'Pro Roto',
            commentText: data.commentText,
            recipientName: pm.full_name,
            isInternal: false,
          });
          emails.push({ to: pm.email, subject, html,
            tags: [{ name: 'type', value: 'comment' }, { name: 'ticket_id', value: data.ticketId }],
          });
        }
      } else {
        // PM/resident commented → notify Pro Roto
        const { subject, html } = commentEmail({
          ticketNumber: data.ticketNumber,
          ticketId: data.ticketId,
          buildingName: data.buildingName,
          authorName: data.authorName,
          authorRole: data.authorRole === 'pm_admin' ? 'Property Manager' : 'Resident',
          commentText: data.commentText,
          recipientName: 'Pro Roto',
          isInternal: false,
        });
        emails.push({ to: getProRotoEmails(), subject, html,
          tags: [{ name: 'type', value: 'comment' }, { name: 'ticket_id', value: data.ticketId }],
        });
      }
    }

    if (emails.length === 1) {
      await sendEmail(emails[0]);
    } else if (emails.length > 1) {
      await sendEmailBatch(emails);
    }

    console.log('[notifications] Comment email sent for ticket #%d, %d recipients',
      data.ticketNumber, emails.length);
  } catch (e) {
    console.error('[notifications] notifyComment error:', e);
  }
}

// =============================================================================
// Notification: Invitation Sent
// =============================================================================

export async function notifyInvitation(data: InvitationEmailData): Promise<void> {
  try {
    const { subject, html } = invitationEmail(data);
    await sendEmail({
      to: data.recipientEmail,
      subject,
      html,
      tags: [{ name: 'type', value: 'invitation' }],
    });
    console.log('[notifications] Invitation email sent to %s', data.recipientEmail);
  } catch (e) {
    console.error('[notifications] notifyInvitation error:', e);
  }
}

// =============================================================================
// Notification: Resident Claim Link
// =============================================================================

export async function notifyResidentClaim(data: ResidentClaimEmailData): Promise<void> {
  try {
    const { subject, html } = residentClaimEmail(data);
    await sendEmail({
      to: data.occupantEmail,
      subject,
      html,
      tags: [{ name: 'type', value: 'resident_claim' }],
    });
    console.log('[notifications] Resident claim email sent to %s', data.occupantEmail);
  } catch (e) {
    console.error('[notifications] notifyResidentClaim error:', e);
  }
}
