import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSectorDraftFeatureCollection,
  createDraftFromExistingSector,
  createSectorDraft,
  draftHoles,
  draftParts,
  findDirtyLinkedTopologyGroups,
  fingerprintDraftParts,
  fingerprintDraftRing,
  isCompleteSectorDraft,
  normalizeAmapPolygonGeometry,
  normalizeAmapPolygonRing,
  normalizeAmapPolygonParts,
  parseSectorEditorState,
  parseSectorDraftFeatureCollection,
  serializeSectorEditorState,
  syncUntouchedDraftsToCurrentTemplates,
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
} from "./sector-editor-drafts.ts";
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
import { mapZoomDeltaForShortcut } from "./map-keyboard-shortcuts.ts";

test("exported sector drafts are closed GCJ-02 polygons with an explicit warning", () => {
  const draft = {
    ...createSectorDraft("sector-test", "2026-07-23T08:00:00.000Z"),
    name: "测试板块",
    ring: [
      [121.4, 31.2],
      [121.5, 31.2],
      [121.5, 31.3],
    ] as [number, number][],
  };

  const collection = buildSectorDraftFeatureCollection([draft], "2026-07-23T09:00:00.000Z");

  assert.equal(collection.metadata.coordinateSystem, "GCJ-02");
  assert.match(collection.metadata.warning, /非行政区/);
  assert.deepEqual(collection.features[0].geometry.coordinates[0], [
    [121.4, 31.2],
    [121.5, 31.2],
    [121.5, 31.3],
    [121.4, 31.2],
  ]);
});

test("an editor export can be imported without keeping the closing coordinate twice", () => {
  const draft = {
    ...createSectorDraft("sector-roundtrip", "2026-07-23T08:00:00.000Z"),
    name: "往返测试",
    ring: [
      [121.1, 31.1],
      [121.2, 31.1],
      [121.2, 31.2],
    ] as [number, number][],
  };
  const collection = buildSectorDraftFeatureCollection([draft]);

  const imported = parseSectorDraftFeatureCollection(collection);

  assert.equal(imported.length, 1);
  assert.equal(imported[0].ring.length, 3);
  assert.deepEqual(imported[0].ring[0], [121.1, 31.1]);
});

test("multi-part drafts export and import without dropping detached polygons", () => {
  const draft = {
    ...createSectorDraft("sector-multipart", "2026-07-23T08:00:00.000Z"),
    name: "多分片板块",
    ring: [[121.1, 31.1], [121.2, 31.1], [121.2, 31.2]] as [number, number][],
    additionalRings: [
      [[121.3, 31.3], [121.4, 31.3], [121.4, 31.4]],
      [[121.5, 31.5], [121.6, 31.5], [121.6, 31.6]],
    ] as [number, number][][],
  };

  const collection = buildSectorDraftFeatureCollection([draft]);
  assert.equal(collection.features[0].geometry.type, "MultiPolygon");
  assert.equal(collection.features[0].geometry.coordinates.length, 3);

  const [restored] = parseSectorDraftFeatureCollection(collection);
  assert.equal(draftParts(restored).length, 3);
  assert.deepEqual(draftParts(restored), draftParts(draft));
});

test("polygon holes survive editor export and import", () => {
  const draft = {
    ...createSectorDraft("sector-with-hole"),
    name: "带扣除区板块",
    ring: [[121.1, 31.1], [121.3, 31.1], [121.3, 31.3], [121.1, 31.3]] as [number, number][],
    holes: [
      [[121.15, 31.15], [121.15, 31.2], [121.2, 31.2], [121.2, 31.15]],
    ] as [number, number][][],
  };

  const collection = buildSectorDraftFeatureCollection([draft]);
  assert.equal(collection.features[0].geometry.type, "Polygon");
  assert.equal(collection.features[0].geometry.coordinates.length, 2);

  const [restored] = parseSectorDraftFeatureCollection(collection);
  assert.deepEqual(restored.ring, draft.ring);
  assert.deepEqual(draftHoles(restored), draft.holes);
});

