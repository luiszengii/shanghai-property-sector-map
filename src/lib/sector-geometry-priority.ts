interface IdentifiedGeometry {
  properties: {
    id: string;
  };
}

export function mergeMarketGeometryLayers<T extends IdentifiedGeometry>(
  ...layers: ReadonlyArray<ReadonlyArray<T>>
): T[] {
  const geometryById = new Map<string, T>();
  const orderedIds: string[] = [];

  for (const layer of layers) {
    for (const feature of layer) {
      if (!geometryById.has(feature.properties.id)) {
        orderedIds.push(feature.properties.id);
      }
      geometryById.set(feature.properties.id, feature);
    }
  }

  return orderedIds.map((id) => geometryById.get(id)!);
}
