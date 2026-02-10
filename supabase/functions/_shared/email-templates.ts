// =============================================================================
// PlumbTix — Edge Function Shared: Email Templates
// =============================================================================
// Pure HTML email templates — no external dependencies.
// All templates are mobile-responsive and client-safe (inline styles only).
//
// Design:
//   - Pro Roto blue (#2563eb) primary brand color
//   - Clean white cards on light gray background
//   - Large CTA buttons with 44px+ touch targets
//   - Preheader text for email client previews
// =============================================================================

const BRAND_COLOR = '#2563eb';
const BRAND_COLOR_DARK = '#1d4ed8';
const TEXT_COLOR = '#1f2937';
const MUTED_COLOR = '#6b7280';
const BORDER_COLOR = '#e5e7eb';
const BG_COLOR = '#f9fafb';

function getAppUrl(): string {
  return Deno.env.get('APP_URL') || 'https://app.plumbtix.com';
}

// ─── Base layout ─────────────────────────────────────────────────────────────

function layout(opts: {
  preheader: string;
  title: string;
  body: string;
  ctaUrl?: string;
  ctaLabel?: string;
  footer?: string;
}): string {
  const cta = opts.ctaUrl
    ? `<tr><td style="padding:24px 0 0">
        <a href="${opts.ctaUrl}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;font-size:16px;font-weight:600;padding:14px 28px;border-radius:8px;text-decoration:none;min-width:200px;text-align:center">${opts.ctaLabel || 'View in PlumbTix'}</a>
       </td></tr>`
    : '';

  const footerHtml = opts.footer
    ? `<tr><td style="padding:16px 0 0;font-size:13px;color:${MUTED_COLOR};line-height:1.5">${opts.footer}</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${opts.title}</title>
<style>body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table{border-spacing:0}td{padding:0}img{border:0;display:block}a{color:${BRAND_COLOR}}</style>
</head>
<body style="margin:0;padding:0;background:${BG_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<!-- Preheader (hidden but shows in email preview) -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${opts.preheader}${'‌'.repeat(80)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG_COLOR}">
<tr><td align="center" style="padding:32px 16px">

<!-- Container -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid ${BORDER_COLOR};overflow:hidden">

<!-- Header bar -->
<tr><td style="background:${BRAND_COLOR};padding:20px 28px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.3px">🔧 PlumbTix</td>
      <td align="right" style="color:rgba(255,255,255,0.7);font-size:12px">Pro Roto Inc.</td>
    </tr>
  </table>
</td></tr>

<!-- Body -->
<tr><td style="padding:28px;color:${TEXT_COLOR};font-size:15px;line-height:1.6">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="font-size:20px;font-weight:700;color:${TEXT_COLOR};padding-bottom:16px">${opts.title}</td></tr>
    <tr><td style="font-size:15px;line-height:1.6;color:${TEXT_COLOR}">${opts.body}</td></tr>
    ${cta}
    ${footerHtml}
  </table>
</td></tr>

<!-- Footer -->
<tr><td style="padding:20px 28px;background:${BG_COLOR};border-top:1px solid ${BORDER_COLOR}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="font-size:12px;color:${MUTED_COLOR};line-height:1.5">
        Sent by <a href="https://www.proroto.com" style="color:${BRAND_COLOR};text-decoration:none;font-weight:600">Pro Roto Inc.</a> via PlumbTix<br>
        CA License #947961 · Redwood City, CA
      </td>
    </tr>
  </table>
</td></tr>

</table><!-- /Container -->

</td></tr>
</table>
</body>
</html>`;
}

// ─── Detail row helper ───────────────────────────────────────────────────────

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:${MUTED_COLOR};font-weight:600;vertical-align:top;width:140px">${label}</td>
    <td style="padding:6px 0;font-size:14px;color:${TEXT_COLOR}">${value}</td>
  </tr>`;
}

function detailTable(rows: Array<[string, string]>): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;border-top:1px solid ${BORDER_COLOR};border-bottom:1px solid ${BORDER_COLOR};padding:8px 0">
    ${rows.map(([l, v]) => detailRow(l, v)).join('')}
  </table>`;
}

