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

test("the mobile editor keeps map-first order without negative reverse overflow", () => {
  const mobileRules = stylesheet.match(
    /@media\s*\(max-width:\s*680px\)\s*\{([\s\S]+)\}\s*$/,
  )?.[1] ?? "";

  assert.doesNotMatch(mobileRules, /flex-direction:\s*column-reverse\s*;/);
  assert.match(mobileRules, /\.workspace\s*\{[^}]*flex-direction:\s*column\s*;/);
  assert.match(mobileRules, /\.mapPanel\s*\{[^}]*order:\s*-1\s*;/);
});
