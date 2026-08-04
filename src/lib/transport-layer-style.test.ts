import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
import { elevatedRoadLayerStyles, elevatedRoadStyle, metroRouteColor, resolveAmapStyleUrl, resolveTransportVisibility, transportPresentation } from "./transport-layer-style.ts";

test("keeps transit lines prominent at the city overview zoom", () => {
  const presentation = transportPresentation(10.6);

  assert.equal(presentation.showMetroLines, true);
  assert.equal(presentation.showElevatedRoads, true);
  assert.equal(presentation.showMetroStations, false);
  assert.equal(presentation.showLocalElevatedRoads, false);
  assert.ok(presentation.metroStrokeWeight >= 3);
  assert.ok(presentation.elevatedStrokeWeight >= 1.5);
  assert.ok(
    presentation.metroStrokeWeight > presentation.elevatedStrokeWeight,
  );
});

test("reveals metro stations only after the map is sufficiently close", () => {
  assert.equal(transportPresentation(11.5).showMetroStations, false);
  assert.equal(transportPresentation(13).showMetroStations, false);
  assert.equal(transportPresentation(13.2).showMetroStations, true);
  assert.equal(transportPresentation(13.2).showLocalElevatedRoads, true);
  assert.equal(transportPresentation(13.2, 14.4).showMetroStationLabels, false);
  assert.equal(transportPresentation(14.4, 14.4).showMetroStationLabels, true);
});

test("keeps metro and elevated-road visibility independent", () => {
  const presentation = transportPresentation(13.4);

  assert.deepEqual(
    resolveTransportVisibility(presentation, {
      showMetro: true,
      showElevated: false,
    }),
    {
      metroLines: true,
      metroStations: true,
      metroStationLabels: false,
      elevatedRoads: false,
      localElevatedRoads: false,
    },
  );
  assert.deepEqual(
    resolveTransportVisibility(presentation, {
      showMetro: false,
      showElevated: true,
    }),
    {
      metroLines: false,
      metroStations: false,
      metroStationLabels: false,
      elevatedRoads: true,
      localElevatedRoads: true,
    },
  );
});

test("draws elevated-road casing below a separate uninterrupted foreground", () => {
  const layers = elevatedRoadLayerStyles("urban", 3.4);

  assert.equal(layers.casing.isOutline, false);
  assert.equal(layers.foreground.isOutline, false);
  assert.ok(layers.casing.strokeWeight > layers.foreground.strokeWeight);
  assert.equal(layers.foreground.strokeColor, elevatedRoadStyle("urban").strokeColor);
});

test("accepts either a bare GeoHUB style id or a complete AMap style URL", () => {
  assert.equal(
    resolveAmapStyleUrl("example-style-id"),
    "amap://styles/example-style-id",
  );
  assert.equal(
    resolveAmapStyleUrl("amap://styles/example-style-id"),
    "amap://styles/example-style-id",
  );
  assert.equal(resolveAmapStyleUrl(undefined), "amap://styles/whitesmoke");
});

test("uses distinct metro route colors and a restrained elevated-road hierarchy", () => {
  assert.notEqual(metroRouteColor("1"), metroRouteColor("2"));
  assert.equal(metroRouteColor("unknown"), metroRouteColor("network"));
  assert.ok(
    elevatedRoadStyle("urban").strokeWeight
      > elevatedRoadStyle("expressway").strokeWeight,
  );
  assert.ok(
    elevatedRoadStyle("urban").strokeOpacity
      > elevatedRoadStyle("expressway").strokeOpacity,
  );
});
