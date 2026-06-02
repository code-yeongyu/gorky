# Gorky Design System

## 1. Atmosphere & Identity

Gorky feels like a calm operator console for Grok accounts: dark, precise, and friendly enough that account health is obvious at a glance. The signature is a monochrome command surface with small green status accents used only for real operational state.

## 2. Color

| Role | Token | Light | Dark | Usage |
| --- | --- | --- | --- | --- |
| Surface/primary | --surface-primary | #f7f8f8 | #1f2228 | Main background |
| Surface/secondary | --surface-secondary | #ffffff | #292d34 | Panels |
| Surface/elevated | --surface-elevated | #ffffff | #333842 | Modals and controls |
| Text/primary | --text-primary | #111318 | #ffffff | Headings and body |
| Text/secondary | --text-secondary | #5d6675 | rgba(255,255,255,0.72) | Supporting text |
| Text/tertiary | --text-tertiary | #8a93a3 | rgba(255,255,255,0.48) | Meta text |
| Border/default | --border-default | #dfe3ea | rgba(255,255,255,0.14) | Cards and controls |
| Border/subtle | --border-subtle | #edf0f4 | rgba(255,255,255,0.08) | Dividers |
| Accent/primary | --accent-primary | #14532d | #8ff5b2 | Primary action and online status |
| Accent/hover | --accent-hover | #166534 | #b4f8c9 | Hover |
| Status/success | --status-success | #15803d | #8ff5b2 | Healthy |
| Status/warning | --status-warning | #a16207 | #f3c969 | Expiring |
| Status/error | --status-error | #b91c1c | #ff8a8a | Failed |
| Status/info | --status-info | #1d4ed8 | #93c5fd | Info |

## 3. Typography

| Level | Size | Weight | Line Height | Tracking | Usage |
| --- | --- | --- | --- | --- | --- |
| Display | 48px | 400 | 1.08 | 0 | Product title |
| H1 | 32px | 500 | 1.2 | 0 | Page title |
| H2 | 24px | 500 | 1.25 | 0 | Sections |
| H3 | 18px | 500 | 1.35 | 0 | Panel titles |
| Body | 16px | 400 | 1.6 | 0 | Main copy |
| Body/sm | 14px | 400 | 1.5 | 0 | Secondary copy |
| Caption | 12px | 500 | 1.4 | 0 | Labels |

Primary font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif.
Mono font: "SF Mono", "Geist Mono", ui-monospace, monospace.

## 4. Spacing & Layout

Base unit is 4px. Main shell width is 1280px. Dashboard grid uses two columns on desktop and a single column below 860px. Component radii are 4px to 8px.

## 5. Components

### Button

Sharp rectangular control with uppercase mono label, visible focus ring, and hover state using `--accent-hover`.

### Panel

Single bordered surface using `--surface-secondary`, `--border-default`, 8px radius, and 24px padding.

### Status Badge

Small mono badge using semantic status token, never raw color.

## 6. Motion & Interaction

Micro interactions use 120ms ease-out. Standard panel transitions use 220ms ease-in-out. Reduced motion disables transform transitions.

## 7. Depth & Surface

Depth strategy is borders-only with subtle tonal shifts. No decorative shadows, gradients, or floating card stacks.
