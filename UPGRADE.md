# Work Orders Frontend v3 — Upgrade Instructions

## What's Changed

### 🔧 Critical Fixes
- **proroto_admin "New Building" button** — Now visible on the Buildings list page for both `proroto_admin` and `pm_admin` roles (was previously hidden for proroto_admin, only showing a text hint to go to Companies)
- **proroto_admin company picker** — When proroto_admin clicks "New Building", a dialog lets them pick which company the building belongs to (since they have no default companyId). BuildingForm reads `?companyId=` from query params.
- **Admin route** — Added `/admin/buildings/new` route so proroto_admin can navigate directly
- **Delete confirmations** — All delete actions now use proper AlertDialog modals instead of `window.confirm()`
- **Form validation** — BuildingForm now validates: state (exactly 2 letters), ZIP (5-digit or 5+4 format), phone (7-15 digits), all required fields

### 🎨 Visual Overhaul
- All inline CSS styles replaced with Tailwind utility classes
- Components now use shadcn/ui primitives (Button, Card, Dialog, AlertDialog, Badge, Input, Label, Textarea, Skeleton)
- Framer Motion page transitions and staggered card animations
- Dark mode toggle in header (uses `.dark` class on `<html>`)
- Loading skeletons instead of spinner-only loading states

### 📦 New Files
- `src/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- `src/components/ui/button.tsx` — shadcn Button with variants
- `src/components/ui/card.tsx` — shadcn Card, CardHeader, CardContent, etc.
- `src/components/ui/input.tsx` — shadcn Input
- `src/components/ui/label.tsx` — shadcn Label (Radix UI)
- `src/components/ui/textarea.tsx` — shadcn Textarea
- `src/components/ui/badge.tsx` — shadcn Badge with custom variants (info, success, urgent, warning)
- `src/components/ui/skeleton.tsx` — shadcn Skeleton
- `src/components/ui/dialog.tsx` — shadcn Dialog (Radix UI)
- `src/components/ui/alert-dialog.tsx` — Custom AlertDialog wrapper (Radix UI)
- `src/components/ui/tooltip.tsx` — shadcn Tooltip (Radix UI)
- `src/components/ui/select.tsx` — shadcn Select (Radix UI)
- `src/components/PageTransition.tsx` — Framer Motion animation wrappers
- `src/hooks/useFormValidation.ts` — Reusable form validation hook

### 🔄 Rewritten Components (13 files)
- `BuildingList.tsx` — shadcn Cards, skeletons, fixed New Building button
- `BuildingForm.tsx` — Full validation, shadcn Input/Label/Card, error states per field
- `BuildingDetail.tsx` — AlertDialog for deletes, shadcn Cards, Tailwind tables
- `SpaceForm.tsx` — shadcn Card/Input/Label/Button
- `OccupantList.tsx` — Tailwind classes, AlertDialog, copy claim link button
- `EntitlementManager.tsx` — Tailwind classes, AlertDialog
- `CompanyList.tsx` — shadcn Dialog for creation, Cards with stagger animation
- `CompanyDetail.tsx` — shadcn Dialog for editing, Badge variants
- `DashboardLayout.tsx` — Dark mode toggle, Tooltip, shadcn Button/Badge
- `TicketList.tsx` — PageTransition, Skeleton loading, shadcn Button
- `dashboard-admin.tsx` — Added `/buildings/new` route

## Installation

### 1. Replace files
Copy all files from this package into your project, overwriting existing files:

```bash
# From your project root:
cp work-orders-v3/package.json ./package.json
cp work-orders-v3/src/lib/utils.ts ./src/lib/utils.ts
cp work-orders-v3/src/components/ui/*.tsx ./src/components/ui/
cp work-orders-v3/src/components/PageTransition.tsx ./src/components/PageTransition.tsx
cp work-orders-v3/src/hooks/useFormValidation.ts ./src/hooks/useFormValidation.ts
cp work-orders-v3/src/components/buildings/* ./src/components/buildings/
cp work-orders-v3/src/components/admin/CompanyList.tsx ./src/components/admin/CompanyList.tsx
cp work-orders-v3/src/components/admin/CompanyDetail.tsx ./src/components/admin/CompanyDetail.tsx
cp work-orders-v3/src/components/DashboardLayout.tsx ./src/components/DashboardLayout.tsx
cp work-orders-v3/src/components/tickets/TicketList.tsx ./src/components/tickets/TicketList.tsx
cp work-orders-v3/src/routes/dashboard-admin.tsx ./src/routes/dashboard-admin.tsx
```

### 2. Install dependencies
```bash
npm install
```

This will install the new dependencies added to package.json:
- `tailwindcss`, `postcss`, `autoprefixer` (dev)
- `tailwindcss-animate` (dev)
- `@radix-ui/react-alert-dialog`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-label`
- `@radix-ui/react-select`, `@radix-ui/react-separator`, `@radix-ui/react-slot`
- `@radix-ui/react-switch`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`
- `class-variance-authority`, `clsx`, `tailwind-merge`
- `framer-motion`

### 3. Create hooks directory (if not exists)
```bash
mkdir -p src/hooks
```

### 4. Run dev server
```bash
npm run dev
```

### 5. Type check
```bash
npm run typecheck
```

## What's NOT Changed (Preserved)
- All data layer files (`lib/buildings.ts`, `lib/admin.ts`, `lib/tickets.ts`, etc.)
- Auth system (`lib/auth.tsx`)
- Ticket workflows (CreateTicketWizard, TicketDetail, ActionPanel, Comments, etc.)
- DashboardOverview (recharts)
- DispatchBoard, UsersPage
- Route structure (dashboard-pm.tsx, dashboard-resident.tsx)
- All shared types
- Tailwind config, PostCSS config, Vite config
- index.css design system
- Supabase client config

## Required Data Layer Addition

### `fetchCompanyOptions` in `lib/admin.ts`

BuildingList now imports `fetchCompanyOptions` and `CompanyOption` from `@/lib/admin`. If these don't exist yet, add them:

```typescript
export type CompanyOption = { id: string; name: string };

export async function fetchCompanyOptions(): Promise<CompanyOption[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('id, name')
    .order('name');
  if (error) throw error;
  return data ?? [];
}
```

### `companyId` in `useAuth()` context

BuildingList now destructures `companyId` from `useAuth()`. Ensure your auth context exposes `companyId: string | null` (this should already be the case based on your existing `auth.tsx`).

## Role-Based UI Summary
| Action | proroto_admin | pm_admin | pm_user | resident |
|--------|:---:|:---:|:---:|:---:|
| New Building button | ✅ | ✅ | ❌ | ❌ |
| Edit/Delete Building | ✅ | ✅ | ❌ | ❌ |
| Add/Edit/Delete Spaces | ✅ | ✅ | ❌ | ❌ |
| Add/Remove Occupants | ✅ | ✅ | ❌ | ❌ |
| Manage Entitlements | ✅ | ✅ | ❌ | ❌ |
| Create/Edit Companies | ✅ | ❌ | ❌ | ❌ |
| New Ticket | ✅ | ✅ | ✅ | ✅ |
| Dark Mode Toggle | ✅ | ✅ | ✅ | ✅ |