test("holes in every multi-polygon part survive editor export and import", () => {
  const draft = {
    ...createSectorDraft("sector-multipart-with-holes"),
    name: "多分片带扣除区",
    ring: [[121.1, 31.1], [121.3, 31.1], [121.3, 31.3]] as [number, number][],
    additionalRings: [
      [[121.4, 31.4], [121.7, 31.4], [121.7, 31.7]],
    ] as [number, number][][],
    additionalHoles: [
      [
        [[121.5, 31.5], [121.6, 31.5], [121.6, 31.6]],
      ],
    ] as [number, number][][][],
  };

  const collection = buildSectorDraftFeatureCollection([draft]);
  assert.equal(collection.features[0].geometry.type, "MultiPolygon");
  assert.equal(collection.features[0].geometry.coordinates[1].length, 2);

  const [restored] = parseSectorDraftFeatureCollection(collection);
  assert.deepEqual(restored.additionalHoles, draft.additionalHoles);
  assert.deepEqual(
    buildSectorDraftFeatureCollection([restored]).features[0].geometry,
    collection.features[0].geometry,
  );
});

test("import rejects files without an explicit GCJ-02 coordinate system", () => {
  assert.throws(
    () => parseSectorDraftFeatureCollection({
      type: "FeatureCollection",
      metadata: { schemaVersion: 1 },
      features: [],
    }),
    /坐标系不是 GCJ-02/,
  );
});

test("an unfinished local draft survives browser-storage serialization", () => {
  const draft = {
    ...createSectorDraft("sector-in-progress", "2026-07-23T08:00:00.000Z"),
    name: "画到一半",
    ring: [[121.4, 31.2]] as [number, number][],
  };

  const restored = parseSectorEditorState(serializeSectorEditorState([draft]));

  assert.equal(restored[0].name, "画到一半");
  assert.deepEqual(restored[0].ring, [[121.4, 31.2]]);
});

test("AMap polygon paths work whether the outer ring is direct or nested", () => {
  const direct = [[121.4, 31.2], [121.5, 31.2], [121.5, 31.3]];
  const nested = [direct];

  assert.deepEqual(normalizeAmapPolygonRing(direct), direct);
  assert.deepEqual(normalizeAmapPolygonRing(nested), direct);
});

test("AMap multi-polygon paths preserve every exterior part", () => {
  const parts = normalizeAmapPolygonParts([
    [[[121.1, 31.1], [121.2, 31.1], [121.2, 31.2]]],
    [[[121.3, 31.3], [121.4, 31.3], [121.4, 31.4]]],
  ]);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts[1][0], [121.3, 31.3]);
});

test("AMap polygon paths preserve interior holes separately from detached parts", () => {
  const geometry = normalizeAmapPolygonGeometry([
    [[121.1, 31.1], [121.3, 31.1], [121.3, 31.3]],
    [[121.15, 31.15], [121.2, 31.15], [121.2, 31.2]],
  ]);

  assert.equal(geometry.ring.length, 3);
  assert.equal(geometry.holes?.length, 1);
  assert.deepEqual(geometry.holes?.[0][0], [121.15, 31.15]);
  assert.deepEqual(geometry.additionalRings, []);
});

test("AMap multi-polygon paths preserve holes for detached parts", () => {
  const geometry = normalizeAmapPolygonGeometry([
    [
      [[121.1, 31.1], [121.3, 31.1], [121.3, 31.3]],
    ],
    [
      [[121.4, 31.4], [121.7, 31.4], [121.7, 31.7]],
      [[121.5, 31.5], [121.6, 31.5], [121.6, 31.6]],
    ],
  ]);

  assert.equal(geometry.additionalRings?.length, 1);
  assert.equal(geometry.additionalHoles?.[0]?.length, 1);
  assert.deepEqual(geometry.additionalHoles?.[0]?.[0]?.[0], [121.5, 31.5]);
});

test("a drawn polygon still needs a real sector name before export", () => {
  const draft = {
    ...createSectorDraft("sector-unnamed"),
    ring: [[121.4, 31.2], [121.5, 31.2], [121.5, 31.3]] as [number, number][],
  };

  assert.equal(isCompleteSectorDraft(draft), false);
  assert.equal(buildSectorDraftFeatureCollection([draft]).features.length, 0);
});

