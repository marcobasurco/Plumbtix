# PlumbTix — Email Notification Setup (Resend)

## Overview

PlumbTix uses [Resend](https://resend.com) for transactional email delivery. Emails are sent from Supabase Edge Functions — no separate email server needed.

## Quick Start

### 1. Create a Resend Account

Sign up at [resend.com](https://resend.com) (free tier: 3,000 emails/month).

### 2. Verify Your Domain

In the Resend dashboard:
- Go to **Domains** → **Add Domain**
- Add `proroto.com` (or your sending domain)
- Add the DNS records (SPF, DKIM, DMARC) to your domain's DNS
- Click **Verify DNS Records**

### 3. Create an API Key

In the Resend dashboard:
- Go to **API Keys** → **Create API Key**
- Name: `plumbtix-production`
- Permission: **Sending access**
- Copy the key (starts with `re_`)

### 4. Set Supabase Secrets

```bash
# Required
supabase secrets set RESEND_API_KEY=re_your_api_key_here

# Sender address (must match your verified domain)
supabase secrets set RESEND_FROM="PlumbTix <notifications@proroto.com>"

# App URL (for CTA buttons in emails)
supabase secrets set APP_URL=https://app.proroto.com

# Pro Roto notification recipients (comma-separated)
supabase secrets set PROROTO_NOTIFY_EMAILS="marco@proroto.com,dispatch@proroto.com"

# Emergency-specific recipients (optional, defaults to PROROTO_NOTIFY_EMAILS)
supabase secrets set PROROTO_EMERGENCY_EMAILS="marco@proroto.com,dispatch@proroto.com"
```

### 5. Run the Database Migration

```bash
supabase db push
# or apply migration 00013_email_notifications.sql manually
```

### 6. Deploy Edge Functions

```bash
supabase functions deploy send-invitation
supabase functions deploy create-ticket
supabase functions deploy update-ticket
supabase functions deploy create-comment
supabase functions deploy create-occupant
```

## What Gets Emailed

| Event | Recipients | Template |
|-------|-----------|----------|
| **Invitation sent** | Invited user | Accept invitation CTA |
| **Resident added** (occupant created) | Occupant email | Claim account CTA |
| **New ticket created** | Pro Roto dispatch | Ticket details + severity badge |
| **Emergency ticket** | Pro Roto emergency list | 🚨 Emergency alert |
| **Status change** (by Pro Roto) | PM company users | Status update + details |
| **Status change** (by PM/resident) | Pro Roto dispatch | Status update |
| **Waiting approval** | PM company users | Quote amount + Approve CTA |
| **New comment** (by Pro Roto) | PM company users | Comment preview |
| **New comment** (by PM) | Pro Roto dispatch | Comment preview |
| **Internal note** | Pro Roto staff only | Yellow internal badge |

## Architecture

```
Edge Function (create-ticket, update-ticket, etc.)
  │
  ├─ Core logic (validate, write to DB)
  ├─ Return response to client
  └─ Fire-and-forget email notification
       │
       ├─ notifications.ts → resolve recipients
       ├─ email-templates.ts → build HTML
       └─ email.ts → POST to Resend API
```

**Key design decisions:**
- All emails are **fire-and-forget** — email failures never block the API response
- Recipient resolution uses the **service role client** (needs cross-company visibility)
- Templates use **inline CSS only** (no external stylesheets — email client compat)
- Pro Roto recipients are configured via **environment variables**, not hard-coded
- Emergency tickets go to a **separate recipient list** (can include SMS gateways)

## Database Tables

### `notification_preferences`
Per-user opt-in/out for each notification type. Absence = enabled.

| Column | Type | Description |
|--------|------|-------------|
| user_id | UUID | FK → users |
| notification_type | VARCHAR | `new_ticket`, `status_change`, `comment`, `invitation`, `weekly_digest` |
| enabled | BOOLEAN | Default TRUE |

### `email_log`
Audit trail for debugging. Admin read-only.

| Column | Type | Description |
|--------|------|-------------|
| resend_id | VARCHAR | Resend message ID |
| notification_type | VARCHAR | Type tag |
| recipient_email | VARCHAR | Who received it |
| subject | VARCHAR | Email subject |
| status | VARCHAR | `sent`, `delivered`, `bounced`, `failed` |
| related_ticket_id | UUID | Optional FK |

## Testing with Resend Test Mode

Before verifying your domain, Resend lets you send to `delivered@resend.dev` for testing:

```bash
# Set test recipient
supabase secrets set PROROTO_NOTIFY_EMAILS="delivered@resend.dev"
```

All emails will appear in the Resend dashboard → **Emails** tab.

## Future: Notification Preferences UI

The `notification_preferences` table is ready for a frontend settings page where users can toggle email notifications per type. The RLS policy allows users to manage their own preferences.

## Troubleshooting

- **No emails arriving:** Check `supabase functions logs` for `[email]` prefixed messages
- **Resend 403:** Your API key may lack sending permissions or domain isn't verified
- **Emails in spam:** Ensure SPF, DKIM, and DMARC DNS records are properly configured
- **Rate limited:** Free tier = 3K/month, 100/day. Upgrade at resend.com/pricing
