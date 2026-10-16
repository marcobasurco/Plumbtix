// =============================================================================
// Work Orders — Edge Function Shared: Email Templates
// =============================================================================
// Pure HTML email templates — no external dependencies.
// All templates are mobile-responsive and client-safe (inline styles only).
//
// Design:
//   - Pro Roto blue (#2563eb) primary brand color
//   - Clean white cards on light gray background
//   - Large CTA buttons with 44px+ touch targets
//   - Preheader text for email client previews
//
// Security: every value that originates from a user (names, company and
// building names, comment text, technician names, invoice numbers, …) is
// HTML-escaped before it is placed in the markup. A comment such as
// `</div><a href="…">Reset your password</a>` must arrive as text, not as a
// live link in a PM's inbox. Only template-owned markup is unescaped.
// =============================================================================

const BRAND_COLOR = '#2563eb';
const TEXT_COLOR = '#1f2937';
const MUTED_COLOR = '#6b7280';
const BORDER_COLOR = '#e5e7eb';
const BG_COLOR = '#f9fafb';

function getAppUrl(): string {
  return Deno.env.get('APP_URL') || 'https://workorders.proroto.com';
}

// ─── Escaping ────────────────────────────────────────────────────────────────

/** Escape a plain-text value for use inside HTML text content or attributes. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape multi-line user text and keep its line breaks. */
function escMultiline(value: unknown): string {
  return esc(value).replace(/\n/g, '<br>');
}