test("Control or Command plus/minus maps to one map zoom step", () => {
  assert.equal(mapZoomDeltaForShortcut({ key: "=", ctrlKey: true }), 1);
  assert.equal(mapZoomDeltaForShortcut({ key: "+", ctrlKey: true }), 1);
  assert.equal(mapZoomDeltaForShortcut({ key: "-", ctrlKey: true }), -1);
  assert.equal(mapZoomDeltaForShortcut({ key: "_", metaKey: true }), -1);
  assert.equal(mapZoomDeltaForShortcut({ key: "=", ctrlKey: false, metaKey: false }), null);
  assert.equal(mapZoomDeltaForShortcut({ key: "-", ctrlKey: true, altKey: true }), null);
});

test("an existing sector becomes an editable copy without changing its identity", () => {
  const draft = createDraftFromExistingSector({
    id: "sector-qiantan",
    name: "前滩",
    district: "浦东新区",
    boundaryBasis: "沿主要道路与水系",
    note: "从当前地图载入",
    geometryStatus: "candidate",
    geometryFingerprint: "candidate-v1",
    ring: [[121.4, 31.1], [121.5, 31.1], [121.5, 31.2]],
  }, "2026-07-23T10:00:00.000Z");

  assert.equal(draft.id, "sector-qiantan");
  assert.equal(draft.sourceSectorId, "sector-qiantan");
  assert.equal(draft.coordinateSystem, "GCJ-02");
  assert.deepEqual(draft.ring, [[121.4, 31.1], [121.5, 31.1], [121.5, 31.2]]);

  const restored = parseSectorEditorState(serializeSectorEditorState([draft]));
  assert.equal(restored[0].sourceSectorId, "sector-qiantan");
  assert.equal(
    buildSectorDraftFeatureCollection(restored).features[0].properties.sourceSectorId,
    "sector-qiantan",
  );
});

test("linked difference sectors require explicit topology review after either draft changes", () => {
  const outerRing = [
    [121.4, 31.2],
    [121.5, 31.2],
    [121.5, 31.3],
  ] as [number, number][];
  const liangwancheng = createDraftFromExistingSector({
    id: "sector_zhongyuanliangwancheng",
    name: "中远两湾城",
    district: "普陀区",
    boundaryBasis: "五个项目用地面",
    note: "",
    geometryStatus: "candidate",
    geometryFingerprint: fingerprintDraftParts([outerRing]),
    linkedTopologySectorIds: ["sector_ganquanyichuan"],
    ring: outerRing,
  });
  const ganquanYichuan = createDraftFromExistingSector({
    id: "sector_ganquanyichuan",
    name: "甘泉宜川",
    district: "普陀区",
    boundaryBasis: "行政并集差集",
    note: "",
    geometryStatus: "candidate",
    geometryFingerprint: fingerprintDraftParts([outerRing]),
    linkedTopologySectorIds: ["sector_zhongyuanliangwancheng"],
    ring: outerRing,
  });

  assert.deepEqual(
    findDirtyLinkedTopologyGroups([liangwancheng, ganquanYichuan]),
    [],
  );

  liangwancheng.ring = [...liangwancheng.ring, [121.4, 31.3]];
  assert.deepEqual(
    findDirtyLinkedTopologyGroups([liangwancheng, ganquanYichuan]),
    [{
      sectorIds: ["sector_ganquanyichuan", "sector_zhongyuanliangwancheng"],
      dirtySectorIds: ["sector_zhongyuanliangwancheng"],
    }],
  );
});

test("an existing local copy receives newly added linked-topology metadata", () => {
  const ring = [
    [121.4, 31.2],
    [121.5, 31.2],
    [121.5, 31.3],
  ] as [number, number][];
  const template = {
    id: "sector_zhongyuanliangwancheng",
    name: "中远两湾城",
    district: "普陀区",
    boundaryBasis: "五个项目用地面",
    note: "",
    geometryStatus: "candidate" as const,
    geometryFingerprint: fingerprintDraftParts([ring]),
    linkedTopologySectorIds: ["sector_ganquanyichuan"],
    ring,
  };
  const legacyLocalDraft = {
    ...createDraftFromExistingSector(template),
    linkedTopologySectorIds: undefined,
  };

  const synced = syncUntouchedDraftsToCurrentTemplates(
    [legacyLocalDraft],
    [template],
  );

  assert.deepEqual(
    synced.drafts[0].linkedTopologySectorIds,
    ["sector_ganquanyichuan"],
  );
});

