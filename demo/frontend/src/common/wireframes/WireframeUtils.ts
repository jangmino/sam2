/**
 * Utilities to extract simplified wireframe polygons from RLE masks,
 * compute centroids, and transform/scale polygons.
 */
import {RLEObject, decode} from '@/jscocotools/mask';

export type Point = [number, number];

export type WireframeData = {
  polygon: Point[]; // in video pixel coordinates
  topmostIndex: number;
};

/** Decode an RLEObject into a binary mask and return width/height and data (0/1). */
export function rleToBinaryMask(rle: RLEObject): {width: number; height: number; data: Uint8Array} {
  const decoded = decode([rle]);
  // decoded.shape is [h, w, n]
  const h = decoded.shape[0];
  const w = decoded.shape[1];
  const data = decoded.data as Uint8Array; // length h*w
  // The decoded buffer indexes by (row-major) over [h, w]. We want video-space (x, y) where x in [0,w), y in [0,h)
  // We'll keep width=w, height=h and interpret index i as (x = i / h, y = i % h) like getThumbnailImageDataOld
  return {width: w, height: h, data};
}

/** Compute centroid (x,y) in video pixel coordinates of a binary mask from its RLE. */
export function centroidFromRLE(rle: RLEObject): Point | null {
  const {width, height, data} = rleToBinaryMask(rle);
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  const H = height;
  for (let i = 0; i < data.length; i++) {
    if (data[i] > 0) {
      // Map to video coords: newX = floor(i / H), newY = i % H
      const x = Math.floor(i / H);
      const y = i % H;
      sumX += x;
      sumY += y;
      count++;
    }
  }
  if (count === 0) return null;
  return [sumX / count, sumY / count];
}

/** Moore-Neighbor tracing to extract an ordered boundary polygon from a binary mask. */
export function extractContour(data: Uint8Array, width: number, height: number): Point[] {
  // Build boundary set: pixels with value=1 having any 4-neighbor 0.
  const isInside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const idx = (x: number, y: number) => y * width + x;

  const isBoundary = (x: number, y: number) => {
    if (!isInside(x, y) || data[idx(x, y)] === 0) return false;
    return (
      (isInside(x + 1, y) ? data[idx(x + 1, y)] === 0 : true) ||
      (isInside(x - 1, y) ? data[idx(x - 1, y)] === 0 : true) ||
      (isInside(x, y + 1) ? data[idx(x, y + 1)] === 0 : true) ||
      (isInside(x, y - 1) ? data[idx(x, y - 1)] === 0 : true)
    );
  };

  // Find starting boundary pixel (topmost, then leftmost)
  let start: Point | null = null;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isBoundary(x, y)) {
        start = [x, y];
        break outer;
      }
    }
  }
  if (!start) return [];

  const dirs: Point[] = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];

  const contour: Point[] = [];
  let cx = start[0];
  let cy = start[1];
  let prevDir = 6; // start looking from direction 7 (prevDir+1)
  let safety = width * height * 4;

  do {
    contour.push([cx, cy]);
    let found = false;
    for (let i = 0; i < 8; i++) {
      const dirIndex = (prevDir + 1 + i) % 8;
      const nx = cx + dirs[dirIndex][0];
      const ny = cy + dirs[dirIndex][1];
      if (isInside(nx, ny) && isBoundary(nx, ny)) {
        // Move to next boundary pixel
        cx = nx;
        cy = ny;
        prevDir = (dirIndex + 6) % 8; // next search starts from neighbor before the direction we came from
        found = true;
        break;
      }
    }
    if (!found) {
      // Isolated pixel? then stop.
      break;
    }
    if (--safety <= 0) break;
  } while (!(cx === start[0] && cy === start[1] && contour.length > 1));

  return contour;
}

/** Douglas-Peucker simplification */
export function simplifyRDP(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points.slice();

  const dmaxInfo = findMaxDistance(points);
  const dmax = dmaxInfo.distance;
  const index = dmaxInfo.index;

  if (dmax > epsilon) {
    const recResults1 = simplifyRDP(points.slice(0, index + 1), epsilon);
    const recResults2 = simplifyRDP(points.slice(index), epsilon);
    return [...recResults1.slice(0, -1), ...recResults2];
  } else {
    return [points[0], points[points.length - 1]];
  }
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const [x, y] = p;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  if (lenSq !== 0) param = dot / lenSq;
  let xx, yy;
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }
  const dx = x - xx;
  const dy = y - yy;
  return Math.hypot(dx, dy);
}

function findMaxDistance(points: Point[]): {index: number; distance: number} {
  let maxDist = 0;
  let idx = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > maxDist) {
      maxDist = d;
      idx = i;
    }
  }
  return {index: idx, distance: maxDist};
}

/**
 * Given an RLE mask, extract a simplified contour polygon in video pixel coordinates.
 * epsilon controls simplification tolerance in pixels.
 */
export function wireframeFromRLE(rle: RLEObject, epsilon: number = 2): WireframeData {
  const {width, height, data} = rleToBinaryMask(rle);
  // Map linear indices to (x,y) in video coords as newX=floor(i/height), newY=i%height
  // Build a binary grid in video coordinates of size (width, height)
  const grid = new Uint8Array(width * height);
  const H = height;
  for (let i = 0; i < data.length; i++) {
    if (data[i] > 0) {
      const x = Math.floor(i / H);
      const y = i % H;
      grid[y * width + x] = 1;
    }
  }

  const contour = extractContour(grid, width, height);
  // Ensure closed path by appending first point at end to preserve shape for RDP
  const closed = contour.length > 2 && (contour[0][0] !== contour[contour.length - 1][0] || contour[0][1] !== contour[contour.length - 1][1])
    ? [...contour, contour[0]]
    : contour.slice();

  const simplified = simplifyRDP(closed, epsilon);
  let topIdx = 0;
  for (let i = 1; i < simplified.length; i++) {
    if (simplified[i][1] < simplified[topIdx][1] || (simplified[i][1] === simplified[topIdx][1] && simplified[i][0] < simplified[topIdx][0])) {
      topIdx = i;
    }
  }
  return {polygon: simplified, topmostIndex: topIdx};
}

/** Translate so topmost point at (0,0) and scale by factor s. */
export function transformTopAndScale(polygon: Point[], topmostIndex: number, scale: number): Point[] {
  if (polygon.length === 0) return polygon;
  const [tx, ty] = polygon[topmostIndex];
  return polygon.map(([x, y]) => [(x - tx) * scale, (y - ty) * scale]);
}

/** Utility to compute pixel distance */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
