# PlumbTix — Netlify Deployment Notes

## 1. Build Configuration

Already defined in `netlify.toml`:

| Setting | Value |
|---------|-------|
| Build command | `npm ci && npm run build` |
| Publish directory | `dist` |
| Node version | 18+ (set `NODE_VERSION=18` in Netlify env if needed) |

`npm ci` ensures a clean reproducible install from `package-lock.json` before building.

---

## 2. Required Environment Variables

Set these in **Netlify > Site settings > Environment variables**:

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…
VITE_EDGE_BASE_URL=https://<your-project-ref>.supabase.co
```

| Variable | Description | Where to Find |
|----------|-------------|---------------|
| `VITE_SUPABASE_URL` | Supabase project URL | Supabase Dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key | Supabase Dashboard → Settings → API → `anon` `public` key |
| `VITE_EDGE_BASE_URL` | Base URL for Edge Functions | Same as `VITE_SUPABASE_URL` (Edge Functions are at `<url>/functions/v1/`) |

**NEVER set `SUPABASE_SERVICE_ROLE_KEY` in Netlify.** The service role key is only used by Edge Functions (deployed to Supabase, not Netlify).

### Vite Environment Variable Behavior

Variables prefixed with `VITE_` are injected at **build time** via `import.meta.env`. They are baked into the JavaScript bundle. Changing them requires a rebuild/redeploy.

---

## 3. SPA Routing Fallback

```toml
[[redirects]]
  from   = "/*"
  to     = "/index.html"
  status = 200
```

This is critical for React Router. Without it, direct navigation to `/admin/dispatch` or `/dashboard/tickets/abc-123` returns Netlify's 404 page. The `200` status (not `301` or `302`) ensures the browser receives `index.html` and React Router handles the path client-side.

---

## 4. Domain: workorders.proroto.com

### Netlify Setup

1. **Netlify > Domain management > Add custom domain** → enter `workorders.proroto.com`
2. Netlify will provide either:
   - A CNAME target (e.g., `plumbtix.netlify.app`) for subdomain, or
   - DNS nameservers if using Netlify DNS

### DNS Configuration (at your registrar or DNS provider)

```
workorders.proroto.com.  CNAME  <your-site>.netlify.app.
```

Or if using Cloudflare/other proxy:
- Type: CNAME
- Name: `workorders`
- Target: `<your-site>.netlify.app`
- Proxy: Off (DNS only) — Netlify manages its own TLS

### SSL/TLS

Netlify provisions a Let's Encrypt certificate automatically after DNS propagates. No additional configuration needed. HTTPS is enforced by default.

### Supabase Auth Redirect URLs

After setting the custom domain, update Supabase Auth settings:

**Supabase Dashboard → Authentication → URL Configuration:**

| Setting | Value |
|---------|-------|
| Site URL | `https://workorders.proroto.com` |
| Redirect URLs | `https://workorders.proroto.com/**` |

This ensures password reset emails, OAuth callbacks, and magic links redirect to the correct domain.

---

## 5. Headers

### Security Headers (all responses)

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disables unused browser APIs |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS protection |

### Cache Headers

| Path | Cache-Control | Reason |
|------|--------------|--------|
| `/assets/*` | `public, max-age=31536000, immutable` | Vite hashes filenames — content never changes for a given URL |
| `/index.html` | `public, max-age=0, must-revalidate` | Must always serve latest to pick up new deploys |

---

## 6. Edge Functions (Not on Netlify)

PlumbTix Edge Functions are deployed to **Supabase**, not Netlify. They are called from the frontend via `VITE_EDGE_BASE_URL`:

```
POST https://<ref>.supabase.co/functions/v1/create-ticket
PATCH https://<ref>.supabase.co/functions/v1/update-ticket
POST https://<ref>.supabase.co/functions/v1/send-invitation
...
```

No Netlify Functions, Netlify Edge Functions, or server-side rendering are used. The Netlify site is a **static SPA** only.

---

## 7. Deployment Checklist

```
[ ] Supabase project created and migrations 00001–00006 applied
[ ] Edge Functions deployed to Supabase (`supabase functions deploy`)
[ ] Supabase Storage bucket `ticket-attachments` exists with policies
[ ] Netlify site connected to Git repository (or deploy via CLI)
[ ] Environment variables set in Netlify (3 VITE_ vars)
[ ] Custom domain workorders.proroto.com configured
[ ] DNS CNAME record created and propagated
[ ] SSL certificate provisioned (automatic)
[ ] Supabase Auth redirect URLs updated to custom domain
[ ] Seed data loaded (migration 00004) or production users created
[ ] Test login as proroto_admin → verify all tabs load
[ ] Test SPA routing: navigate directly to /admin/dispatch → loads correctly
```
