import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const stylesheet = readFileSync(
  new URL("../components/SectorBoundaryEditor.module.css", import.meta.url),
  "utf8",
);

test("the desktop editor constrains the map to the viewport-height workspace", () => {
  const pageRule = stylesheet.match(/\.page\s*\{([^}]+)\}/)?.[1] ?? "";

  assert.match(pageRule, /\bheight:\s*100dvh\s*;/);
  assert.match(pageRule, /\boverflow:\s*hidden\s*;/);
});

test("the desktop sidebar gives search, list, and editor their own grid rows", () => {
  const sidebarRule = stylesheet.match(/\.sidebar\s*\{([^}]+)\}/)?.[1] ?? "";

  assert.match(sidebarRule, /\bmin-width:\s*0\s*;/);
  assert.match(
    sidebarRule,
    /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/,
  );
  assert.match(
    sidebarRule,
    /grid-template-rows:\s*auto\s+auto\s+auto\s+minmax\(120px,\s*\.7fr\)\s+minmax\(250px,\s*1\.3fr\)\s*;/,
  );
});

test("the mobile editor keeps map-first order without negative reverse overflow", () => {
  const mobileRules = stylesheet.match(
    /@media\s*\(max-width:\s*680px\)\s*\{([\s\S]+)\}\s*$/,
  )?.[1] ?? "";

  assert.doesNotMatch(mobileRules, /flex-direction:\s*column-reverse\s*;/);
  assert.match(mobileRules, /\.workspace\s*\{[^}]*flex-direction:\s*column\s*;/);
  assert.match(mobileRules, /\.mapPanel\s*\{[^}]*order:\s*-1\s*;/);
});
