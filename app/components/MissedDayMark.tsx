import React from 'react';
import Svg, { Line } from 'react-native-svg';

interface MissedDayMarkProps {
  color: string;
  size?: number;
}

// A hand-drawn X instead of a MaterialCommunityIcons "close" glyph -- icon fonts can carry a few
// pixels of baked-in baseline offset that `includeFontPadding: false` doesn't remove (that's
// Android's own font-padding, not the font's internal metrics), which read as the mark sitting
// slightly below-center against a perfectly centered dot/circle next to it. Drawing the mark
// ourselves removes the font-metric ambiguity entirely.
export const MissedDayMark: React.FC<MissedDayMarkProps> = ({ color, size = 20 }) => {
  // A shallow inset -- the arms need to reach nearly to the edges of the box, not just its
  // middle, to read as the same visual size as a filled circle of the same diameter next to it.
  const inset = size * 0.08;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Line x1={inset} y1={inset} x2={size - inset} y2={size - inset} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <Line x1={size - inset} y1={inset} x2={inset} y2={size - inset} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
};
