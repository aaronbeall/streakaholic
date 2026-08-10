export interface StreamLayerPoint {
  top: number;
  bottom: number;
}

export interface Point {
  x: number;
  y: number;
}

// Silhouette (symmetric-around-zero) stacking: each day's stack of layer thicknesses is centered
// on a baseline of 0 rather than resting flat on a zero *edge* the way a bar chart does -- this is
// what gives a streamgraph its flowing "ribbon" look instead of a stack of flat-bottomed bars.
// `values[t][d]` is task t's thickness (already scaled to whatever pixel unit the caller wants) on
// day d; every task's array must be the same length. Returns one array per task, same shape as
// `values`, each entry the task's own {top, bottom} span (in the same centered coordinate space)
// for that day -- stacked in `values`' own task order, first task topmost (least y).
export const computeStreamgraphLayers = (values: number[][]): StreamLayerPoint[][] => {
  const taskCount = values.length;
  const dayCount = taskCount > 0 ? values[0].length : 0;
  const layers: StreamLayerPoint[][] = Array.from({ length: taskCount }, () => []);

  for (let d = 0; d < dayCount; d++) {
    let total = 0;
    for (let t = 0; t < taskCount; t++) total += values[t][d];
    // Avoid a signed -0 baseline on an all-zero day -- numerically identical to 0, but a plain 0
    // is the more honest/expected value to hand callers (and to compare against in tests).
    let cursor = total === 0 ? 0 : -total / 2;
    for (let t = 0; t < taskCount; t++) {
      const thickness = values[t][d];
      const top = cursor;
      const bottom = cursor + thickness;
      layers[t].push({ top, bottom });
      cursor = bottom;
    }
  }

  return layers;
};

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// Appends quadratic-Bezier path commands through `points`, assuming the pen is already sitting at
// `points[0]` (placed by the caller via a preceding "M" or the tail of a prior segment). Each
// original point becomes a control point pulling the curve toward it, with the curve itself
// passing through the *midpoint* of each consecutive pair -- a lightweight way to get a smooth,
// flowing line through a sequence of points without full Catmull-Rom spline math. Ends with an
// explicit line to the exact final point (not just its approaching midpoint) so multiple segments
// built this way can be stitched together at known, exact coordinates.
const appendSmoothSegment = (points: Point[]): string => {
  let d = '';
  for (let i = 0; i < points.length - 1; i++) {
    const mid = midpoint(points[i], points[i + 1]);
    d += ` Q ${points[i].x} ${points[i].y} ${mid.x} ${mid.y}`;
  }
  if (points.length > 0) {
    const last = points[points.length - 1];
    d += ` L ${last.x} ${last.y}`;
  }
  return d;
};

// A closed SVG path for one streamgraph layer: a smooth top edge left-to-right, a straight drop
// to the bottom edge at the rightmost day, a smooth bottom edge back right-to-left, then closed
// ("Z") back to the top edge's own start. `topPoints`/`bottomPoints` must be the same length, one
// point per day, already in left-to-right x order (same day at the same index in both).
export const buildStreamLayerPath = (topPoints: Point[], bottomPoints: Point[]): string => {
  if (topPoints.length === 0 || bottomPoints.length === 0) return '';
  const last = topPoints.length - 1;
  let d = `M ${topPoints[0].x} ${topPoints[0].y}`;
  d += appendSmoothSegment(topPoints);
  d += ` L ${bottomPoints[last].x} ${bottomPoints[last].y}`;
  d += appendSmoothSegment([...bottomPoints].reverse());
  d += ' Z';
  return d;
};
