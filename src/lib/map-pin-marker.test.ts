import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
import { mapPinMarkerContent } from "./map-pin-marker.ts";

test("renders project and metro station pins with the same marker and pin primitives", () => {
  const project = mapPinMarkerContent({
    ariaLabel: "示范楼盘",
    iconSvg: "<svg>house</svg>",
    variantClass: "project-pin-variant",
  });
  const metro = mapPinMarkerContent({
    ariaLabel: "人民广场",
    iconSvg: "<svg>train</svg>",
    variantClass: "metro-station-marker",
  });

  for (const content of [project, metro]) {
    assert.match(content, /class="project-marker/);
    assert.match(content, /class="project-pin/);
  }
  assert.match(metro, /aria-label="人民广场"/);
  assert.match(metro, /metro-station-marker/);
});
