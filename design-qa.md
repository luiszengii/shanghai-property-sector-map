# Design QA — 地图首页方案 3

## Comparison target

- Source visual: `/Users/lingjunzeng/.codex/generated_images/019fad16-fe80-7792-9c06-48c365393fd0/call_N4yvA2cPDR3KTmemi6utiijN.png`
- Source pixels: `1487 × 1058`
- Final desktop implementation: `/Users/lingjunzeng/.codex/visualizations/2026/07/29/019fad16-fe80-7792-9c06-48c365393fd0/design-qa/implementation-desktop-final-fit-1487x1058.png`
- Desktop CSS viewport / bitmap: `1487 × 1058`, browser viewport override, device-scale output `1:1`
- Final mobile implementation: `/Users/lingjunzeng/.codex/visualizations/2026/07/29/019fad16-fe80-7792-9c06-48c365393fd0/design-qa/implementation-mobile-final-stable-390x844.png`
- Mobile CSS viewport / bitmap: `390 × 844`, browser viewport override, device-scale output `1:1`
- Compared state: light theme, selected new-project point, right inspector open.

The source is a visual direction mock rather than a pixel contract for the current dataset. The implementation therefore preserves the real AMap base layer, real sector geometries, existing project interactions, and truthful field availability.

## Comparison evidence

- Full-view final comparison: `/Users/lingjunzeng/.codex/visualizations/2026/07/29/019fad16-fe80-7792-9c06-48c365393fd0/design-qa/comparison-desktop-final-fit.png`
- Focused inspector comparison: `/Users/lingjunzeng/.codex/visualizations/2026/07/29/019fad16-fe80-7792-9c06-48c365393fd0/design-qa/comparison-inspector-final-fit.png`
- Earlier full-view comparison: `/Users/lingjunzeng/.codex/visualizations/2026/07/29/019fad16-fe80-7792-9c06-48c365393fd0/design-qa/comparison-desktop-pass1.png`

The full-view comparison covers macrostructure, map-to-chrome balance, and visual density. A focused inspector comparison was also required because its small field typography and dividers were not reliably judgeable in the side-by-side full view.

## Required fidelity surfaces

- Fonts and typography: Geist body is retained. Heading scale and weight now match the source hierarchy closely; compact metadata remains in the existing technical register. Chinese wrapping is clean and no text is clipped in the final desktop inspector.
- Spacing and layout rhythm: the desktop uses a full-width `72px` primary toolbar without a persistent navigation rail, a centered content-width quick-filter control, central map canvas, and `360px` full-height inspector. Hairline groups replace nested cards. Contextual actions fit at the bottom of both sector and project inspectors.
- Colors and tokens: a transparent desktop topbar, warm black type, mineral teal navigation/sector signals, orange project signals, and a restrained orange verification band match the chosen direction while preserving existing semantic colors.
- Image quality and asset fidelity: the map is the real AMap canvas using the official `whitesmoke` style. Existing real marker/icon assets and Lucide icons are retained; no placeholder art, emoji, handcrafted SVG, or CSS illustration was introduced.
- Copy and content: labels are business-specific and backed by current data. Missing price, unit-type, and sales-state fields are explicitly marked as pending reviewed publication rather than fabricated to imitate the mock.

## Findings

- No actionable P0, P1, or P2 findings remain.
- P3, intentional: the source mock shows simplified pale map geometry; the implementation shows real AMap labels plus current multicolor sector states because those encode product data and cannot be replaced with decorative geometry.
- P3, intentional: the source inspector contains more fully reviewed source/status fields. The implementation uses the currently public point, address, source, verification, coordinate, and publication-scope fields and explicitly names pending fields.
- P3, development-only: the local Next.js development control may appear at the bottom-left of browser captures; it is not part of the application UI or production build.

## Comparison history

### Pass 1

- P2: the rail and inspector proportions did not match the source, the title was too small, and the result count was pushed to the far edge.
- P2: projects without private research data left the inspector visually incomplete.
- P2: two mobile topbar icon buttons lost their accessible names after labels were visually hidden.
- Fixes: aligned the rail to `112px`, inspector to `360px`, toolbars to `72/58px`, increased title scale, moved the result count into the quick-filter group, added a truthful public-data fallback/status section, and added explicit accessible names.

### Pass 2

- P2: the verification state lacked the source's orange semantic anchor.
- P2: the second inspector action was partially below the `1058px` viewport.
- Fixes: added the orange reviewed-point band, tightened section and row rhythm, and reduced inspector vertical padding until both actions were fully visible.

### Final pass

- Full and focused comparisons show the selected macrostructure, typography hierarchy, palette, field-group rhythm, and action placement without remaining P0/P1/P2 drift.
- Browser checks: desktop filter drawer open/close; new-project state; project selection; inspector close/re-focus; mobile detail; mobile filter sheet; accessible icon labels.
- Browser console warnings/errors checked: none.

### Browser annotation revision

