// A pie slice (not a ring) so a glance at a day reads "how much of it is filled in" the same way
// a clock face reads -- the wedge sweeps clockwise from 12 o'clock in proportion to `fraction`.
// Pure SVG-path geometry, factored out of PartialDayPie so the angle math is testable without
// rendering an SVG.
export const buildPieWedgePath = (fraction: number, size: number): string => {
  const r = size / 2;
  const cx = r;
  const cy = r;
  // Clamp away from exact 0/1 -- a 0-degree or 360-degree sweep degenerates the arc math below.
  const clampedFraction = Math.min(Math.max(fraction, 0.02), 0.98);
  const sweepAngle = clampedFraction * 360;

  const toPoint = (angleDeg: number) => {
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
  };

  const start = toPoint(0);
  const end = toPoint(sweepAngle);
  const largeArcFlag = sweepAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
};
