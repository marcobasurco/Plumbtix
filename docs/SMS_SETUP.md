# Pro Roto App — SMS Notifications Setup Guide

## Overview

Pro Roto App v0.7.0 adds Twilio SMS notifications as a complement to existing Resend email notifications. SMS is used only for high-urgency events to avoid costs and spam.

## SMS Flows

### 1. Emergency Work Order → SMS to Property Managers
- **Trigger**: New ticket created with `severity = 'emergency'`
- **Recipients**: All `pm_admin` and `pm_user` users in the building's company who have a phone number set
- **Opt-in**: Not required — PMs always receive emergency SMS if they have a phone number
- **Message**: `🚨 EMERGENCY WORK ORDER #123 at Building Name, Unit 4B: Short description… View: https://workorders.proroto.com/t/{id}`

### 2. Ticket Completed → SMS to Resident
- **Trigger**: Ticket status changed to `completed`
- **Recipient**: The ticket creator (resident)
- **Opt-in**: Required — resident must have `sms_notifications_enabled = true` AND a valid phone number
- **Message**: `✅ Your work order #123 at Building Name, Unit 4B has been completed. Details: https://workorders.proroto.com/t/{id}`

### 3. Fallback
- If phone is not set or SMS fails, the existing email notification still fires (no data lost)
- All SMS attempts are logged to `sms_log` table regardless of success/failure

## Setup Steps

### 1. Run the SQL Migration
In Supabase SQL Editor or via CLI:
```bash
supabase migration up  # applies 00017_sms_notifications.sql
```

This adds:
- `sms_notifications_enabled BOOLEAN DEFAULT FALSE` column to `users` table
- `sms_log` audit table with RLS (admin read-only)

### 2. Get a Twilio Account & Phone Number
1. Sign up at https://www.twilio.com/
2. Purchase a phone number with SMS capability
3. Note your Account SID, Auth Token, and the phone number

### 3. Add Environment Variables
In Supabase Dashboard → Edge Functions → Secrets:

| Variable | Example | Description |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | `ACxxxxxxxx` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | `xxxxxxxxxx` | Twilio Auth Token |
| `TWILIO_FROM_NUMBER` | `+16505551234` | Your Twilio phone number (E.164) |
| `TWILIO_SANDBOX` | `true` | Set to `true` in dev/staging (logs SMS instead of sending) |
| `APP_URL` | `https://workorders.proroto.com` | Base URL for ticket short links |

### 4. Deploy Edge Functions
```bash
supabase functions deploy send-sms
supabase functions deploy create-ticket
supabase functions deploy update-ticket
```

### 5. Verify
1. Set `TWILIO_SANDBOX=true` initially
2. Create an emergency ticket → check Supabase Edge Function logs for `[sms][SANDBOX]` entries
3. Complete a ticket where the creator has SMS enabled → check logs
4. Once verified, set `TWILIO_SANDBOX=false` (or remove) to enable real SMS

## Cost & Control

### Pricing
- Twilio SMS to US numbers: ~$0.0079/segment (as of 2025)
- Each SMS is max 160 chars (1 segment). Pro Roto App messages are typically 1–2 segments.
- Emergency SMS: ~$0.01–0.02 per PM per emergency ticket
- Completion SMS: ~$0.01 per resident per completion

### Volume Controls
- SMS sent only for 2 specific events (emergency creation, ticket completion)
- Never bulk — always per-event, per-recipient
- PMs: emergency only (no opt-in toggle, just phone number presence)
- Residents: explicit opt-in required via Settings page
- All sends logged to `sms_log` for audit

### Rate Limiting
- Idempotent: each event triggers at most 1 SMS per user
- No database triggers — SMS dispatched inline in edge functions (fire-and-forget)
- Sandbox mode available for testing without real sends

## Architecture

```
create-ticket / update-ticket (Edge Function)
  → notifyNewTicket() / notifyStatusChange() (_shared/notifications.ts)
    → sendEmail() (existing Resend flow)
    → smsEmergencyToPMs() / smsCompletionToResident() (new SMS flow)
      → sendSMSAndLog() (_shared/sms.ts)
        → Twilio REST API (or sandbox log)
        → INSERT into sms_log
```

## Settings Page

Users access SMS preferences via the Settings page (user dropdown → Settings):
- **All roles**: Can add/update their phone number
- **Residents**: Toggle "Receive SMS updates for my tickets"
- **PMs**: Info banner explaining emergency alerts are always enabled
- **Admins**: Info banner about environment variable configuration

Phone numbers are normalized to E.164 format on save. US formats like `(650) 555-1234` are auto-converted.
