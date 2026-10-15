---
name: plumbtix-ui
description: PlumbTix design-system reference — tokens, components, layout classes, status/severity conventions, mobile and print rules. Load before building or changing any screen so new UI matches the existing app instead of inventing a second style.
user-invocable: false
---

# PlumbTix UI reference

Read this before touching anything in `src/components` or `src/routes`.
Source of truth: `src/index.css` (tokens + layout classes), `tailwind.config.ts`
(shadcn color mapping), `src/components/ui/` (primitives).

## Foundations

- **Type:** Inter (`--font-sans`), JetBrains Mono for ticket numbers, codes
  and tabular data (`--font-mono`). Scale: `--text-xs` 0.75rem · `sm` 0.8125
  · `base` 0.875 (body) · `md` 0.9375 · `lg` 1.0625 · `xl` 1.25 (page title)
  · `2xl` 1.5 · `3xl` 2. Body line-height 1.625. Page titles are 700 weight
  with `-0.02em` tracking.
- **Color:** shadcn semantic tokens (`bg-background`, `text-foreground`,
  `text-muted-foreground`, `border-border`, `bg-card`, `bg-primary` = Pro Roto
  blue `#2563eb`). Raw palette vars exist (`--slate-*`, `--blue-*`, `--red-*`
  …) for charts and badges only. Dark mode is the `.dark` class on `<html>`
  (toggle in header; stored in `localStorage['plumbtix-theme']`). Every new
  color must have a dark counterpart.
- **Radii:** `--radius-sm` 6 · `md` 8 · `lg` 12 (cards) · `xl` 16 ·
  `full`. **Shadows:** `--shadow-card` for cards; `--shadow-md/lg` for
  popovers only. **Motion:** `--duration-fast/base/slow` 150/200/300 ms with
  `--ease-out`; page-level transitions via `PageTransition`, `FadeIn`,
  `StaggerChildren` + `StaggerItem` (`src/components/PageTransition.tsx`). Respect
  `prefers-reduced-motion`.

## Components (use these, don't re-create them)

`src/components/ui/`: `Button` (variants default/secondary/destructive/
outline/ghost/link; sizes sm/default/lg/icon), `Card` + `CardHeader/Title/
Description/Content/Footer`, `Input`, `Textarea`, `Label`, `Select`,
`Switch`, `Tabs`, `Dialog`, `AlertDialog` (all destructive confirmations),
`DropdownMenu`, `Tooltip`, `Badge`, `Avatar`, `Separator`, `Sheet`
(mobile drawers), `Skeleton` (every loading state). Toasts: `sonner`
(`toast.success` / `toast.error` with a `description`). Icons: `lucide-react`
at 16–18 px inside controls.

Domain components: `StatusBadge`, `SeverityBadge`, `StatusTimeline`,
`ActionPanel`, `CommentsThread`, `AttachmentsList`, `EquipmentCard`,
`TicketFilters`, `ConfirmDialog`, `ErrorBanner`, `Loading`, `NotificationBell`.

## Layout classes (`src/index.css`)

`.app-shell` → `.sidebar` (260 px, collapses to a `Sheet` under 768 px) +
`.content-area`. Page header: `.page-title-bar` > `.page-title` +
`.page-subtitle`, actions on the right. Cards: `.card` / `.card-header`.
Forms: `.form-group` > `.form-label` + `.form-input|select|textarea`
(focus ring `0 0 0 3px ring/15%`). Alerts: `.alert` + `.alert-success|…`.
Badges: `.badge .badge-{blue|green|amber|red|purple|indigo|cyan|orange|slate}`
with optional `.badge-dot` (all have `.dark` variants).

## Conventions that carry meaning

- **Severity:** emergency = red, urgent = amber, standard = blue — always
  with the word, never color alone. Emergencies get the strongest emphasis
  on any list or board.
- **Status:** use `StatusBadge`; labels come from `shared/types/enums.ts`
  (`STATUS_LABELS`), never hand-typed. Role labels likewise (`ROLE_LABELS`).
- **Ticket identity:** `#<ticket_number>` in mono, then issue type, then
  building. Addresses one line: `address_line1, city`.
- **Destructive actions** go through `AlertDialog`/`ConfirmDialog` with the
  consequence spelled out ("This deletes 12 spaces. Tickets are kept.").
- **Buttons say what happens:** "Create ticket", "Save changes", "Send
  invitation" — and the toast repeats the same verb ("Invitation sent").
- **Empty states** tell the person what to do and offer the action.
  **Errors** say what went wrong and how to fix it; never "Something went
  wrong" alone.

## Mobile (phones are a primary device, not a fallback)

Breakpoints in use: 768 (sidebar → drawer, grids → 1 column), 640 (filters
stack, metric grid 2-col), 480 (metric grid 1-col). Rules: no horizontal
scroll; tables become stacked cards under 640; primary action visible
without scrolling; targets ≥ 44 px; inputs ≥ 16 px font (prevents iOS zoom);
`min-width: 0` on flex children that hold long text; photo upload must keep
working from the phone camera roll (the wizard and `AttachmentsList`
compress images/videos client-side before upload).

## Print (reports and work orders are printed and handed to people)

`@media print` blocks in `src/index.css` (`@page letter, 0.5in`). Report
documents live in `src/components/reports/` (`ReportHeader`, `ReportSection`,
`PropertySummary`, `PrintActions`) — reuse them for any new report. Hide
chrome (`.sidebar`, header, buttons) in print; keep tables unbroken
(`break-inside: avoid`); the ticket PDF is `TicketPdfDocument.tsx`
(@react-pdf) and must stay in sync with the on-screen detail.

## Don'ts

No new raw hex colors in components (use tokens/badge classes); no
`dangerouslySetInnerHTML`; no inline `style={{}}` for layout; no new UI
library; no all-caps labels except the existing sidebar section labels; no
decorative animation — motion only in response to what the user did.