test("a modified sector reports each affected shared-edge pair separately", () => {
  const ring = [
    [121.4, 31.2],
    [121.5, 31.2],
    [121.5, 31.3],
  ] as [number, number][];
  const makeLinkedDraft = (id: string, linkedTopologySectorIds: string[]) => (
    createDraftFromExistingSector({
      id,
      name: id,
      district: "宝山区",
      boundaryBasis: "同名行政骨架",
      note: "",
      geometryStatus: "candidate",
      geometryFingerprint: fingerprintDraftParts([ring]),
      linkedTopologySectorIds,
      ring,
    })
  );
  const gucun = makeLinkedDraft(
    "sector_gucun",
    ["sector_zhangmiao", "sector_yanghang"],
  );
  const zhangmiao = makeLinkedDraft("sector_zhangmiao", ["sector_gucun"]);
  const yanghang = makeLinkedDraft("sector_yanghang", ["sector_gucun"]);
  gucun.ring = [...gucun.ring, [121.4, 31.3]];

  assert.deepEqual(
    findDirtyLinkedTopologyGroups([gucun, zhangmiao, yanghang]),
    [
      {
        sectorIds: ["sector_gucun", "sector_zhangmiao"],
        dirtySectorIds: ["sector_gucun"],
      },
      {
        sectorIds: ["sector_gucun", "sector_yanghang"],
        dirtySectorIds: ["sector_gucun"],
      },
    ],
  );
});

test("an untouched local copy follows a newer high-precision source without overwriting user edits", () => {
  const oldDraft = {
    ...createDraftFromExistingSector({
      id: "sector-gumei",
      name: "古美",
      district: "闵行区",
      boundaryBasis: "旧演示面",
      note: "旧边界",
      geometryStatus: "demo",
      geometryFingerprint: "old-demo",
      ring: [[121.3, 31.1], [121.4, 31.1], [121.4, 31.2]],
    }, "2026-07-23T10:00:00.000Z"),
    sourceGeometryFingerprint: undefined,
  };
  const currentTemplate = {
    id: "sector-gumei",
    name: "古美",
    district: "闵行区",
    boundaryBasis: "高精度行政参考面",
    note: "当前边界",
    geometryStatus: "candidate" as const,
    geometryFingerprint: "admin-reference-v2",
    previousGeometryFingerprints: [fingerprintDraftRing(oldDraft.ring)],
    ring: [[121.35, 31.15], [121.45, 31.15], [121.45, 31.25]] as [number, number][],
  };

  const synced = syncUntouchedDraftsToCurrentTemplates([oldDraft], [currentTemplate]);
  assert.deepEqual(synced.drafts[0].ring, currentTemplate.ring);
  assert.equal(synced.drafts[0].sourceGeometryFingerprint, "admin-reference-v2");
  assert.deepEqual(synced.preservedModifiedSourceIds, []);

  const editedDraft = {
    ...oldDraft,
    ring: [[121.31, 31.11], [121.41, 31.11], [121.41, 31.21]] as [number, number][],
  };
  const preserved = syncUntouchedDraftsToCurrentTemplates([editedDraft], [currentTemplate]);
  assert.deepEqual(preserved.drafts[0].ring, editedDraft.ring);
  assert.deepEqual(preserved.preservedModifiedSourceIds, ["sector-gumei"]);
});

