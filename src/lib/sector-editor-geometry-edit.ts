import {
  draftAdditionalHoles,
  draftHoles,
  draftParts,
  type DraftPosition,
  type SectorBoundaryDraft,
// @ts-expect-error Node 22 executes editor tests directly and requires the source extension.
} from "./sector-editor-drafts.ts";

export type EditableDraftGeometry = Pick<
  SectorBoundaryDraft,
  "ring" | "holes" | "additionalRings" | "additionalHoles"
>;

export interface DraftVertexRef {
  partIndex: number;
  ringIndex: number;
  vertexIndex: number;
}

export interface DraftVertexScreenPoint {
  key: string;
  point: [number, number];
}

export interface DraftVertexSelectionRectangle {
  start: [number, number];
  end: [number, number];
}

function polygonParts(geometry: EditableDraftGeometry) {
  const parts = draftParts(geometry);
  const additionalHoles = draftAdditionalHoles(geometry);
  return parts.map((ring, index): DraftPosition[][] => [
    ring,
    ...(index === 0 ? draftHoles(geometry) : (additionalHoles[index - 1] ?? [])),
  ]);
}

function partsToGeometry(parts: DraftPosition[][][]): EditableDraftGeometry {
  const [primary, ...additional] = parts;
  return {
    ring: primary?.[0] ?? [],
    holes: primary?.slice(1) ?? [],
    additionalRings: additional.map((polygon) => polygon[0]),
    additionalHoles: additional.map((polygon) => polygon.slice(1)),
  };
}

function crossProduct(
  [ax, ay]: DraftPosition,
  [bx, by]: DraftPosition,
  [cx, cy]: DraftPosition,
) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function pointOnSegment(
  [ax, ay]: DraftPosition,
  [bx, by]: DraftPosition,
  [px, py]: DraftPosition,
) {
  const epsilon = 1e-12;
  return Math.abs(crossProduct([ax, ay], [bx, by], [px, py])) <= epsilon
    && px >= Math.min(ax, bx) - epsilon
    && px <= Math.max(ax, bx) + epsilon
    && py >= Math.min(ay, by) - epsilon
    && py <= Math.max(ay, by) + epsilon;
}

function segmentsIntersect(
  firstStart: DraftPosition,
  firstEnd: DraftPosition,
  secondStart: DraftPosition,
  secondEnd: DraftPosition,
) {
  const epsilon = 1e-12;
  const firstSideStart = crossProduct(firstStart, firstEnd, secondStart);
  const firstSideEnd = crossProduct(firstStart, firstEnd, secondEnd);
  const secondSideStart = crossProduct(secondStart, secondEnd, firstStart);
  const secondSideEnd = crossProduct(secondStart, secondEnd, firstEnd);
  if (
    (
      (firstSideStart > epsilon && firstSideEnd < -epsilon)
      || (firstSideStart < -epsilon && firstSideEnd > epsilon)
    )
    && (
      (secondSideStart > epsilon && secondSideEnd < -epsilon)
      || (secondSideStart < -epsilon && secondSideEnd > epsilon)
    )
  ) return true;
  return pointOnSegment(firstStart, firstEnd, secondStart)
    || pointOnSegment(firstStart, firstEnd, secondEnd)
    || pointOnSegment(secondStart, secondEnd, firstStart)
    || pointOnSegment(secondStart, secondEnd, firstEnd);
}

function segmentsCrossOrOverlap(
  firstStart: DraftPosition,
  firstEnd: DraftPosition,
  secondStart: DraftPosition,
  secondEnd: DraftPosition,
) {
  const epsilon = 1e-12;
  const firstSideStart = crossProduct(firstStart, firstEnd, secondStart);
  const firstSideEnd = crossProduct(firstStart, firstEnd, secondEnd);
  const secondSideStart = crossProduct(secondStart, secondEnd, firstStart);
  const secondSideEnd = crossProduct(secondStart, secondEnd, firstEnd);
  if (
    (
      (firstSideStart > epsilon && firstSideEnd < -epsilon)
      || (firstSideStart < -epsilon && firstSideEnd > epsilon)
    )
    && (
      (secondSideStart > epsilon && secondSideEnd < -epsilon)
      || (secondSideStart < -epsilon && secondSideEnd > epsilon)
    )
  ) return true;
  if (
    Math.abs(firstSideStart) > epsilon
    || Math.abs(firstSideEnd) > epsilon
    || Math.abs(secondSideStart) > epsilon
    || Math.abs(secondSideEnd) > epsilon
  ) return false;
  const useLongitude = Math.abs(firstEnd[0] - firstStart[0])
    >= Math.abs(firstEnd[1] - firstStart[1]);
  const axis = useLongitude ? 0 : 1;
  const overlapStart = Math.max(
    Math.min(firstStart[axis], firstEnd[axis]),
    Math.min(secondStart[axis], secondEnd[axis]),
  );
  const overlapEnd = Math.min(
    Math.max(firstStart[axis], firstEnd[axis]),
    Math.max(secondStart[axis], secondEnd[axis]),
  );
  return overlapEnd - overlapStart > epsilon;
}