/** "sewer_backup" → "Sewer Backup" (enum values only; still escaped). */
function humanize(value: string): string {
  return esc(value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
}

// ─── Base layout ─────────────────────────────────────────────────────────────

function layout(opts: {
  /** Plain text — escaped here */
  preheader: string;
  /** Plain text — escaped here */
  title: string;
  /** Trusted HTML built by a template below; dynamic values already escaped */
  body: string;
  ctaUrl?: string;
  ctaLabel?: string;
  /** Plain text — escaped here */
  footer?: string;
}): string {
  const cta = opts.ctaUrl
    ? `<tr><td style="padding:24px 0 0">
        <a href="${esc(opts.ctaUrl)}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;font-size:16px;font-weight:600;padding:14px 28px;border-radius:8px;text-decoration:none;min-width:200px;text-align:center">${esc(opts.ctaLabel || 'View in Work Orders')}</a>
       </td></tr>`
    : '';

  const footerHtml = opts.footer
    ? `<tr><td style="padding:16px 0 0;font-size:13px;color:${MUTED_COLOR};line-height:1.5">${esc(opts.footer)}</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(opts.title)}</title>
<style>body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table{border-spacing:0}td{padding:0}img{border:0;display:block}a{color:${BRAND_COLOR}}</style>
</head>
<body style="margin:0;padding:0;background:${BG_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<!-- Preheader (hidden but shows in email preview) -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${esc(opts.preheader)}${'‌'.repeat(80)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG_COLOR}">
<tr><td align="center" style="padding:32px 16px">

<!-- Container -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid ${BORDER_COLOR};overflow:hidden">

<!-- Header bar -->
<tr><td style="background:${BRAND_COLOR};padding:20px 28px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.3px">🔧 Work Orders</td>
      <td align="right" style="color:rgba(255,255,255,0.7);font-size:12px">Pro Roto Inc.</td>
    </tr>
  </table>
</td></tr>

<!-- Body -->
<tr><td style="padding:28px;color:${TEXT_COLOR};font-size:15px;line-height:1.6">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="font-size:20px;font-weight:700;color:${TEXT_COLOR};padding-bottom:16px">${esc(opts.title)}</td></tr>
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
        Sent by <a href="https://proroto.com" style="color:${BRAND_COLOR};text-decoration:none;font-weight:600">Pro Roto Inc.</a> via Work Orders<br>
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
// `value` is HTML (already escaped by the caller, or a badge built here).

function detailRow(label: string, valueHtml: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:${MUTED_COLOR};font-weight:600;vertical-align:top;width:140px">${esc(label)}</td>
    <td style="padding:6px 0;font-size:14px;color:${TEXT_COLOR}">${valueHtml}</td>
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
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700;text-transform:uppercase;background:${c.bg};color:${c.text}">${esc(severity)}</span>`;
}

function statusBadge(status: string): string {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;background:#eff6ff;color:${BRAND_COLOR}">${humanize(status)}</span>`;
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
  const acceptUrl = `${getAppUrl()}/accept-invite?token=${encodeURIComponent(data.token)}`;
  return {
    subject: `You're invited to join ${data.companyName} on Pro Roto Work Orders`,
    html: layout({
      preheader: `${data.invitedByName} invited you to manage maintenance requests with Pro Roto`,
      title: 'You\'re Invited!',
      body: `
        <p style="margin:0 0 12px">Hi ${esc(data.recipientName)},</p>
        <p style="margin:0 0 16px">${esc(data.invitedByName)} has invited you to join <strong>${esc(data.companyName)}</strong> on the Pro Roto Work Orders portal. Your role: <strong>${esc(data.role)}</strong>.</p>
        <p style="margin:0 0 4px">This is where ${esc(data.companyName)} manages plumbing work orders, tracks maintenance requests, and coordinates with Pro Roto Inc.</p>
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
  const claimUrl = `${getAppUrl()}/claim?token=${encodeURIComponent(data.inviteToken)}`;
  return {
    subject: `Set up your Work Orders account for ${data.buildingName}`,
    html: layout({
      preheader: `Submit maintenance requests online for ${data.buildingName} Unit ${data.unitNumber}`,
      title: 'Welcome to Work Orders!',
      body: `
        <p style="margin:0 0 12px">Hi ${esc(data.occupantName)},</p>
        <p style="margin:0 0 16px">Your property manager has set up online maintenance requests for <strong>${esc(data.buildingName)}</strong>.</p>
        ${detailTable([
          ['Building', esc(data.buildingName)],
          ['Unit', esc(data.unitNumber)],
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
  const ticketUrl = `${getAppUrl()}/admin/tickets/${encodeURIComponent(data.ticketId)}`;
  const issueLabelText = data.issueType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    subject: `${prefix}New work order #${data.ticketNumber} — ${issueLabelText} at ${data.buildingName}`,
    html: layout({
      preheader: `${data.createdByName} submitted a ${data.severity} ${issueLabelText} request for ${data.buildingName}`,
      title: `${isEmergency ? '🚨 ' : ''}New Work Order #${data.ticketNumber}`,
      body: `
        <p style="margin:0 0 16px">A new work order has been submitted and needs your attention.</p>
        ${detailTable([
          ['Ticket', `#${esc(data.ticketNumber)}`],
          ['Issue Type', esc(issueLabelText)],
          ['Severity', severityBadge(data.severity)],
          ['Building', esc(data.buildingName)],
          ['Address', esc(data.buildingAddress)],
          ['Unit / Space', esc(data.unitNumber)],
          ['Submitted By', esc(data.createdByName)],
          ['Company', esc(data.companyName)],
        ])}
        ${data.description ? `<div style="margin:16px 0;padding:12px 16px;background:${BG_COLOR};border-radius:8px;border-left:3px solid ${BRAND_COLOR};font-size:14px;line-height:1.5;color:${TEXT_COLOR}">${escMultiline(data.description)}</div>` : ''}
      `,
      ctaUrl: ticketUrl,
      ctaLabel: isEmergency ? 'View emergency work order' : 'View work order',
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
  const newLabelText = data.newStatus.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const issueLabelText = data.issueType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const basePath = data.recipientName === 'Pro Roto' ? '/admin' : '/dashboard';
  const ticketUrl = `${getAppUrl()}${basePath}/tickets/${encodeURIComponent(data.ticketId)}`;

  // Build status-specific message (HTML; dynamic values escaped)
  let message = '';
  const d = data.details || {};

  switch (data.newStatus) {
    case 'scheduled':
      message = `Your work order has been scheduled.`;
      if (d.technician) message += ` <strong>${esc(d.technician)}</strong> will handle this job.`;
      if (d.scheduledDate) message += ` Date: <strong>${esc(d.scheduledDate)}</strong>.`;
      if (d.timeWindow) message += ` Time: <strong>${esc(d.timeWindow)}</strong>.`;
      break;
    case 'dispatched':
      message = `A technician has been dispatched to ${esc(data.buildingName)}.`;
      if (d.technician) message += ` <strong>${esc(d.technician)}</strong> is on the way.`;
      break;
    case 'on_site':
      message = `The technician has arrived at ${esc(data.buildingName)}.`;
      break;
    case 'in_progress':
      message = 'Work is now in progress on your request.';
      break;
    case 'waiting_approval':
      message = `Pro Roto has completed their assessment and needs your approval to proceed.`;
      if (d.quoteAmount) message += ` Estimated cost: <strong>$${esc(d.quoteAmount.toFixed(2))}</strong>.`;
      message += ' Pro Roto will call you to confirm — or call us if you have questions.';
      break;
    case 'completed':
      message = 'The work has been completed. Please review and let us know if you have any questions.';
      break;
    case 'invoiced':
      message = 'An invoice has been generated for this work order.';
      if (d.invoiceNumber) message += ` Invoice #: <strong>${esc(d.invoiceNumber)}</strong>.`;
      break;
    case 'cancelled':
      message = 'This work order has been cancelled.';
      break;
    case 'needs_info':
      message = 'Additional information is needed before we can proceed. Please check the work order for details.';
      break;
    default:
      message = `The status has been updated to ${esc(newLabelText)}.`;
  }

  const isApprovalNeeded = data.newStatus === 'waiting_approval';

  return {
    subject: `Work order #${data.ticketNumber} — ${newLabelText}${isApprovalNeeded ? ' — Approval required' : ''}`,
    html: layout({
      preheader: `${issueLabelText} at ${data.buildingName} is now ${newLabelText}`,
      title: `Work order #${data.ticketNumber} update`,
      body: `
        <p style="margin:0 0 12px">Hi ${esc(data.recipientName)},</p>
        <p style="margin:0 0 16px">${message}</p>
        ${detailTable([
          ['Ticket', `#${esc(data.ticketNumber)}`],
          ['Status', statusBadge(data.newStatus)],
          ['Issue', esc(issueLabelText)],
          ['Building', esc(data.buildingName)],
          ['Unit / Space', esc(data.unitNumber)],
        ])}
      `,
      ctaUrl: ticketUrl,
      ctaLabel: 'View work order',
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
  const ticketUrl = `${getAppUrl()}${basePath}/tickets/${encodeURIComponent(data.ticketId)}`;
  const preview = `${data.commentText.slice(0, 80)}${data.commentText.length > 80 ? '...' : ''}`;

  return {
    subject: `New comment on work order #${data.ticketNumber} — ${data.buildingName}`,
    html: layout({
      preheader: `${data.authorName} commented: "${preview}"`,
      title: `New Comment on #${data.ticketNumber}`,
      body: `
        <p style="margin:0 0 12px">Hi ${esc(data.recipientName)},</p>
        <p style="margin:0 0 16px"><strong>${esc(data.authorName)}</strong> (${esc(data.authorRole)}) left a comment on work order #${esc(data.ticketNumber)}:</p>
        <div style="margin:16px 0;padding:12px 16px;background:${data.isInternal ? '#fffbeb' : BG_COLOR};border-radius:8px;border-left:3px solid ${data.isInternal ? '#f59e0b' : BRAND_COLOR};font-size:14px;line-height:1.5;color:${TEXT_COLOR};white-space:pre-wrap">${escMultiline(data.commentText)}</div>
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
    subject: 'Reset your Work Orders password',
    html: layout({
      preheader: 'Click the link to reset your Work Orders password',
      title: 'Password Reset',
      body: `
        <p style="margin:0 0 12px">Hi ${esc(data.recipientName)},</p>
        <p style="margin:0 0 16px">We received a request to reset your password. Click the button below to choose a new password.</p>
      `,
      ctaUrl: data.resetUrl,
      ctaLabel: 'Reset Password',
      footer: 'This link expires in 1 hour. If you didn\'t request a password reset, you can safely ignore this email.',
    }),
  };
}

// ---------------------------------------------------------------------------
// Template: Emergency escalation (on-call page / exhausted)
// ---------------------------------------------------------------------------

export interface EscalationEmailData {
  ticketNumber: number;
  ticketId: string;
  buildingName: string;
  location: string;
  description: string;
  createdByName: string;
  minutesOpen: number;
  /** 0 = nobody left to page */
  step: number;
  pagedName?: string;
  exhausted: boolean;
}

export function escalationEmail(data: EscalationEmailData): { subject: string; html: string } {
  const link = `${getAppUrl()}/t/${data.ticketId}`;
  const head = data.exhausted
    ? `Nobody has acknowledged emergency work order #${data.ticketNumber}`
    : `Emergency #${data.ticketNumber} still unacknowledged — paging ${data.pagedName ?? 'on-call'}`;
  return {
    subject: `${data.exhausted ? '🚨 NO RESPONSE' : '🚨 UNACKNOWLEDGED'} — Work order #${data.ticketNumber} at ${data.buildingName}`,
    html: layout({
      preheader: head,
      title: head,
      body: `
        <p style="margin:0 0 12px">Opened ${esc(String(data.minutesOpen))} minutes ago by ${esc(data.createdByName)} and <strong>no one at Pro Roto has acknowledged it</strong>.</p>
        ${data.exhausted
          ? `<p style="margin:0 0 12px">The on-call roster has been paged ${esc(String(data.step))} times by text and phone with no response. Someone needs to pick this up now.</p>`
          : `<p style="margin:0 0 12px">Page ${esc(String(data.step))}: ${esc(data.pagedName ?? 'on-call')} has been texted and called. If they don't acknowledge, the next person on the roster is paged.</p>`}
        ${detailTable([
          ['Building', esc(data.buildingName)],
          ['Location', esc(data.location)],
          ['Problem', escMultiline(data.description)],
        ])}
      `,
      ctaUrl: link,
      ctaLabel: "Open and acknowledge",
      footer: 'Acknowledging in the app stops the paging and tells the reporter someone is on it.',
    }),
  };
}
