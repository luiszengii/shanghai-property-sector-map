# Project detail design QA

- Source: `/var/folders/y1/8hrdxh5n37bbkmp0qj75fhbc0000gn/T/codex-clipboard-6418e4ec-b8d1-4ac3-bf00-e64402c020ce.png`
- Implementation: `http://localhost:3000/projects/project_虹桥融景`
- Desktop viewport: 1487 × 1058
- Desktop screenshot: `/Users/lingjunzeng/.codex/visualizations/2026/07/27/019fa1a7-52d3-7760-8170-4eeb0f69c4bf/project-detail-desktop-v2.png`
- Mobile viewport: 390 × 844
- Mobile screenshot: `/Users/lingjunzeng/.codex/visualizations/2026/07/27/019fa1a7-52d3-7760-8170-4eeb0f69c4bf/project-detail-mobile.png`
- Full comparison: `/Users/lingjunzeng/.codex/visualizations/2026/07/27/019fa1a7-52d3-7760-8170-4eeb0f69c4bf/project-detail-comparison.png`
- Focused comparison: not required; the full-width comparison exposes all shared layout regions.

## Findings

- P0: none.
- P1: the first browser pass exposed a 404 for URL-encoded Chinese project IDs. The route now decodes the dynamic segment before project lookup.
- P1: the local-research banner appeared above the public page and shifted the composition. The page-specific selector now hides it.
- P2: the implementation is intentionally less dense below the fold because unverified price, timeline, floorplan, building and facility records are shown as pending states instead of copied sample content.
- P2: the map area uses an explicit no-key fallback locally; the frame, location status and external map action retain the reference hierarchy.

## Comparison history

1. Initial desktop capture: route returned 404.
2. Desktop v1: route rendered; local-research banner was still visible.
3. Desktop v2: banner removed, reference-aligned panel grid and visual hierarchy confirmed.
4. Mobile: stacked layout confirmed at 390 px with no horizontal overflow.

## Interaction and runtime checks

- Return-to-map link is present once with the stable destination `/`.
- Source links remain explicit external links.
- Desktop and mobile console checks returned no warnings or errors.
- Mobile document width equals viewport width (390 px).

final result: passed
