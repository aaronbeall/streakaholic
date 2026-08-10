import { buildStreamLayerPath, computeStreamgraphLayers, Point } from '../../app/utils/streamgraph';

describe('computeStreamgraphLayers', () => {
  it('returns an empty layer list for no tasks', () => {
    expect(computeStreamgraphLayers([])).toEqual([]);
  });

  it('centers a single task/single day around zero', () => {
    const layers = computeStreamgraphLayers([[4]]);
    expect(layers).toEqual([[{ top: -2, bottom: 2 }]]);
  });

  it('stacks multiple tasks in order, still centered around zero', () => {
    const layers = computeStreamgraphLayers([[2], [4]]);
    // total = 6, silhouette baseline starts at -3
    expect(layers[0]).toEqual([{ top: -3, bottom: -1 }]);
    expect(layers[1]).toEqual([{ top: -1, bottom: 3 }]);
  });

  it('recomputes the baseline independently per day as totals change', () => {
    const layers = computeStreamgraphLayers([
      [2, 0],
      [4, 10],
    ]);
    // Day 0: total 6, baseline -3
    expect(layers[0][0]).toEqual({ top: -3, bottom: -1 });
    expect(layers[1][0]).toEqual({ top: -1, bottom: 3 });
    // Day 1: total 10, baseline -5 -- task 0 contributes nothing (zero-width slice, but still
    // occupies a defined point at the current cursor for path-continuity purposes).
    expect(layers[0][1]).toEqual({ top: -5, bottom: -5 });
    expect(layers[1][1]).toEqual({ top: -5, bottom: 5 });
  });

  it('handles an all-zero day without producing NaN', () => {
    const layers = computeStreamgraphLayers([[0], [0]]);
    expect(layers[0]).toEqual([{ top: 0, bottom: 0 }]);
    expect(layers[1]).toEqual([{ top: 0, bottom: 0 }]);
  });
});

describe('buildStreamLayerPath', () => {
  it('returns an empty string when there are no points', () => {
    expect(buildStreamLayerPath([], [])).toBe('');
  });

  it('starts at the first top point and ends with a close command', () => {
    const top: Point[] = [{ x: 0, y: -2 }, { x: 10, y: -3 }];
    const bottom: Point[] = [{ x: 0, y: 2 }, { x: 10, y: 3 }];
    const path = buildStreamLayerPath(top, bottom);
    expect(path.startsWith('M 0 -2')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
  });

  it('reaches the exact last top point before dropping to the bottom edge', () => {
    const top: Point[] = [{ x: 0, y: -2 }, { x: 10, y: -3 }, { x: 20, y: -1 }];
    const bottom: Point[] = [{ x: 0, y: 2 }, { x: 10, y: 3 }, { x: 20, y: 1 }];
    const path = buildStreamLayerPath(top, bottom);
    // The last top point (20,-1) is reached via an explicit L, immediately followed by an L down
    // to the bottom edge's own last point (20,1) -- both at the same x, the rightmost day.
    expect(path).toContain('L 20 -1 L 20 1');
  });

  it('ends the bottom edge at the exact first bottom point before closing', () => {
    const top: Point[] = [{ x: 0, y: -2 }, { x: 10, y: -3 }];
    const bottom: Point[] = [{ x: 0, y: 2 }, { x: 10, y: 3 }];
    const path = buildStreamLayerPath(top, bottom);
    expect(path).toContain('L 0 2 Z');
  });

  it('produces a single degenerate-but-valid closed shape for one day', () => {
    const path = buildStreamLayerPath([{ x: 5, y: -1 }], [{ x: 5, y: 1 }]);
    expect(path.startsWith('M 5 -1')).toBe(true);
    expect(path).toContain('L 5 1');
    expect(path.endsWith('Z')).toBe(true);
  });

  it('uses quadratic curves (not straight lines) between interior day points', () => {
    const top: Point[] = [{ x: 0, y: 0 }, { x: 10, y: -5 }, { x: 20, y: 0 }];
    const bottom: Point[] = [{ x: 0, y: 5 }, { x: 10, y: 2 }, { x: 20, y: 5 }];
    const path = buildStreamLayerPath(top, bottom);
    expect(path).toMatch(/Q /);
  });
});