function ringsIntersect(
  first: DraftPosition[],
  second: DraftPosition[],
  intersectionTest = segmentsIntersect,
) {
  return first.some((firstStart, firstIndex) => {
    const firstEnd = first[(firstIndex + 1) % first.length];
    return second.some((secondStart, secondIndex) => intersectionTest(
      firstStart,
      firstEnd,
      secondStart,
      second[(secondIndex + 1) % second.length],
    ));
  });
}

function ringContainsPoint(ring: DraftPosition[], point: DraftPosition) {
  for (let index = 0; index < ring.length; index += 1) {
    if (pointOnSegment(ring[index], ring[(index + 1) % ring.length], point)) {
      return false;
    }
  }
  let inside = false;
  for (
    let index = 0, previousIndex = ring.length - 1;
    index < ring.length;
    previousIndex = index, index += 1
  ) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previousIndex];
    if (
      (y > point[1]) !== (previousY > point[1])
      && point[0] < (
        (previousX - x) * (point[1] - y) / (previousY - y) + x
      )
    ) inside = !inside;
  }
  return inside;
}

function assertRingValid(ring: DraftPosition[]) {
  if (ring.length < 3) {
    throw new Error("每个闭环至少需要保留 3 个顶点");
  }
  if (ring.some(([longitude, latitude]) => (
    !Number.isFinite(longitude) || !Number.isFinite(latitude)
  ))) {
    throw new Error("操作会产生无效几何：闭环包含无效坐标");
  }
  if (new Set(ring.map(([longitude, latitude]) => `${longitude}:${latitude}`)).size < 3) {
    throw new Error("操作会产生无效几何：闭环至少需要 3 个不同顶点");
  }
  let twiceArea = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + 1) % ring.length];
    twiceArea += x1 * y2 - x2 * y1;
  }
  if (Math.abs(twiceArea) <= 1e-16) {
    throw new Error("操作会产生无效几何：闭环面积为零");
  }
  for (let firstIndex = 0; firstIndex < ring.length; firstIndex += 1) {
    const firstEndIndex = (firstIndex + 1) % ring.length;
    const firstStart = ring[firstIndex];
    const firstEnd = ring[firstEndIndex];
    if (firstStart[0] === firstEnd[0] && firstStart[1] === firstEnd[1]) {
      throw new Error("操作会产生无效几何：闭环包含重复的相邻顶点");
    }
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < ring.length;
      secondIndex += 1
    ) {
      const secondEndIndex = (secondIndex + 1) % ring.length;
      if (
        firstEndIndex === secondIndex
        || secondEndIndex === firstIndex
      ) continue;
      if (segmentsIntersect(
        firstStart,
        firstEnd,
        ring[secondIndex],
        ring[secondEndIndex],
      )) {
        throw new Error("操作会产生无效几何：闭环发生自交");
      }
    }
  }
}

function assertDraftGeometryValid(geometry: EditableDraftGeometry) {
  const parts = polygonParts(geometry);
  for (const polygon of parts) {
    for (const ring of polygon) assertRingValid(ring);
    const [exterior, ...holes] = polygon;
    for (const hole of holes) {
      if (
        ringsIntersect(exterior, hole)
        || !ringContainsPoint(exterior, hole[0])
      ) {
        throw new Error("操作会产生无效几何：孔洞必须完整位于所属闭环内部");
      }
    }
    for (let firstIndex = 0; firstIndex < holes.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < holes.length;
        secondIndex += 1
      ) {
        if (
          ringsIntersect(holes[firstIndex], holes[secondIndex])
          || ringContainsPoint(holes[firstIndex], holes[secondIndex][0])
          || ringContainsPoint(holes[secondIndex], holes[firstIndex][0])
        ) {
          throw new Error("操作会产生无效几何：同一闭环中的孔洞不能重叠");
        }
      }
    }
  }
  for (let firstIndex = 0; firstIndex < parts.length; firstIndex += 1) {
    const firstExterior = parts[firstIndex][0];
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < parts.length;
      secondIndex += 1
    ) {
      const secondExterior = parts[secondIndex][0];
      if (
        ringsIntersect(firstExterior, secondExterior, segmentsCrossOrOverlap)
        || ringContainsPoint(firstExterior, secondExterior[0])
        || ringContainsPoint(secondExterior, firstExterior[0])
      ) {
        throw new Error("操作会产生无效几何：多个闭环之间不能重叠");
      }
    }
  }
}