function severityBadge(severity: string): string {
  const colors: Record<string, { bg: string; text: string }> = {
    emergency: { bg: '#fef2f2', text: '#991b1b' },
    urgent: { bg: '#fffbeb', text: '#92400e' },
    standard: { bg: '#f0f9ff', text: '#1e40af' },
  };
  const c = colors[severity] || colors.standard;
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700;text-transform:uppercase;background:${c.bg};color:${c.text}">${severity}</span>`;
}

function statusBadge(status: string): string {
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;background:#eff6ff;color:${BRAND_COLOR}">${label}</span>`;
}

// =============================================================================
// Template: User Invitation
// =============================================================================

export interface InvitationEmailData {
  recipientName: string;
  recipientEmail: string;
  companyName: string;
  role: string;
  invitedByName: string;
  token: string;
}

export function invitationEmail(data: InvitationEmailData): { subject: string; html: string } {
  const acceptUrl = `${getAppUrl()}/accept-invite?token=${data.token}`;
  return {
    subject: `You're invited to join ${data.companyName} on PlumbTix`,
    html: layout({
      preheader: `${data.invitedByName} invited you to manage work orders on PlumbTix`,
      title: 'You\'re Invited!',
      body: `
        <p style="margin:0 0 12px">Hi ${data.recipientName},</p>
        <p style="margin:0 0 16px">${data.invitedByName} has invited you to join <strong>${data.companyName}</strong> on PlumbTix as a <strong>${data.role}</strong>.</p>
        <p style="margin:0 0 4px">PlumbTix is where ${data.companyName} manages plumbing work orders, tracks maintenance requests, and coordinates with Pro Roto Inc.</p>
      `,
      ctaUrl: acceptUrl,
      ctaLabel: 'Accept Invitation',
      footer: `This invitation expires in 7 days. If you weren't expecting this, you can safely ignore it.`,
    }),
  };
}

// =============================================================================
// Template: Resident Claim (Occupant Onboarding)
// =============================================================================

export interface ResidentClaimEmailData {
  occupantName: string;
  occupantEmail: string;
  buildingName: string;
  unitNumber: string;
  inviteToken: string;
}

export function residentClaimEmail(data: ResidentClaimEmailData): { subject: string; html: string } {
  const claimUrl = `${getAppUrl()}/claim?token=${data.inviteToken}`;
  return {
    subject: `Set up your PlumbTix account for ${data.buildingName}`,
    html: layout({
      preheader: `Submit maintenance requests online for ${data.buildingName} Unit ${data.unitNumber}`,
      title: 'Welcome to PlumbTix!',
      body: `
        <p style="margin:0 0 12px">Hi ${data.occupantName},</p>
        <p style="margin:0 0 16px">Your property manager has set up online maintenance requests for <strong>${data.buildingName}</strong>.</p>
        ${detailTable([
          ['Building', data.buildingName],
          ['Unit', data.unitNumber],
        ])}
        <p style="margin:0 0 4px">Click below to create your account. You'll be able to submit work orders, upload photos, and track the status of your requests — all from your phone.</p>
      `,
      ctaUrl: claimUrl,
      ctaLabel: 'Set Up My Account',
      footer: 'If you didn\'t expect this email, you can safely ignore it.',
    }),
  };
}

// =============================================================================
// Template: New Ticket Created (→ Pro Roto)
// =============================================================================

export interface NewTicketEmailData {
  ticketNumber: number;
  ticketId: string;
  issueType: string;
  severity: string;
  description: string;
  buildingName: string;
  buildingAddress: string;
  unitNumber: string;
  createdByName: string;
  companyName: string;
}

