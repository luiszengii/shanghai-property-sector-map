export interface MapPoint<T> {
  item: T;
  x: number;
  y: number;
}

export interface MapPointCluster<T> {
  items: T[];
  center: { x: number; y: number };
}

export function zoomToSeparatePoints(
  points: Array<{ x: number; y: number }>,
  radius: number,
  currentZoom: number,
  maxZoom = 20,
) {
  if (points.length < 2 || radius <= 0) return currentZoom;

  let minimumDistance = Number.POSITIVE_INFINITY;
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      minimumDistance = Math.min(
        minimumDistance,
        Math.hypot(
          points[first].x - points[second].x,
          points[first].y - points[second].y,
        ),
      );
    }
  }

  if (minimumDistance <= 1) return maxZoom;
  const separationZoom = currentZoom
    + Math.log2(radius / minimumDistance)
    + 0.25;
  return Math.min(maxZoom, Math.max(currentZoom + 1, separationZoom));
}

export function clusterMapPoints<T>(
  points: MapPoint<T>[],
  radius: number,
): MapPointCluster<T>[] {
  if (radius <= 0) {
    return points.map((point) => ({
      items: [point.item],
      center: { x: point.x, y: point.y },
    }));
  }

  const clusters: MapPointCluster<T>[] = [];
  for (const point of points) {
    let nearest: MapPointCluster<T> | null = null;
    let nearestDistance = radius;

    for (const cluster of clusters) {
      const distance = Math.hypot(
        point.x - cluster.center.x,
        point.y - cluster.center.y,
      );
      if (distance <= nearestDistance) {
        nearest = cluster;
        nearestDistance = distance;
      }
    }

    if (!nearest) {
      clusters.push({
        items: [point.item],
        center: { x: point.x, y: point.y },
      });
      continue;
    }

    const previousCount = nearest.items.length;
    nearest.center = {
      x: (nearest.center.x * previousCount + point.x) / (previousCount + 1),
      y: (nearest.center.y * previousCount + point.y) / (previousCount + 1),
    };
    nearest.items.push(point.item);
  }

  return clusters;
}
