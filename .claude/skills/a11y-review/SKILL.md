---
name: a11y-review
description: WCAG 2.1 AA accessibility audit of PlumbTix screens or components — contrast, keyboard access, focus visibility, labels, error identification, touch targets, screen-reader names/roles, reduced motion. Use before shipping UI and for any enterprise accessibility questionnaire.
argument-hint: [route, component path, or "all"]
allowed-tools: Read Glob Grep Bash(node *)
---

Audit for accessibility: $ARGUMENTS (default: the main flows — login,
dashboard, ticket list, create-ticket wizard, ticket detail, settings).

Load `plumbtix-ui`. Work from the component source (and screenshots in
`.claude/ux-shots/` if present). Check against WCAG 2.1 AA:

- **Perceivable** — 1.1.1 alt text on meaningful images (attachments,
  logos); 1.3.1 semantic structure (headings, lists, tables with headers,
  landmarks `main/nav/header`); 1.4.3 text contrast ≥ 4.5:1 (≥ 3:1 for large
  text); 1.4.11 UI/graphic contrast ≥ 3:1 (badges, focus rings, icons);
  1.4.1 meaning not by color alone (status/severity must carry text).
  Compute contrast from the actual token values in `src/index.css` — run a
  small Node snippet for the ratio rather than estimating.
- **Operable** — 2.1.1 everything reachable by keyboard (dialogs, dropdowns,
  the ticket wizard steps, drag-free dispatch board); 2.1.2 no focus traps;
  2.4.3 logical focus order; 2.4.7 visible focus (the project ring is
  `0 0 0 3px ring/15%` — verify it is visible on every control, including
  icon buttons); 2.5.5 targets ≥ 44×44 CSS px on touch; 2.3.3 motion
  respects `prefers-reduced-motion`.
- **Understandable** — 3.2.1/3.2.2 nothing changes context on focus or
  input alone; 3.3.1 errors identified in text next to the field; 3.3.2 every
  input has a visible `<Label htmlFor>`; 3.3.3 error messages suggest the fix.
- **Robust** — 4.1.2 name/role/value: icon-only buttons have `aria-label`,
  toggles expose state, custom components (Radix primitives are fine) keep
  their ARIA; toasts are announced (`aria-live`).

Output:

```
## Accessibility audit: <scope>   Standard: WCAG 2.1 AA
### Summary — issues found / critical / major / minor
### Findings — table per principle: # · issue · criterion · severity · file:line · fix
### Contrast check — table: element · fg · bg · ratio · required · pass
### Keyboard — table: element · tab order · Enter/Space · Escape · arrows
### Priority fixes — 3, who it affects and what it unblocks
```

Then offer to apply the fixes. Keep the manual-testing caveat: screen-reader
behavior (NVDA/VoiceOver) and 200 % zoom still need a human pass.