test("an untouched exterior-only copy upgrades when the source gains a protected hole", () => {
  const outerRing = [
    [121.1, 31.1],
    [121.3, 31.1],
    [121.3, 31.3],
    [121.1, 31.3],
  ] as [number, number][];
  const hole = [
    [121.15, 31.15],
    [121.15, 31.2],
    [121.2, 31.2],
    [121.2, 31.15],
  ] as [number, number][];
  const exteriorFingerprint = fingerprintDraftParts([outerRing]);
  const draft = createDraftFromExistingSector({
    id: "sector-hongqiao-residential",
    name: "虹桥",
    district: "长宁区",
    boundaryBasis: "旧外环",
    note: "旧副本",
    geometryStatus: "candidate",
    geometryFingerprint: exteriorFingerprint,
    ring: outerRing,
  });
  const template = {
    id: "sector-hongqiao-residential",
    name: "虹桥",
    district: "长宁区",
    boundaryBasis: "虹桥街道扣除古北",
    note: "当前候选",
    geometryStatus: "candidate" as const,
    geometryFingerprint: fingerprintDraftParts([outerRing, hole]),
    previousGeometryFingerprints: [exteriorFingerprint],
    ring: outerRing,
    holes: [hole],
  };

  const synced = syncUntouchedDraftsToCurrentTemplates([draft], [template]);
  assert.deepEqual(draftHoles(synced.drafts[0]), [hole]);
  assert.equal(
    synced.drafts[0].sourceGeometryFingerprint,
    template.geometryFingerprint,
  );
  assert.deepEqual(synced.updatedSourceIds, ["sector-hongqiao-residential"]);
});

test("an untouched retired Yangsi Qiantan default resets to the independent Qiantan template", () => {
  const legacyDefaultRing = [
    [121.4, 31.1],
    [121.5, 31.1],
    [121.5, 31.2],
  ] as [number, number][];
  const legacyDefaultFingerprint = fingerprintDraftRing(legacyDefaultRing);
  const untouchedLegacyDraft = createDraftFromExistingSector({
    id: "sector_qiantan",
    name: "杨思前滩",
    district: "浦东新区",
    boundaryBasis: "旧合并口径",
    note: "旧默认边界",
    geometryStatus: "candidate",
    geometryFingerprint: legacyDefaultFingerprint,
    ring: legacyDefaultRing,
  });
  const editedLegacyDraft = {
    ...createDraftFromExistingSector({
      id: "sector_qiantan",
      name: "前滩",
      district: "浦东新区",
      boundaryBasis: "候选四至：北川杨河、东春塘河、南中环路—华夏西路、西黄浦江",
      note: "用户已经拖动过边界",
      geometryStatus: "candidate",
      geometryFingerprint: "ring-182-810406e2",
      ring: [[121.4, 31.1], [121.5, 31.1], [121.5, 31.2]],
    }),
    ring: [[121.41, 31.11], [121.51, 31.11], [121.51, 31.21]] as [number, number][],
  };
  const currentTemplate = {
    id: "sector_qiantan",
    name: "前滩",
    district: "浦东新区",
    boundaryBasis: "独立前滩口径",
    note: "当前边界",
    geometryStatus: "candidate" as const,
    geometryFingerprint: "current-source",
    previousGeometryFingerprints: [],
    ring: [[121.45, 31.15], [121.55, 31.15], [121.55, 31.25]] as [number, number][],
  };

  const synced = syncUntouchedDraftsToCurrentTemplates(
    [untouchedLegacyDraft],
    [currentTemplate],
  );

  assert.equal(synced.drafts[0].name, "前滩");
  assert.equal(synced.drafts[0].boundaryBasis, "独立前滩口径");
  assert.deepEqual(synced.drafts[0].ring, currentTemplate.ring);
  assert.equal(synced.drafts[0].sourceGeometryFingerprint, "current-source");
  assert.deepEqual(synced.updatedSourceIds, ["sector_qiantan"]);
  assert.deepEqual(synced.preservedModifiedSourceIds, []);

  const editedSynced = syncUntouchedDraftsToCurrentTemplates(
    [editedLegacyDraft],
    [currentTemplate],
  );
  assert.equal(editedSynced.drafts[0].name, "前滩");
  assert.deepEqual(editedSynced.drafts[0].ring, currentTemplate.ring);
  assert.equal(editedSynced.drafts[1].name, "前滩（旧合并草稿备份）");
  assert.equal(editedSynced.drafts[1].archived, true);
  assert.deepEqual(editedSynced.drafts[1].ring, editedLegacyDraft.ring);
  assert.equal(editedSynced.drafts[1].note, "用户已经拖动过边界");
  assert.deepEqual(editedSynced.updatedSourceIds, ["sector_qiantan"]);
  assert.deepEqual(editedSynced.archivedDraftIds, [editedSynced.drafts[1].id]);

  const fingerprintlessLegacyDraft = {
    ...editedLegacyDraft,
    sourceGeometryFingerprint: undefined,
  };
  const fingerprintlessSynced = syncUntouchedDraftsToCurrentTemplates(
    [fingerprintlessLegacyDraft],
    [currentTemplate],
  );
  assert.deepEqual(fingerprintlessSynced.drafts[0].ring, currentTemplate.ring);
  assert.equal(fingerprintlessSynced.drafts[1].archived, true);
  assert.equal(fingerprintlessSynced.drafts[1].referenceOnly, true);
  assert.deepEqual(fingerprintlessSynced.drafts[1].ring, fingerprintlessLegacyDraft.ring);
  assert.deepEqual(fingerprintlessSynced.updatedSourceIds, ["sector_qiantan"]);
  assert.deepEqual(
    fingerprintlessSynced.archivedDraftIds,
    [fingerprintlessSynced.drafts[1].id],
  );
});

