---
name: design-review
description: Structured design critique of a PlumbTix screen, component, or mockup — first impression, usability, visual hierarchy, consistency with the design system, accessibility — with prioritized recommendations. Use when reviewing a specific screen or a new UI proposal.
argument-hint: <route, component path, screenshot path, or description>
---

Critique: $ARGUMENTS

Load `plumbtix-ui` for the design system. If the argument is a route, read
the route's component tree; if it is a screenshot path, open it with Read;
if `.claude/ux-shots/` has a capture of that route, use it. Review it as the
**ux-reviewer** subagent would (same personas: facilities coordinator on a
phone, dispatcher at night, facilities director reading a report) and
report in this shape:

```
## Design critique: <name>
### Overall impression — one or two sentences: what works, biggest opportunity
### Usability        — table: finding · severity (Critical/Major/Minor) · recommendation
### Visual hierarchy — what draws the eye first (and should it?), reading flow, emphasis
### Consistency      — table: element · deviation from plumbtix-ui · fix
### Accessibility    — contrast, touch targets, labels, focus, color-only meaning
### What works well  — specific, not generic
### Priority recommendations — 3, each with why and the concrete UI change
```

Be specific and propose alternatives, not just problems. Match the stage:
exploration gets direction, a shipping screen gets polish. If asked, apply
the recommendations in code and show the diff.