- Requested source state: the browser-annotated desktop map at `862 × 814` and `1360 × 696`.
- Before/after comparison: `/Users/lingjunzeng/.codex/visualizations/2026/07/29/019fad16-fe80-7792-9c06-48c365393fd0/design-qa/annotation-before-after-862x814.png`
- Final compact desktop: `/Users/lingjunzeng/.codex/visualizations/2026/07/29/019fad16-fe80-7792-9c06-48c365393fd0/design-qa/annotation-after-862x814.png`
- Final wide desktop: `/Users/lingjunzeng/.codex/visualizations/2026/07/29/019fad16-fe80-7792-9c06-48c365393fd0/design-qa/annotation-after-1360x696.png`
- Final mobile regression: `/Users/lingjunzeng/.codex/visualizations/2026/07/29/019fad16-fe80-7792-9c06-48c365393fd0/design-qa/annotation-after-mobile-390x844.png`
- Measured result at `862 × 814`: rail `75px`; top logo count `0`; bottom rail count `0`; active item background transparent and box shadow none; quickbar width `378.47px`, center `468.5px`, exactly matching the map area's expected center.
- Measured result at `1360 × 696`: quickbar width remains `378.47px` instead of stretching; center `717.5px`, exactly matching the map area's expected center.
- Responsive decision: the compact rail and floating quickbar apply at the existing desktop/tablet breakpoint above `720px`; the existing mobile top actions and bottom sheet navigation remain unchanged below it.
- Interaction check: selecting “筛选” opens the drawer while retaining a color-only selected state; selecting “地图” closes it and restores the map state.
- Browser console warnings/errors checked after the revision: none.

### Browser annotation revision 2

- Requested source state: the three browser annotations at `1115 × 994`, covering the global header entries, combined filter drawer, and desktop navigation rail.
- Same-viewport baseline/implementation comparison: `/Users/lingjunzeng/.codex/visualizations/2026/07/29/019fad16-fe80-7792-9c06-48c365393fd0/design-qa/annotation-round2-before-after-862x814.png`
- Final clean desktop: `/Users/lingjunzeng/.codex/visualizations/2026/07/29/019fad16-fe80-7792-9c06-48c365393fd0/design-qa/annotation-round2-clean-1115x994.png`
- Board-boundary drawer: `/Users/lingjunzeng/.codex/visualizations/2026/07/29/019fad16-fe80-7792-9c06-48c365393fd0/design-qa/annotation-round2-sector-panel-1115x994.png`
- Life-facilities drawer: `/Users/lingjunzeng/.codex/visualizations/2026/07/29/019fad16-fe80-7792-9c06-48c365393fd0/design-qa/annotation-round2-facility-panel-1115x994.png`
- Sector contextual entry: `/Users/lingjunzeng/.codex/visualizations/2026/07/29/019fad16-fe80-7792-9c06-48c365393fd0/design-qa/annotation-round2-sector-card-1115x994.png`
- Project contextual entry: `/Users/lingjunzeng/.codex/visualizations/2026/07/29/019fad16-fe80-7792-9c06-48c365393fd0/design-qa/annotation-round2-project-card-1115x994.png`
- The persistent desktop rail is absent from the DOM. The development-only sector-editor shortcut remains available at the bottom-left.
- The header exposes only immersive mode; the global board-observation and data-explanation controls are absent. Mobile global actions likewise retain only filtering.
- “板块边界” opens only source, label, and new-project display controls. “生活设施” opens only the two facility category groups plus batch actions. Re-selecting the active quickbar item closes its drawer.
- A selected sector ends with “查看该板块观察”, linking to `/observations?q=<板块名>`; the observations route initializes its search from that query.
- A selected project ends with “查看完整楼盘资料”; map re-focus remains available immediately above it.
- Browser console warnings/errors checked after the revision: none.

### Browser annotation revision 3

- Requested source state: the two browser annotations at `1115 × 994`, covering the desktop topbar surface and product wordmark.
- Same-viewport before/after comparison: `/Users/lingjunzeng/.codex/visualizations/2026/07/29/019fad16-fe80-7792-9c06-48c365393fd0/design-qa/annotation-round3-before-after-1115x994.png`
- Final clean desktop: `/Users/lingjunzeng/.codex/visualizations/2026/07/29/019fad16-fe80-7792-9c06-48c365393fd0/design-qa/annotation-round3-after-1115x994.png`
- Measured result at `1115 × 994`: brand text `shfang`; topbar background `rgba(0, 0, 0, 0)`; all four borders resolve to `0px none`; document width matches the viewport with no horizontal overflow.
- Search and immersive-mode controls retain their own readable interaction surfaces while the map now extends visually behind the header.
- Responsive decision: the transparent full-width header applies at the existing desktop/tablet breakpoint above `720px`; the established mobile floating-header surface remains unchanged below it.
- Production build, typecheck, lint, and map-performance tests passed after the revision.

## Implementation checklist

- [x] Selected design direction implemented in the existing app
- [x] Existing map, filter, detail, immersive, observation, and data-dialog behaviors preserved
- [x] Desktop and mobile browser states verified
- [x] Typecheck, lint, production build, and map-performance tests passed
- [x] No actionable P0/P1/P2 visual findings remain

final result: passed
