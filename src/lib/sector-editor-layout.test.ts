import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const stylesheet = readFileSync(
  new URL("../components/SectorBoundaryEditor.module.css", import.meta.url),
  "utf8",
);
const componentSource = readFileSync(
  new URL("../components/SectorBoundaryEditor.tsx", import.meta.url),
  "utf8",
);

test("the desktop editor constrains the map to the viewport-height workspace", () => {
  const pageRule = stylesheet.match(/\.page\s*\{([^}]+)\}/)?.[1] ?? "";

  assert.match(pageRule, /\bheight:\s*100dvh\s*;/);
  assert.match(pageRule, /\boverflow:\s*hidden\s*;/);
});

test("the desktop sidebar reserves its flexible final row for the sector list", () => {
  const sidebarRule = stylesheet.match(/\.sidebar\s*\{([^}]+)\}/)?.[1] ?? "";

  assert.match(sidebarRule, /\bmin-width:\s*0\s*;/);
  assert.match(
    sidebarRule,
    /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/,
  );
  assert.match(
    sidebarRule,
    /grid-template-rows:\s*auto\s+auto\s+auto\s+auto\s+minmax\(0,\s*1fr\)\s*;/,
  );

  const draftListRule =
    stylesheet.match(/\.draftList\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(draftListRule, /\bgrid-row:\s*-2\s*\/\s*-1\s*;/);
});

test("the selected sector details render as a floating panel over the map", () => {
  const sidebarStart = componentSource.indexOf(
    "<aside className={styles.sidebar}>",
  );
  const mapPanelStart = componentSource.indexOf(
    "<div className={styles.mapPanel}",
  );
  const detailPanelStart = componentSource.indexOf(
    "className={styles.detailFloat}",
  );

  assert.ok(sidebarStart >= 0);
  assert.ok(mapPanelStart > sidebarStart);
  assert.ok(detailPanelStart > mapPanelStart);
  assert.match(
    componentSource.slice(detailPanelStart),
    /<div key=\{activeDraft\.id\} className=\{styles\.form\}>/,
  );
  assert.match(
    componentSource.slice(detailPanelStart),
    /onWheel=\{\(event\) => event\.stopPropagation\(\)\}/,
  );

  const detailRule =
    stylesheet.match(/\.detailFloat\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(detailRule, /\bposition:\s*absolute\s*;/);
  assert.match(detailRule, /\bright:\s*var\(--space-md\)\s*;/);
  assert.match(detailRule, /\bbottom:\s*var\(--space-md\)\s*;/);
  assert.match(detailRule, /\boverflow-y:\s*auto\s*;/);
});

test("the mobile editor keeps map-first order without negative reverse overflow", () => {
  const mobileRules = stylesheet.match(
    /@media\s*\(max-width:\s*680px\)\s*\{([\s\S]+)\}\s*$/,
  )?.[1] ?? "";

  assert.doesNotMatch(mobileRules, /flex-direction:\s*column-reverse\s*;/);
  assert.match(mobileRules, /\.workspace\s*\{[^}]*flex-direction:\s*column\s*;/);
  assert.match(mobileRules, /\.mapPanel\s*\{[^}]*order:\s*-1\s*;/);
});
