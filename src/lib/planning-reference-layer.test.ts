import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultPlanningLayerPreferences,
  findPlanningParcelAt,
  loadPlanningParcels,
  normalizePlanningFeatureCollection,
  resolvePlanningParcelStyle,
  setPlanningLayerOpacity,
  shouldPlanningLayerOwnMapClicks,
  togglePlanningLayer,
  type PlanningParcel,
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
} from "./planning-reference-layer.ts";

test("official planning parcels expose only the approved click-detail fields", () => {
  const parcels = normalizePlanningFeatureCollection({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: 60,
        properties: {
          OBJECTID: 60,
          PLOTNUMBER: "015-1",
          LANDAREA: 9224,
          PLANLANDPROCODE: "C8",
          PLANLANDPRONAME: "商业服务业用地",
          PROJECTNAME: "淮海社区控制性详细规划",
          APPROVALNUMBER: "202531010100622",
          UNAPPROVED_INTERNAL_FIELD: "must not leak",
        },
        geometry: {
          type: "Polygon",
          coordinates: [[[121.46828, 31.2255], [121.469, 31.2255], [121.46828, 31.2255]]],
        },
      },
    ],
  });

  assert.deepEqual(parcels, [
    {
      id: "60",
      plotNumber: "015-1",
      landAreaSquareMeters: 9224,
      landUseCode: "C8",
      landUseName: "商业服务业用地",
      projectName: "淮海社区控制性详细规划",
      approvalNumber: "202531010100622",
      geometry: {
        type: "Polygon",
        coordinates: [[[121.46828, 31.2255], [121.469, 31.2255], [121.46828, 31.2255]]],
      },
    },
  ]);
});

test("an unavailable official service degrades to an empty planning layer", async () => {
  const result = await loadPlanningParcels(
    { west: 121.45, south: 31.21, east: 121.47, north: 31.23 },
    async () => {
      throw new Error("network unavailable");
    },
  );

  assert.deepEqual(result, {
    status: "unavailable",
    parcels: [],
    message: "官方规划服务暂时不可用",
  });
});

test("a full official page is followed by the next page so visible parcels are not truncated", async () => {
  const requests: string[] = [];
  const result = await loadPlanningParcels(
    { west: 121.45, south: 31.21, east: 121.47, north: 31.23 },
    async (input: string) => {
      requests.push(input);
      const offset = Number(new URL(input).searchParams.get("resultOffset") ?? 0);
      const count = offset === 0 ? 2_000 : 1;
      return new Response(JSON.stringify({
        type: "FeatureCollection",
        features: Array.from({ length: count }, (_, index) => ({
          type: "Feature",
          properties: { OBJECTID: offset + index + 1 },
          geometry: {
            type: "Polygon",
            coordinates: [[[121, 31], [122, 31], [121, 31]]],
          },
        })),
      }), { status: 200 });
    },
  );

  assert.equal(result.status, "ready");
  assert.equal(result.parcels.length, 2_001);
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[1]).searchParams.get("resultOffset"), "2000");
});

test("the planning reference layer starts off and keeps opacity in the supported range", () => {
  assert.deepEqual(defaultPlanningLayerPreferences, {
    visible: false,
    opacity: 0.42,
  });
  assert.deepEqual(togglePlanningLayer(defaultPlanningLayerPreferences), {
    visible: true,
    opacity: 0.42,
  });
  assert.deepEqual(setPlanningLayerOpacity(defaultPlanningLayerPreferences, 1.4), {
    visible: false,
    opacity: 0.8,
  });
});

test("a planning-map click resolves the parcel while respecting interior holes", () => {
  const [parcel] = normalizePlanningFeatureCollection({
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { OBJECTID: 7, PLANLANDPROCODE: "R" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [[121, 31], [122, 31], [122, 32], [121, 32], [121, 31]],
          [[121.4, 31.4], [121.6, 31.4], [121.6, 31.6], [121.4, 31.6], [121.4, 31.4]],
        ],
      },
    }],
  });

  assert.equal(findPlanningParcelAt([parcel], [121.2, 31.2])?.id, "7");
  assert.equal(findPlanningParcelAt([parcel], [121.5, 31.5]), null);
  assert.equal(findPlanningParcelAt([parcel], [123, 33]), null);
});

test("planning parcels own map clicks only after the official layer reaches Z14", () => {
  assert.equal(shouldPlanningLayerOwnMapClicks(false, 14), false);
  assert.equal(shouldPlanningLayerOwnMapClicks(true, 13.9), false);
  assert.equal(shouldPlanningLayerOwnMapClicks(true, 14), true);
  assert.equal(shouldPlanningLayerOwnMapClicks(true, 16), true);
});

test("planning parcels use distinct theme colors for visible land-use families", () => {
  const parcel = (landUseCode: string | null, landUseName: string | null): PlanningParcel => ({
    id: `${landUseCode}-${landUseName}`,
    plotNumber: null,
    landAreaSquareMeters: null,
    landUseCode,
    landUseName,
    projectName: null,
    approvalNumber: null,
    geometry: {
      type: "Polygon",
      coordinates: [[[121, 31], [122, 31], [121, 31]]],
    },
  });

  assert.deepEqual(resolvePlanningParcelStyle(parcel("R2", "二类居住用地")), {
    category: "residential",
    label: "居住",
    fillColor: "#f97316",
    strokeColor: "#9a3412",
  });
  assert.deepEqual(resolvePlanningParcelStyle(parcel("C8", "商业服务业用地")), {
    category: "commercial",
    label: "商业",
    fillColor: "#db2777",
    strokeColor: "#9d174d",
  });
  assert.deepEqual(resolvePlanningParcelStyle(parcel("A1", "公共管理与公共服务用地")), {
    category: "public-service",
    label: "公服",
    fillColor: "#7c3aed",
    strokeColor: "#5b21b6",
  });
  assert.deepEqual(resolvePlanningParcelStyle(parcel(null, "公园绿地")), {
    category: "green-space",
    label: "绿地",
    fillColor: "#16a34a",
    strokeColor: "#166534",
  });
});