test("a modified draft still named Yangsi Qiantan cannot override the independent sectors", () => {
  const legacyCombinedDraft = {
    ...createDraftFromExistingSector({
      id: "sector_qiantan",
      name: "杨思前滩",
      district: "浦东新区",
      boundaryBasis: "旧合并口径",
      note: "用户修改过的旧合并草稿",
      geometryStatus: "candidate",
      geometryFingerprint: "ring-182-810406e2",
      ring: [[121.4, 31.1], [121.5, 31.1], [121.5, 31.2]],
    }),
    ring: [[121.41, 31.11], [121.51, 31.11], [121.51, 31.21]] as [number, number][],
  };
  const currentQiantanTemplate = {
    id: "sector_qiantan",
    name: "前滩",
    district: "浦东新区",
    boundaryBasis: "独立前滩口径",
    note: "当前前滩边界",
    geometryStatus: "candidate" as const,
    geometryFingerprint: "current-qiantan-source",
    previousGeometryFingerprints: [],
    ring: [[121.45, 31.15], [121.55, 31.15], [121.55, 31.25]] as [number, number][],
  };

  const synced = syncUntouchedDraftsToCurrentTemplates(
    [legacyCombinedDraft],
    [currentQiantanTemplate],
  );

  assert.equal(synced.drafts[0].name, "前滩");
  assert.equal(synced.drafts[0].boundaryBasis, "独立前滩口径");
  assert.deepEqual(synced.drafts[0].ring, currentQiantanTemplate.ring);
  assert.equal(
    synced.drafts[0].sourceGeometryFingerprint,
    currentQiantanTemplate.geometryFingerprint,
  );
  assert.deepEqual(synced.updatedSourceIds, ["sector_qiantan"]);
  assert.deepEqual(synced.preservedModifiedSourceIds, []);
  assert.equal(synced.drafts[1].name, "杨思前滩（旧合并草稿备份）");
  assert.equal(synced.drafts[1].sourceSectorId, undefined);
  assert.equal(synced.drafts[1].archived, true);
  assert.equal(synced.drafts[1].referenceOnly, true);
  assert.deepEqual(synced.drafts[1].ring, legacyCombinedDraft.ring);
  assert.deepEqual(synced.archivedDraftIds, [synced.drafts[1].id]);
});