export function removeDraftPolygonPart(
  geometry: EditableDraftGeometry,
  partIndex: number,
): EditableDraftGeometry {
  const parts = polygonParts(geometry);
  if (parts.length <= 1) {
    throw new Error("板块至少需要保留一个闭环");
  }
  if (!Number.isInteger(partIndex) || partIndex < 0 || partIndex >= parts.length) {
    throw new Error("要删除的闭环不存在");
  }
  const nextGeometry = partsToGeometry(
    parts.filter((_, index) => index !== partIndex),
  );
  assertDraftGeometryValid(nextGeometry);
  return nextGeometry;
}

export function draftVertexKey(reference: DraftVertexRef) {
  return `${reference.partIndex}:${reference.ringIndex}:${reference.vertexIndex}`;
}

export function listDraftVertices(geometry: EditableDraftGeometry) {
  return polygonParts(geometry).flatMap((polygon, partIndex) => (
    polygon.flatMap((ring, ringIndex) => (
      ring.map((position, vertexIndex) => {
        const reference = { partIndex, ringIndex, vertexIndex };
        return {
          key: draftVertexKey(reference),
          reference,
          position,
        };
      })
    ))
  ));
}

export function selectDraftVertexKeysInRectangle(
  vertices: DraftVertexScreenPoint[],
  rectangle: DraftVertexSelectionRectangle,
  currentKeys: ReadonlySet<string> = new Set(),
  append = false,
) {
  const left = Math.min(rectangle.start[0], rectangle.end[0]);
  const right = Math.max(rectangle.start[0], rectangle.end[0]);
  const top = Math.min(rectangle.start[1], rectangle.end[1]);
  const bottom = Math.max(rectangle.start[1], rectangle.end[1]);
  const next = append ? new Set(currentKeys) : new Set<string>();
  for (const vertex of vertices) {
    const [x, y] = vertex.point;
    if (x >= left && x <= right && y >= top && y <= bottom) {
      next.add(vertex.key);
    }
  }
  return next;
}

export function removeDraftVertices(
  geometry: EditableDraftGeometry,
  references: DraftVertexRef[],
): EditableDraftGeometry {
  const parts = polygonParts(geometry);
  const selectedKeys = new Set(references.map(draftVertexKey));
  for (const reference of references) {
    const ring = parts[reference.partIndex]?.[reference.ringIndex];
    if (
      !ring
      || !Number.isInteger(reference.vertexIndex)
      || reference.vertexIndex < 0
      || reference.vertexIndex >= ring.length
    ) {
      throw new Error("选择中包含不存在的顶点");
    }
  }
  const nextParts = parts.map((polygon, partIndex) => (
    polygon.map((ring, ringIndex) => {
      const nextRing = ring.filter((_, vertexIndex) => (
        !selectedKeys.has(draftVertexKey({ partIndex, ringIndex, vertexIndex }))
      ));
      if (nextRing.length < 3) {
        throw new Error("每个闭环至少需要保留 3 个顶点");
      }
      return nextRing;
    })
  ));
  const nextGeometry = partsToGeometry(nextParts);
  assertDraftGeometryValid(nextGeometry);
  return nextGeometry;
}

export function moveDraftVertices(
  geometry: EditableDraftGeometry,
  references: DraftVertexRef[],
  [longitudeDelta, latitudeDelta]: DraftPosition,
): EditableDraftGeometry {
  if (!Number.isFinite(longitudeDelta) || !Number.isFinite(latitudeDelta)) {
    throw new Error("顶点位移必须是有效坐标");
  }
  const parts = polygonParts(geometry);
  const selectedKeys = new Set(references.map(draftVertexKey));
  for (const reference of references) {
    const ring = parts[reference.partIndex]?.[reference.ringIndex];
    if (
      !ring
      || !Number.isInteger(reference.vertexIndex)
      || reference.vertexIndex < 0
      || reference.vertexIndex >= ring.length
    ) {
      throw new Error("选择中包含不存在的顶点");
    }
  }
  const nextGeometry = partsToGeometry(parts.map((polygon, partIndex) => (
    polygon.map((ring, ringIndex) => (
      ring.map(([longitude, latitude], vertexIndex): DraftPosition => (
        selectedKeys.has(draftVertexKey({ partIndex, ringIndex, vertexIndex }))
          ? [longitude + longitudeDelta, latitude + latitudeDelta]
          : [longitude, latitude]
      ))
    ))
  )));
  assertDraftGeometryValid(nextGeometry);
  return nextGeometry;
}
