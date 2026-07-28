import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendSectorEditorVersion,
  listSectorEditorVersions,
  migrateLegacySectorEditorVersionStore,
  readSectorEditorVersion,
// @ts-expect-error Node 22 executes storage tests directly and needs the source extension.
} from "./sector-editor-version-store.ts";
import {
  parseSectorEditorVersionStore,
// @ts-expect-error Node 22 executes storage tests directly and needs the source extension.
} from "./sector-editor-versions.ts";

const draft = {
  id: "sector-test",
  name: "测试板块",
  district: "测试区",
  boundaryBasis: "",
  note: "",
  coordinateSystem: "GCJ-02" as const,
  ring: [[121.4, 31.2], [121.5, 31.2], [121.5, 31.3]] as [number, number][],
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z",
};

async function withTemporaryStore(
  run: (paths: { manifestPath: string; objectDirectory: string }) => Promise<void>,
) {
  const directory = await mkdtemp(path.join(tmpdir(), "sector-editor-version-store-"));
  const paths = {
    manifestPath: path.join(directory, "versions.json"),
    objectDirectory: path.join(directory, "objects"),
  };
  try {
    await run(paths);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("legacy snapshots migrate to shared draft objects and restore losslessly", async () => {
  await withTemporaryStore(async (paths) => {
    const legacy = {
      schemaVersion: 1,
      versions: [
        {
          id: "version-1",
          versionNumber: 1,
          label: "版本 1",
          createdAt: "2026-07-26T01:00:00.000Z",
          activeId: draft.id,
          drafts: [draft],
        },
        {
          id: "version-2",
          versionNumber: 2,
          label: "版本 2",
          createdAt: "2026-07-26T02:00:00.000Z",
          activeId: draft.id,
          drafts: [draft],
        },
      ],
    };

    const result = await migrateLegacySectorEditorVersionStore(paths, legacy);
    const expectedVersions = parseSectorEditorVersionStore(legacy).versions;

    assert.deepEqual(result, {
      versionCount: 2,
      referencedDraftCount: 2,
      objectCount: 1,
      createdObjectCount: 1,
    });
    assert.equal((await readdir(paths.objectDirectory)).length, 1);
    assert.deepEqual(await readSectorEditorVersion(paths, "version-1"), expectedVersions[0]);
    assert.deepEqual(await readSectorEditorVersion(paths, "version-2"), expectedVersions[1]);
  });
});

test("new versions reuse existing objects and remain newest-first in the list", async () => {
  await withTemporaryStore(async (paths) => {
    await migrateLegacySectorEditorVersionStore(paths, {
      schemaVersion: 1,
      versions: [{
        id: "version-1",
        versionNumber: 1,
        label: "版本 1",
        createdAt: "2026-07-26T01:00:00.000Z",
        activeId: draft.id,
        drafts: [draft],
      }],
    });

    const appended = await appendSectorEditorVersion(paths, {
      label: "版本 2",
      activeId: draft.id,
      drafts: [draft],
    }, {
      id: "version-2",
      createdAt: "2026-07-26T02:00:00.000Z",
    });

    assert.equal(appended.versionNumber, 2);
    assert.equal((await readdir(paths.objectDirectory)).length, 1);
    assert.deepEqual(
      (await listSectorEditorVersions(paths)).map(({ id }) => id),
      ["version-2", "version-1"],
    );
  });
});

test("a modified draft object is rejected when its content no longer matches its hash", async () => {
  await withTemporaryStore(async (paths) => {
    await appendSectorEditorVersion(paths, {
      drafts: [draft],
      activeId: draft.id,
    }, {
      id: "version-1",
      createdAt: "2026-07-26T01:00:00.000Z",
    });
    const [objectName] = await readdir(paths.objectDirectory);
    const objectPath = path.join(paths.objectDirectory, objectName);
    const storedDraft = JSON.parse(await readFile(objectPath, "utf8"));
    await writeFile(objectPath, JSON.stringify({
      ...storedDraft,
      name: "被篡改的板块",
    }));

    await assert.rejects(
      readSectorEditorVersion(paths, "version-1"),
      /哈希不匹配/,
    );
  });
});