test("drafts for removed sector identities are archived and cannot be exported", () => {
  const modifiedLianyangDraft = {
    ...createDraftFromExistingSector({
      id: "sector_lianyang",
      name: "联洋",
      district: "浦东新区",
      boundaryBasis: "旧联洋代理面",
      note: "用户手工调整过东侧边界",
      geometryStatus: "candidate",
      geometryFingerprint: "old-lianyang-source",
      ring: [[121.54, 31.22], [121.58, 31.22], [121.58, 31.25]],
    }),
    ring: [[121.541, 31.221], [121.581, 31.221], [121.581, 31.251]] as [number, number][],
  };

  const synced = syncUntouchedDraftsToCurrentTemplates(
    [modifiedLianyangDraft],
    [],
  );

  assert.equal(synced.drafts.length, 1);
  assert.equal(synced.drafts[0].name, "联洋（已下线草稿备份）");
  assert.equal(synced.drafts[0].sourceSectorId, undefined);
  assert.equal(synced.drafts[0].archived, true);
  assert.equal(synced.drafts[0].referenceOnly, true);
  assert.match(synced.drafts[0].note, /仅作只读历史参考/);
  assert.deepEqual(synced.archivedDraftIds, [synced.drafts[0].id]);
  assert.equal(buildSectorDraftFeatureCollection(synced.drafts).features.length, 0);
});

test("a historical Minhang Jinhui draft is retained as a read-only archive", () => {
  const historicalDraft = createDraftFromExistingSector({
    id: "sector_minhangjinhui",
    name: "闵行金汇",
    district: "闵行区",
    boundaryBasis: "历史人工起画",
    note: "身份下线前的本机草稿",
    geometryStatus: "candidate",
    geometryFingerprint: "historical-minhang-jinhui",
    ring: [[121.36, 31.17], [121.39, 31.17], [121.39, 31.19]],
  });

  const synced = syncUntouchedDraftsToCurrentTemplates([historicalDraft], []);

  assert.equal(synced.drafts.length, 1);
  assert.equal(synced.drafts[0].name, "闵行金汇（已下线草稿备份）");
  assert.equal(synced.drafts[0].sourceSectorId, undefined);
  assert.equal(synced.drafts[0].archived, true);
  assert.equal(synced.drafts[0].referenceOnly, true);
  assert.deepEqual(synced.archivedDraftIds, [synced.drafts[0].id]);
  assert.equal(buildSectorDraftFeatureCollection(synced.drafts).features.length, 0);
});

test("a historical Meiyuan seed is retained as a read-only archive", () => {
  const historicalDraft = createDraftFromExistingSector({
    id: "sector_meiyuan",
    name: "梅园",
    district: "浦东新区",
    boundaryBasis: "历史覆盖性编辑种子",
    note: "身份下线前由编辑器自动带入",
    geometryStatus: "candidate",
    geometryFingerprint: "historical-meiyuan-seed",
    ring: [[121.5, 31.23], [121.53, 31.23], [121.53, 31.25]],
  });

  const synced = syncUntouchedDraftsToCurrentTemplates([historicalDraft], []);

  assert.equal(synced.drafts.length, 1);
  assert.equal(synced.drafts[0].name, "梅园（已下线草稿备份）");
  assert.equal(synced.drafts[0].sourceSectorId, undefined);
  assert.equal(synced.drafts[0].archived, true);
  assert.equal(synced.drafts[0].referenceOnly, true);
  assert.deepEqual(synced.archivedDraftIds, [synced.drafts[0].id]);
  assert.equal(buildSectorDraftFeatureCollection(synced.drafts).features.length, 0);
});

test("a historical Nanda planning proxy is retained as a read-only archive", () => {
  const historicalDraft = createDraftFromExistingSector({
    id: "sector_nanda",
    name: "南大",
    district: "宝山区、普陀区",
    boundaryBasis: "历史 W12-1301 规划参考代理",
    note: "身份下线前由编辑器自动带入",
    geometryStatus: "candidate",
    geometryFingerprint: "historical-nanda-planning-proxy",
    ring: [[121.36, 31.3], [121.4, 31.3], [121.4, 31.32]],
  });

  const synced = syncUntouchedDraftsToCurrentTemplates([historicalDraft], []);

  assert.equal(synced.drafts.length, 1);
  assert.equal(synced.drafts[0].name, "南大（已下线草稿备份）");
  assert.equal(synced.drafts[0].sourceSectorId, undefined);
  assert.equal(synced.drafts[0].archived, true);
  assert.equal(synced.drafts[0].referenceOnly, true);
  assert.deepEqual(synced.archivedDraftIds, [synced.drafts[0].id]);
  assert.equal(buildSectorDraftFeatureCollection(synced.drafts).features.length, 0);
});

