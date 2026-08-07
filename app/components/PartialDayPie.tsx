import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { buildPieWedgePath } from '../utils/pieWedge';

interface PartialDayPieProps {
  fraction: number;
  color: string;
}

// Matches TaskCard's own today's-progress indicator: same wedge shape and the same
// `opacity={0.35}` solid-color treatment, so a day's partial multi-rep progress reads
// identically wherever it shows up (Home card, the mini calendar on its flipped face, the full
// Calendar screen).
const SIZE = 40;
export const PartialDayPie: React.FC<PartialDayPieProps> = ({ fraction, color }) => (
  <Svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`}>
    <Path d={buildPieWedgePath(fraction, SIZE)} fill={color} opacity={0.35} />
  </Svg>
);
