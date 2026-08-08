import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { buildPieWedgePath } from '../utils/pieWedge';

interface PartialDayPieProps {
  fraction: number;
  color: string;
}

// The wedge angle already encodes the fraction; opacity now scales with it too (floored at 0.35,
// the original flat constant, so a bare sliver of progress still reads clearly) so a >1x/day
// task's partial days carry more visual "heatmap" strength the closer they are to done, instead
// of every partial day reading identically regardless of 1-of-3 vs 2-of-3 reps. Used wherever a
// day's partial multi-rep progress shows up (the mini calendar on TaskCard's flipped face, the
// full Calendar screen, DashboardCalendarView's grids).
const SIZE = 40;
export const PartialDayPie: React.FC<PartialDayPieProps> = ({ fraction, color }) => (
  <Svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`}>
    <Path d={buildPieWedgePath(fraction, SIZE)} fill={color} opacity={Math.max(0.35, fraction)} />
  </Svg>
);