test("a historical Suhewan functional proxy is retained as a read-only archive", () => {
  const historicalDraft = createDraftFromExistingSector({
    id: "sector_suhewan",
    name: "苏河湾",
    district: "静安区",
    boundaryBasis: "历史苏河湾东部功能片区参考代理",
    note: "身份下线前由编辑器自动带入",
    geometryStatus: "candidate",
    geometryFingerprint: "historical-suhewan-functional-proxy",
    ring: [[121.46, 31.24], [121.48, 31.24], [121.48, 31.25]],
  });

  const synced = syncUntouchedDraftsToCurrentTemplates([historicalDraft], []);

  assert.equal(synced.drafts.length, 1);
  assert.equal(synced.drafts[0].name, "苏河湾（已下线草稿备份）");
  assert.equal(synced.drafts[0].sourceSectorId, undefined);
  assert.equal(synced.drafts[0].archived, true);
  assert.equal(synced.drafts[0].referenceOnly, true);
  assert.deepEqual(synced.archivedDraftIds, [synced.drafts[0].id]);
  assert.equal(buildSectorDraftFeatureCollection(synced.drafts).features.length, 0);
});

test("stored source fingerprints update untouched drafts and preserve modified drafts", () => {
  const oldRing = [
    [121.57, 31.27],
    [121.61, 31.27],
    [121.61, 31.3],
  ] as [number, number][];
  const oldFingerprint = fingerprintDraftParts([oldRing]);
  const oldGaohangDraft = createDraftFromExistingSector({
    id: "sector_gaohang",
    name: "高行",
    district: "浦东新区",
    boundaryBasis: "旧高行边界",
    note: "旧版本",
    geometryStatus: "candidate",
    geometryFingerprint: oldFingerprint,
    ring: oldRing,
  });
  const currentTemplate = {
    id: "sector_gaohang",
    name: "高行",
    district: "浦东新区",
    boundaryBasis: "航津路以南并扣除森兰",
    note: "浦东北部联合重构",
    geometryStatus: "candidate" as const,
    geometryFingerprint: "pudong-north-v2",
    previousGeometryFingerprints: [],
    ring: [[121.58, 31.26], [121.62, 31.26], [121.62, 31.29]] as [number, number][],
  };

  const synced = syncUntouchedDraftsToCurrentTemplates(
    [oldGaohangDraft],
    [currentTemplate],
  );
  assert.deepEqual(synced.drafts[0].ring, currentTemplate.ring);
  assert.equal(synced.drafts[0].sourceGeometryFingerprint, "pudong-north-v2");
  assert.deepEqual(synced.updatedSourceIds, ["sector_gaohang"]);

  const modifiedDraft = {
    ...oldGaohangDraft,
    ring: [[121.571, 31.271], [121.611, 31.271], [121.611, 31.301]] as [number, number][],
  };
  const preserved = syncUntouchedDraftsToCurrentTemplates(
    [modifiedDraft],
    [currentTemplate],
  );
  assert.deepEqual(preserved.drafts[0].ring, modifiedDraft.ring);
  assert.deepEqual(preserved.preservedModifiedSourceIds, ["sector_gaohang"]);
});

test("archived retired drafts stay in browser storage but are excluded from GeoJSON export", () => {
  const archivedDraft = {
    ...createSectorDraft("retired-backup-sector_qiantan"),
    name: "杨思前滩（旧合并草稿备份）",
    ring: [[121.41, 31.11], [121.51, 31.11], [121.51, 31.21]] as [number, number][],
    archived: true,
    referenceOnly: true,
  };

  const restored = parseSectorEditorState(
    serializeSectorEditorState([archivedDraft]),
  );
  const exported = buildSectorDraftFeatureCollection(restored);

  assert.equal(restored[0].archived, true);
  assert.equal(restored[0].referenceOnly, true);
  assert.equal(exported.features.length, 0);

  const restoredForReference = [{
    ...restored[0],
    archived: false,
  }];
  assert.equal(
    buildSectorDraftFeatureCollection(restoredForReference).features.length,
    0,
  );
});
