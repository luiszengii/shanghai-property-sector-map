# Design — 上海楼市互动地图

A locked design system for this app. Every page redesign reads this file before
emitting code. Extend this file when the system needs to grow; do not invent a
page-local theme.

## Genre

modern-minimal, with a technical cartographic register.

## Audience and primary use

- Audience: people comparing Shanghai residential sectors, and researchers editing market-sector drafts.
- Primary use: move from a spatial overview to a traceable detail, filter, source, or editable boundary without losing map context.
- Tone: technical. Labels are measured and operational; factual caveats remain visible.

## Macrostructure family

- App pages: **Workbench**. The map or working canvas is the primary surface; controls behave as instrument panels, not decorative cards.
- Content pages: **Long Document / research index**. Reading order, source traceability, and filtering outrank promotional hierarchy.
- Marketing pages: not currently present. If introduced, use Workbench with a real product capture and no invented proof.

## Theme

- `--color-paper` `oklch(98.2% 0.008 175)`
- `--color-paper-2` `oklch(95.4% 0.011 175)`
- `--color-paper-3` `oklch(91.8% 0.014 175)`
- `--color-ink` `oklch(20% 0.018 175)`
- `--color-ink-2` `oklch(34% 0.018 175)`
- `--color-rule` `oklch(79% 0.014 175)`
- `--color-accent` `oklch(50% 0.11 174)`
- `--color-focus` `oklch(56% 0.17 174)`

The mineral-teal accent is a signal, not a surface. Orange remains semantic for
new-project markers; warning and danger colours remain semantic only.

## Typography

- Display: Geist Mono, weight 650–750, roman.
- Body: Geist, weight 400.
- Outlier: Geist Mono for coordinates, zoom, counts, dates, and source metadata.
- Display tracking: `-0.035em`; interface labels use `0.08em`.
- Type scale anchor: `--text-display: clamp(2.75rem, 5vw + 1rem, 5.25rem)`.

Chinese headings stay roman and use Geist's CJK fallback. No italic headings,
gradient text, or decorative all-caps paragraphs.

## Spacing

The named 4-point scale lives in `tokens.css`. App chrome is compact; research
reading surfaces use larger vertical gaps. Components use named tokens instead
of introducing new raw spacing values.

## Motion

- Easings: `--ease-out`, `--ease-in`, `--ease-in-out` from `tokens.css`.
- App pages: state crossfade, 1 px control press, panel enter only.
- Content pages: no entrance choreography; results are simply present.
- Reduced motion: opacity-only, at most 150 ms.

## Microinteractions stance

- Silent success when the changed state is already visible.
- Focus rings are immediate.
- Hover is supplementary; every action remains available by keyboard and tap.
- Search results update in place and keep the count legible.

## CTA voice

- Primary action: dark ink or signal-teal fill, squared 6 px control radius, specific verb.
- Secondary action: paper fill with a visible rule.
- Icon-only actions always carry an accessible name and 44 px touch target.

## Per-page allowances

- Map and editor pages may layer controls over the map, but only overlays use transparency.
- Observation pages use opaque paper, negative space, and rules; no glass panels.
- No page adds decorative enrichment. The map, source excerpts, and geometry are the content.

## What pages MUST share

- Mineral-teal signal colour and cool-tinted neutrals.
- Geist body + Geist Mono information register.
- Squared controls, visible rules, restrained shadow.
- Immediate focus rings, tabular numbers, and explicit loading/error states.

## What pages MAY differ on

- Map pages may be viewport-bound; research pages scroll.
- Research pages may use a larger title and a narrower reading measure.
- Editor pages may use denser tables and operational metadata.

## Exports

### tokens.css

The canonical drop-in CSS export is [`tokens.css`](./tokens.css):

```css
:root {
  --color-paper: oklch(98.2% 0.008 175);
  --color-paper-2: oklch(95.4% 0.011 175);
  --color-paper-3: oklch(91.8% 0.014 175);
  --color-ink: oklch(20% 0.018 175);
  --color-ink-2: oklch(34% 0.018 175);
  --color-muted: oklch(48% 0.014 175);
  --color-neutral: oklch(57% 0.012 175);
  --color-rule: oklch(79% 0.014 175);
  --color-rule-2: oklch(89% 0.012 175);
  --color-accent: oklch(50% 0.11 174);
  --color-accent-strong: oklch(40% 0.09 174);
  --color-accent-soft: oklch(93% 0.025 174);
  --color-accent-ink: oklch(98.2% 0.008 175);
  --color-focus: oklch(56% 0.17 174);
  --font-display: var(--font-geist-mono), ui-monospace, monospace;
  --font-body: var(--font-geist-sans), "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-outlier: var(--font-geist-mono), ui-monospace, monospace;
  --space-3xs: 0.25rem;
  --space-2xs: 0.25rem;
  --space-xs: 0.5rem;
  --space-sm: 0.75rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2.5rem;
  --space-2xl: 4rem;
  --space-3xl: 6rem;
  --space-4xl: 9rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-micro: 120ms;
  --dur-short: 220ms;
  --dur-long: 420ms;
  --radius-control: 0.375rem;
  --radius-panel: 0.5rem;
}
```

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper: oklch(98.2% 0.008 175);
  --color-paper-2: oklch(95.4% 0.011 175);
  --color-ink: oklch(20% 0.018 175);
  --color-muted: oklch(48% 0.014 175);
  --color-rule: oklch(79% 0.014 175);
  --color-accent: oklch(50% 0.11 174);
  --font-display: var(--font-geist-mono);
  --font-body: var(--font-geist-sans);
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### DTCG `tokens.json`

```json
{
  "color": {
    "paper": { "$value": "oklch(98.2% 0.008 175)", "$type": "color" },
    "ink": { "$value": "oklch(20% 0.018 175)", "$type": "color" },
    "accent": { "$value": "oklch(50% 0.11 174)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Geist Mono", "$type": "fontFamily" },
    "body": { "$value": "Geist", "$type": "fontFamily" }
  },
  "space": {
    "md": { "$value": "1rem", "$type": "dimension" }
  }
}
```

### shadcn/ui CSS variables

```css
:root {
  --background: 98.2% 0.008 175;
  --foreground: 20% 0.018 175;
  --primary: 50% 0.11 174;
  --primary-foreground: 98.2% 0.008 175;
  --muted: 91.8% 0.014 175;
  --muted-foreground: 48% 0.014 175;
  --border: 79% 0.014 175;
  --input: 79% 0.014 175;
  --ring: 56% 0.17 174;
  --radius: 0.375rem;
}
```
