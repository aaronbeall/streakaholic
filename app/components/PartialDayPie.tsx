import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface PartialDayPieProps {
  fraction: number;
  color: string;
}

// A pie slice (not a ring), matching TaskCard's own today's-progress indicator: the wedge sweeps
// clockwise from 12 o'clock in proportion to completionCount/timesPerDay, at the same
// `opacity={0.35}` solid-color treatment, so a day's partial multi-rep progress reads identically
// wherever it shows up (Home card, the mini calendar on its flipped face, the full Calendar screen).
const SIZE = 40;
export const PartialDayPie: React.FC<PartialDayPieProps> = ({ fraction, color }) => {
  const r = SIZE / 2;
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
  const wedgePath = `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <Path d={wedgePath} fill={color} opacity={0.35} />
    </Svg>
  );
};
