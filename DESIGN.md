# AKE Revenue CRM Design System

## 1. Visual Theme & Atmosphere

An operational control desk for an overseas B2B sales team: calm, precise, and evidence-led. The interface borrows Linear's surface hierarchy and dense product framing, plus Sentry's clear operational states, without copying either brand. The memorable element is the vertical acquisition-to-revenue signal rail that shows exactly where an ad lead sits and whether Qualified feedback reached the ad platform.

Design dials: variance 7, motion 5, density 6. Use asymmetry on desktop and a strict single column below 768px.

## 2. Color Palette & Roles

- Canvas: `#0d1110`
- Raised surface: `#131917`
- Hover surface: `#18211e`
- Hairline: `#26312d`
- Strong hairline: `#3a4742`
- Primary ink: `#edf3f0`
- Secondary ink: `#9eaaa5`
- Muted ink: `#6f7c77`
- Single accent / accepted / active: `#5da883`
- Warning: `#d2a85b`
- Error: `#c76f66`
- Information is expressed with contrast and shape first; semantic colors remain sparse.

No purple gradients, neon glows, pure black, or decorative multicolor charts.

## 3. Typography Rules

- UI and headings: Geist Sans, with a locally safe sans-serif fallback.
- IDs, timestamps, metrics, and platform identifiers: Geist Mono.
- Page title: 30–36px, weight 600, tight tracking.
- Section title: 18–22px, weight 600.
- Body: 14px, line height 1.5.
- Caption: 12px, muted.
- Dashboard text is always sans-serif; serif faces are forbidden.

## 4. Component Stylings

- Buttons and inputs use 8px radius; major panels use 12px.
- Default organization uses dividers and negative space. Cards are reserved for elevated context such as a selected lead or actionable failure.
- Status chips are compact and never use oversized pills.
- Labels sit above inputs; helper and error copy sit below.
- Tables use a 44px minimum row height and monospaced IDs.
- Buttons include hover, focus-visible, disabled, loading, and pressed states.
- Every data surface provides loading skeleton, empty, and inline error states.

## 5. Layout Principles

- Desktop shell: 232px navigation, flexible workspace, optional 360px contextual rail.
- Content width: `max-width: 1440px` with 24–32px gutters.
- Dashboard metrics form a 2fr/1fr asymmetric grid, not three identical cards.
- Lead lists remain scannable; the conversion delivery center uses a table plus a right-side event inspector.
- Chatwoot embed uses the same components in a narrower 360px layout.

## 6. Depth & Elevation

- Depth comes from a four-step dark surface ladder and 1px borders.
- Do not use broad outer shadows. Modals may use one tinted diffusion shadow.
- Focus uses a 2px accent outline with 35% opacity.

## 7. Do's and Don'ts

Do:

- Show source evidence, timestamps, owners, and diagnostic state near every decision.
- Separate API acceptance from platform matching.
- Use realistic AKE-adjacent sample companies and irregular metrics.
- Use one accent color for primary actions and healthy signal flow.

Don't:

- Hide failed feedback behind a generic success state.
- Use gradients, glowing borders, oversized hero headings, emojis, or generic avatar eggs.
- Fill the dashboard with equal-size cards.
- expose full ad identifiers or customer PII in the UI.

## 8. Responsive Behavior

- Below 1024px, hide the context rail behind a drawer.
- Below 768px, navigation becomes a top bar; grids become one column and tables switch to stacked rows.
- Touch targets are at least 44px.
- Avoid horizontal page overflow; identifier cells may scroll internally.

## 9. Agent Prompt Guide

Build a sober dark operations interface for an overseas B2B revenue team. Use Geist, charcoal green-tinted surfaces, a single desaturated emerald accent, monospaced evidence fields, divider-led grouping, and an asymmetric desktop layout. Emphasize the Lead-to-Qualified signal rail, source provenance, and conversion diagnostics. Avoid generic SaaS cards, purple gradients, neon, emojis, and fake-perfect metrics.
