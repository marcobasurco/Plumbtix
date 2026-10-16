---
name: frontend-design
description: Build or redesign a PlumbTix screen to a high design standard — plan tokens and layout against the real users first, avoid generic AI-generated patterns, stay inside the design system, meet the quality floor (mobile, focus, reduced motion, contrast), then self-critique with screenshots. Use for any new page, flow, report, or visual overhaul.
argument-hint: <what to build or redesign, and for whom>
---

Design brief: $ARGUMENTS

Approach this as the design lead responsible for how a hospital system's
facilities team experiences Pro Roto. The product is a tool people use
while something is leaking; it must feel calm, fast, and certain. Load
`plumbtix-ui` first — new work extends that system, it does not start a
new one.

## 1. Ground it in the subject and the person

State in two lines who this screen is for and the one job it must do
(e.g. "a Stanford facilities coordinator on a phone reporting a sewer
backup with a photo in under two minutes"). Build with real content from
the domain: real statuses, real severities, real building names, realistic
ticket numbers — never lorem ipsum or "Item 1".

## 2. Plan before code (short, written)

- **Layout:** one-sentence concept + a small ASCII wireframe for phone and
  desktop. Where is the primary action? What is above the fold at 390 px?
- **Hierarchy:** what the eye sees first, second, third — and why that order
  serves the job. Severity must dominate wherever tickets are listed.
- **Tokens:** which existing tokens/components carry it. New tokens only if
  the system genuinely lacks one, and then add them to `src/index.css` with a
  dark variant.
- **Copy:** every label, button, empty state and error, written in the
  user's vocabulary, active voice, sentence case; the button's verb reappears
  in its toast.

Then review the plan against the brief: if any part is what you would
produce for any generic SaaS page, change it and say why. The common tells
to avoid: identical rounded cards for everything with the same soft shadow;
a big number + tiny label + gradient as the default hero; numbered 01/02/03
markers where nothing is a sequence; tracked-out ALL-CAPS eyebrow labels;
meta strings joined with middle dots; one word in a headline colored for
emphasis; decorative gradients; fade-and-slide-in on every section.
Structure should encode information (a timeline is numbered because it is
a sequence; a divider separates things that are different).

## 3. Build

Use the primitives in `src/components/ui/` and the layout classes; use
semantic tokens, not hex. Keep CSS specificity flat (utility classes over
new global selectors). Every state is designed: loading (`Skeleton` in the
real layout), empty (what to do next + the action), error (what happened +
how to fix), success (toast that repeats the verb). Motion only in response
to the user's action; none on page load beyond the existing
`PageTransition`.

## 4. Quality floor (non-negotiable, no announcement needed)

Works at 390 px with no horizontal scroll and the primary action visible;
targets ≥ 44 px; inputs ≥ 16 px; visible focus on every control; contrast
≥ 4.5:1 text / 3:1 UI; meaning never by color alone; `prefers-reduced-
motion` respected; dark mode parity; prints cleanly if it is a report.

## 5. Critique your own work

Run `node scripts/ux-shots.mjs --routes=<route> --dark` against the dev
server and look at the phone capture first. Ask what to remove — one
accessory fewer. Then run `/a11y-review <route>` if the screen has forms or
tables. Report: what you built, the plan vs. the result, and what you cut.
