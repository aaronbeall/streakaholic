import { buildPieWedgePath } from './pieWedge';

// The path is a moveTo-center + lineTo-start + arc-to-end pie shape:
// "M cx cy L sx sy A r r 0 largeArcFlag sweepFlag ex ey Z"
const parsePieWedgePath = (path: string) => {
  const match = path.match(
    /^M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+) A ([\d.-]+) ([\d.-]+) 0 (\d) (\d) ([\d.-]+) ([\d.-]+) Z$/
  );
  if (!match) throw new Error(`Path did not match the expected pie-wedge shape: ${path}`);
  const [, cx, cy, sx, sy, rx, ry, largeArcFlag, sweepFlag, ex, ey] = match;
  return {
    center: { x: Number(cx), y: Number(cy) },
    start: { x: Number(sx), y: Number(sy) },
    r: Number(rx),
    ry: Number(ry),
    largeArcFlag: Number(largeArcFlag),
    sweepFlag: Number(sweepFlag),
    end: { x: Number(ex), y: Number(ey) },
  };
};

describe('buildPieWedgePath', () => {
  it('centers and sizes the wedge from the given size', () => {
    const { center, r, ry } = parsePieWedgePath(buildPieWedgePath(0.5, 40));
    expect(center).toEqual({ x: 20, y: 20 });
    expect(r).toBe(20);
    expect(ry).toBe(20);
  });

  it('always starts the wedge at 12 o\'clock', () => {
    for (const fraction of [0.1, 0.4, 0.6, 0.9]) {
      const { center, start } = parsePieWedgePath(buildPieWedgePath(fraction, 40));
      expect(start.x).toBeCloseTo(center.x, 5);
      expect(start.y).toBeCloseTo(center.y - 20, 5);
    }
  });

  it('sweeps clockwise: a quarter fraction ends at 3 o\'clock', () => {
    const { center, end, largeArcFlag, sweepFlag } = parsePieWedgePath(buildPieWedgePath(0.25, 40));
    expect(end.x).toBeCloseTo(center.x + 20, 5);
    expect(end.y).toBeCloseTo(center.y, 5);
    expect(largeArcFlag).toBe(0);
    expect(sweepFlag).toBe(1);
  });

  it('a half fraction ends at 6 o\'clock, right at the large-arc boundary', () => {
    const { center, end, largeArcFlag } = parsePieWedgePath(buildPieWedgePath(0.5, 40));
    expect(end.x).toBeCloseTo(center.x, 5);
    expect(end.y).toBeCloseTo(center.y + 20, 5);
    expect(largeArcFlag).toBe(0); // exactly 180deg is not > 180
  });

  it('a three-quarter fraction ends at 9 o\'clock and needs the large arc', () => {
    const { center, end, largeArcFlag } = parsePieWedgePath(buildPieWedgePath(0.75, 40));
    expect(end.x).toBeCloseTo(center.x - 20, 5);
    expect(end.y).toBeCloseTo(center.y, 5);
    expect(largeArcFlag).toBe(1);
  });

  it('clamps degenerate 0 and 1 fractions to a still-valid wedge', () => {
    expect(() => parsePieWedgePath(buildPieWedgePath(0, 40))).not.toThrow();
    expect(() => parsePieWedgePath(buildPieWedgePath(1, 40))).not.toThrow();
    const zero = parsePieWedgePath(buildPieWedgePath(0, 40));
    const one = parsePieWedgePath(buildPieWedgePath(1, 40));
    // Clamped away from a literal 0/360 degree sweep, so start and end aren't identical.
    expect(zero.end).not.toEqual(zero.start);
    expect(one.end).not.toEqual(one.start);
  });
});
