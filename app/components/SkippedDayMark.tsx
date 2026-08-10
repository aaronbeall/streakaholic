import React from 'react';
import { StyleSheet, View } from 'react-native';

interface SkippedDayMarkProps {
  color: string;
  thickness?: number;
}

// A soft-skip day (empty, but didn't actually break the streak -- it falls inside a real streak
// run per canDayBreakStreak, either an already-closed chain or the current pending tail) reads as
// a horizontal line rather than MissedDayMark's X, colored with the task's own streak color
// instead of a neutral tertiary tone -- distinguishing "this genuinely broke the streak" from
// "this was never really at stake." Deliberately a plain View bar, not hand-drawn SVG like
// MissedDayMark -- a straight rectangle has no icon-font baseline-offset concerns to fight, and a
// View stretches naturally to `width: '100%'` of whatever cell each calendar gives it. Callers
// render this full-bleed across their outer day cell (not the smaller inner dot/circle some of
// them also draw), so that consecutive skipped days' lines actually touch edge-to-edge and read
// as one continuous connector strung across the run, not a series of isolated dashes.
export const SkippedDayMark: React.FC<SkippedDayMarkProps> = ({ color, thickness = 2.5 }) => (
  <View style={[styles.line, { height: thickness, borderRadius: thickness / 2, backgroundColor: color }]} />
);

const styles = StyleSheet.create({
  line: {
    width: '100%',
  },
});
