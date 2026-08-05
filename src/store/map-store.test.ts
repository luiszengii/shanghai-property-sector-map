import assert from "node:assert/strict";
import test from "node:test";

const sessionValues = new Map<string, string>();
Object.defineProperty(globalThis, "sessionStorage", {
  value: {
    get length() {
      return sessionValues.size;
    },
    clear: () => sessionValues.clear(),
    getItem: (key: string) => sessionValues.get(key) ?? null,
    key: (index: number) => [...sessionValues.keys()][index] ?? null,
    removeItem: (key: string) => sessionValues.delete(key),
    setItem: (key: string, value: string) => sessionValues.set(key, value),
  } satisfies Storage,
});

// @ts-expect-error The test runner executes the TypeScript source directly.
const { useMapStore } = await import("./map-store.ts");

test("focusing a project from the list shows its marker, selects it, and requests map focus", () => {
  useMapStore.setState({
    showProjects: false,
    selectedPlaceId: "place_school_1",
    selectedProjectId: null,
    focusRequest: null,
  });

  useMapStore.getState().focusProject("project_东岸观邸");

  const state = useMapStore.getState();
  assert.equal(state.showProjects, true);
  assert.equal(state.selectedPlaceId, null);
  assert.equal(state.selectedProjectId, "project_东岸观邸");
  assert.deepEqual(state.focusRequest, {
    type: "project",
    id: "project_东岸观邸",
    nonce: 1,
  });
});

test("sector boundary visibility is independent and clears a hidden sector selection", () => {
  useMapStore.setState({
    showSectorBoundaries: true,
    showPlanningOverlay: true,
    selectedSectorId: "sector_徐家汇",
  });

  useMapStore.getState().toggleSectorBoundaries();

  let state = useMapStore.getState();
  assert.equal(state.showSectorBoundaries, false);
  assert.equal(state.showPlanningOverlay, true);
  assert.equal(state.selectedSectorId, null);

  useMapStore.getState().toggleSectorBoundaries();

  state = useMapStore.getState();
  assert.equal(state.showSectorBoundaries, true);
  assert.equal(state.showPlanningOverlay, true);
});

test("planning overlay minimum zoom stays within the supported range", () => {
  useMapStore.setState({ planningOverlayMinZoom: 14 });

  useMapStore.getState().setPlanningOverlayMinZoom(12);
  assert.equal(useMapStore.getState().planningOverlayMinZoom, 13);

  useMapStore.getState().setPlanningOverlayMinZoom(15.5);
  assert.equal(useMapStore.getState().planningOverlayMinZoom, 15.5);

  useMapStore.getState().setPlanningOverlayMinZoom(17);
  assert.equal(useMapStore.getState().planningOverlayMinZoom, 16);
});