export function newTicketEmail(data: NewTicketEmailData): { subject: string; html: string } {
  const isEmergency = data.severity === 'emergency';
  const prefix = isEmergency ? '🚨 EMERGENCY: ' : '';
  const ticketUrl = `${getAppUrl()}/admin/tickets/${data.ticketId}`;
  const issueLabel = data.issueType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return {
    subject: `${prefix}New Ticket #${data.ticketNumber} — ${issueLabel} at ${data.buildingName}`,
    html: layout({
      preheader: `${data.createdByName} submitted a ${data.severity} ${issueLabel} request for ${data.buildingName}`,
      title: `${isEmergency ? '🚨 ' : ''}New Work Order #${data.ticketNumber}`,
      body: `
        <p style="margin:0 0 16px">A new ticket has been submitted and needs your attention.</p>
        ${detailTable([
          ['Ticket', `#${data.ticketNumber}`],
          ['Issue Type', issueLabel],
          ['Severity', severityBadge(data.severity)],
          ['Building', data.buildingName],
          ['Address', data.buildingAddress],
          ['Unit / Space', data.unitNumber],
          ['Submitted By', data.createdByName],
          ['Company', data.companyName],
        ])}
        ${data.description ? `<div style="margin:16px 0;padding:12px 16px;background:${BG_COLOR};border-radius:8px;border-left:3px solid ${BRAND_COLOR};font-size:14px;line-height:1.5;color:${TEXT_COLOR}">${escapeHtml(data.description)}</div>` : ''}
      `,
      ctaUrl: ticketUrl,
      ctaLabel: isEmergency ? 'View Emergency Ticket' : 'View Ticket',
    }),
  };
}

// =============================================================================
// Template: Ticket Status Changed (→ PM / Resident)
// =============================================================================

export interface StatusChangeEmailData {
  ticketNumber: number;
  ticketId: string;
  issueType: string;
  severity: string;
  buildingName: string;
  unitNumber: string;
  oldStatus: string;
  newStatus: string;
  /** Who the email is going to */
  recipientName: string;
  /** Extra context depending on transition */
  details?: {
    technician?: string;
    scheduledDate?: string;
    timeWindow?: string;
    quoteAmount?: number;
    invoiceNumber?: string;
  };
}

export function statusChangeEmail(data: StatusChangeEmailData): { subject: string; html: string } {
  const newLabel = data.newStatus.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const issueLabel = data.issueType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const basePath = data.recipientName === 'Pro Roto' ? '/admin' : '/dashboard';
  const ticketUrl = `${getAppUrl()}${basePath}/tickets/${data.ticketId}`;

  // Build status-specific message
  let message = '';
  const d = data.details || {};

  switch (data.newStatus) {
    case 'scheduled':
      message = `Your work order has been scheduled.`;
      if (d.technician) message += ` <strong>${d.technician}</strong> will handle this job.`;
      if (d.scheduledDate) message += ` Date: <strong>${d.scheduledDate}</strong>.`;
      if (d.timeWindow) message += ` Time: <strong>${d.timeWindow}</strong>.`;
      break;
    case 'dispatched':
      message = `A technician has been dispatched to ${data.buildingName}.`;
      if (d.technician) message += ` <strong>${d.technician}</strong> is on the way.`;
      break;
    case 'on_site':
      message = `The technician has arrived at ${data.buildingName}.`;
      break;
    case 'in_progress':
      message = 'Work is now in progress on your request.';
      break;
    case 'waiting_approval':
      message = `Pro Roto has completed their assessment and is requesting approval to proceed.`;
      if (d.quoteAmount) message += ` Estimated cost: <strong>$${d.quoteAmount.toFixed(2)}</strong>.`;
      message += ' Please review and approve or decline.';
      break;
    case 'completed':
      message = 'The work has been completed. Please review and let us know if you have any questions.';
      break;
    case 'invoiced':
      message = 'An invoice has been generated for this work order.';
      if (d.invoiceNumber) message += ` Invoice #: <strong>${d.invoiceNumber}</strong>.`;
      break;
    case 'cancelled':
      message = 'This work order has been cancelled.';
      break;
    case 'needs_info':
      message = 'Additional information is needed before we can proceed. Please check the ticket for details.';
      break;
    default:
      message = `The status has been updated to ${newLabel}.`;
  }

  const isApprovalNeeded = data.newStatus === 'waiting_approval';

  return {
    subject: `Ticket #${data.ticketNumber} — ${newLabel}${isApprovalNeeded ? ' — Approval Required' : ''}`,
    html: layout({
      preheader: `${issueLabel} at ${data.buildingName} is now ${newLabel}`,
      title: `Ticket #${data.ticketNumber} Update`,
      body: `
        <p style="margin:0 0 12px">Hi ${data.recipientName},</p>
        <p style="margin:0 0 16px">${message}</p>
        ${detailTable([
          ['Ticket', `#${data.ticketNumber}`],
          ['Status', statusBadge(data.newStatus)],
          ['Issue', issueLabel],
          ['Building', data.buildingName],
          ['Unit / Space', data.unitNumber],
        ])}
      `,
      ctaUrl: ticketUrl,
      ctaLabel: isApprovalNeeded ? 'Review & Approve' : 'View Ticket',
    }),
  };
}

// =============================================================================
// Template: New Comment (→ ticket participants)
// =============================================================================

export interface CommentEmailData {
  ticketNumber: number;
  ticketId: string;
  buildingName: string;
  authorName: string;
  authorRole: string;
  commentText: string;
  recipientName: string;
  isInternal: boolean;
}

export function commentEmail(data: CommentEmailData): { subject: string; html: string } {
  const basePath = data.isInternal ? '/admin' : '/dashboard';
  const ticketUrl = `${getAppUrl()}${basePath}/tickets/${data.ticketId}`;

  return {
    subject: `New comment on Ticket #${data.ticketNumber} — ${data.buildingName}`,
    html: layout({
      preheader: `${data.authorName} commented: "${data.commentText.slice(0, 80)}${data.commentText.length > 80 ? '...' : ''}"`,
      title: `New Comment on #${data.ticketNumber}`,
      body: `
        <p style="margin:0 0 12px">Hi ${data.recipientName},</p>
        <p style="margin:0 0 16px"><strong>${data.authorName}</strong> (${data.authorRole}) left a comment on ticket #${data.ticketNumber}:</p>
        <div style="margin:16px 0;padding:12px 16px;background:${data.isInternal ? '#fffbeb' : BG_COLOR};border-radius:8px;border-left:3px solid ${data.isInternal ? '#f59e0b' : BRAND_COLOR};font-size:14px;line-height:1.5;color:${TEXT_COLOR};white-space:pre-wrap">${escapeHtml(data.commentText)}</div>
        ${data.isInternal ? `<p style="margin:0 0 4px;font-size:12px;color:#92400e;font-weight:600">⚠️ Internal Note — visible only to Pro Roto staff</p>` : ''}
      `,
      ctaUrl: ticketUrl,
      ctaLabel: 'View & Reply',
    }),
  };
}

// =============================================================================
// Template: Password Reset
// =============================================================================

export interface PasswordResetEmailData {
  recipientName: string;
  resetUrl: string;
}

export function passwordResetEmail(data: PasswordResetEmailData): { subject: string; html: string } {
  return {
    subject: 'Reset your PlumbTix password',
    html: layout({
      preheader: 'Click the link to reset your PlumbTix password',
      title: 'Password Reset',
      body: `
        <p style="margin:0 0 12px">Hi ${data.recipientName},</p>
        <p style="margin:0 0 16px">We received a request to reset your password. Click the button below to choose a new password.</p>
      `,
      ctaUrl: data.resetUrl,
      ctaLabel: 'Reset Password',
      footer: 'This link expires in 1 hour. If you didn\'t request a password reset, you can safely ignore this email.',
    }),
  };
}

// =============================================================================
// Utility
// =============================================================================

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}
