import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Reanimated, {
  Easing,
  SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { Task } from '../types';
import { getCompletionCount } from '../utils/streaks';

const AnimatedPath = Reanimated.createAnimatedComponent(Path);

// Extracted from TaskCard.tsx's CardTask (2026-08-10) so TaskHeader can render the exact same
// icon -- ring, >1x/day segmentation, partial/solid fill, press-and-hold-to-complete animation --
// rather than a static, non-interactive icon circle of its own. These constants and the JSX below
// are otherwise unchanged from CardTask's original inline version; see TaskCard.tsx for the
// broader tuning history (five rounds of iteration on the pop/settle spring alone) if touching
// any of the animation values here.
export const DEPRESS_SCALE = 0.9;
export const POP_PEAK_SCALE = 1.2;
export const COMPLETION_HOLD_DURATION = 750;
// The gap (in degrees) left between each arc segment of a >1x/day task's split progress ring.
export const RING_SEGMENT_GAP_DEGREES = 14;
// The incomplete-state ring/track's opacity -- deliberately more faded than the 0.35 used by the
// today's-progress wedge below, so the track reads as an empty/base state that the press-and-hold
// sweep (full solid `task.color`, no opacity) then visibly "fills in" over.
export const INCOMPLETE_RING_OPACITY = 0.25;

interface TaskProgressIconProps {
  task: Task;
  // Resolved pixel sizes, not the outer card/badge "size" some callers derive them from -- keeps
  // this component ignorant of any caller-specific sizing formula (CardTask's own card-size-based
  // scaling, TaskHeader's fixed header-icon size, etc).
  iconSize: number;
  iconFontSize: number;
  progress: SharedValue<number>;
  isPressed: boolean;
  isCompleting: boolean;
  onCompleted: () => void;
  // The two colors this icon is drawn in -- `color` for the ring/fill/incomplete-state icon glyph
  // (defaults to `task.color`, TaskCard's own look), `onColor` for whatever sits *on top of* a
  // solid `color` fill -- the completed-state icon glyph and the checkmark (defaults to white).
  // TaskHeader passes these inverted (`color="#fff"`, `onColor={task.color}`) since its own
  // background already *is* task.color -- see its own render-site comment for why swapping which
  // color is "the fill" and which is "the mark on top of the fill" reads correctly there without
  // needing a neutral backdrop behind the icon at all.
  color?: string;
  onColor?: string;
}

export const TaskProgressIcon = React.memo(({
  task,
  iconSize,
  iconFontSize,
  progress,
  isPressed,
  isCompleting,
  onCompleted,
  color,
  onColor = '#fff',
}: TaskProgressIconProps) => {
  const primaryColor = color ?? task.color;
  const checkmarkOpacity = useSharedValue(0);
  const iconOpacity = useSharedValue(1);
  const scale = useSharedValue(1);

  const CIRCLE_STROKE_WIDTH = 8;
  const CIRCLE_RADIUS = 60;
  const CIRCLE_CENTER = 64;
  const INNER_CIRCLE_RADIUS = CIRCLE_RADIUS - CIRCLE_STROKE_WIDTH;

  // The press-and-hold confirmation, driven by the same `progress.value * 360` sweep, renders as
  // two coordinated pieces: a stroke arc along the ring/track itself (below), so holding reads as
  // filling up the muted track like a circular progress bar -- plus the original filled pie slice
  // growing from the center too, so both the ring and the icon's interior fill together.
  const holdProgressAnimatedProps = useAnimatedProps(() => {
    const angle = progress.value * 360;
    if (angle <= 0) {
      return { d: '' };
    }
    const radians = (angle - 90) * (Math.PI / 180);
    const x = CIRCLE_CENTER + CIRCLE_RADIUS * Math.cos(radians);
    const y = CIRCLE_CENTER + CIRCLE_RADIUS * Math.sin(radians);
    const largeArcFlag = angle > 180 ? 1 : 0;
    const path = [
      `M ${CIRCLE_CENTER} ${CIRCLE_CENTER - CIRCLE_RADIUS}`,
      `A ${CIRCLE_RADIUS} ${CIRCLE_RADIUS} 0 ${largeArcFlag} 1 ${x} ${y}`
    ].join(' ');

    return {
      d: path
    };
  });

  const holdProgressPieAnimatedProps = useAnimatedProps(() => {
    const angle = progress.value * 360;
    if (angle <= 0) {
      return { d: '' };
    }
    const radians = (angle - 90) * (Math.PI / 180);
    const x = CIRCLE_CENTER + INNER_CIRCLE_RADIUS * Math.cos(radians);
    const y = CIRCLE_CENTER + INNER_CIRCLE_RADIUS * Math.sin(radians);
    const largeArcFlag = angle > 180 ? 1 : 0;
    const path = [
      `M ${CIRCLE_CENTER} ${CIRCLE_CENTER}`,
      `L ${CIRCLE_CENTER} ${CIRCLE_CENTER - INNER_CIRCLE_RADIUS}`,
      `A ${INNER_CIRCLE_RADIUS} ${INNER_CIRCLE_RADIUS} 0 ${largeArcFlag} 1 ${x} ${y}`,
      'Z'
    ].join(' ');

    return {
      d: path
    };
  });

  const timesPerDayCount = task.timesPerDay || 1;
  const completionCount = getCompletionCount(task);
  const dayProgressFraction = Math.min(completionCount / timesPerDayCount, 1);

  // For a >1x/day task, the outer ring splits into `timesPerDayCount` equal arc segments with a
  // small gap between each, instead of one continuous circle -- a static visual cue for "this
  // many reps needed today", independent of `dayProgressAnimatedProps`'s own fill-based progress
  // wedge below. Only depends on `timesPerDayCount` (not any shared value), so it's a plain
  // `useMemo`, not an animated prop.
  const ringSegments = useMemo(() => {
    if (timesPerDayCount <= 1) {
      return null;
    }
    const getRingPoint = (angleDegrees: number) => {
      const radians = (angleDegrees - 90) * (Math.PI / 180);
      return {
        x: CIRCLE_CENTER + CIRCLE_RADIUS * Math.cos(radians),
        y: CIRCLE_CENTER + CIRCLE_RADIUS * Math.sin(radians)
      };
    };
    const segmentAngle = 360 / timesPerDayCount;
    return Array.from({ length: timesPerDayCount }, (_, i) => {
      const startAngle = i * segmentAngle + RING_SEGMENT_GAP_DEGREES / 2;
      const endAngle = (i + 1) * segmentAngle - RING_SEGMENT_GAP_DEGREES / 2;
      const start = getRingPoint(startAngle);
      const end = getRingPoint(endAngle);
      const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
      return `M ${start.x} ${start.y} A ${CIRCLE_RADIUS} ${CIRCLE_RADIUS} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
    });
  }, [timesPerDayCount]);

  // Animated pie slice showing how many of today's timesPerDay reps are logged so far -- eases
  // toward the new fraction whenever a rep is logged, echoing the same sweep-in motion as
  // `holdProgressAnimatedProps` above (the transient press-and-hold confirmation).
  const dayProgress = useSharedValue(dayProgressFraction);

  useEffect(() => {
    dayProgress.value = withTiming(dayProgressFraction, { duration: 500 });
  }, [dayProgressFraction]);

  const dayProgressAnimatedProps = useAnimatedProps(() => {
    const angle = dayProgress.value * 360;
    if (angle <= 0) {
      return { d: '' };
    }
    const radians = (angle - 90) * (Math.PI / 180);
    const x = CIRCLE_CENTER + INNER_CIRCLE_RADIUS * Math.cos(radians);
    const y = CIRCLE_CENTER + INNER_CIRCLE_RADIUS * Math.sin(radians);
    const largeArcFlag = angle > 180 ? 1 : 0;
    const path = [
      `M ${CIRCLE_CENTER} ${CIRCLE_CENTER}`,
      `L ${CIRCLE_CENTER} ${CIRCLE_CENTER - INNER_CIRCLE_RADIUS}`,
      `A ${INNER_CIRCLE_RADIUS} ${INNER_CIRCLE_RADIUS} 0 ${largeArcFlag} 1 ${x} ${y}`,
      'Z'
    ].join(' ');
    return { d: path };
  });

  const checkmarkStyle = useAnimatedStyle(() => ({
    opacity: checkmarkOpacity.value,
    transform: [{ scale: checkmarkOpacity.value }]
  }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value * (1 - progress.value)
  }));

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  // Derived from the same `completionCount` already fetched above, rather than a second
  // `isTaskCompleted(task)` call -- that would re-run its own internal `getCompletionCount` scan
  // over `task.completions` a second time for the exact same (task, today) lookup.
  const completed = completionCount >= timesPerDayCount || isCompleting;

  useEffect(() => {
    if (isCompleting) {
      // Fade out icon and show checkmark immediately -- it stays up for the entire pop.
      iconOpacity.value = withTiming(0, { duration: 120 });
      checkmarkOpacity.value = withTiming(1, { duration: 120 });

      // A spring's overshoot from a small starting displacement is physics-*estimated*, not
      // guaranteed -- see TaskCard.tsx's own history for why this snaps to an explicit peak
      // (POP_PEAK_SCALE) with a fast withTiming, then a separate spring eases it back down.
      scale.value = withSequence(
        withTiming(POP_PEAK_SCALE, { duration: 100, easing: Easing.out(Easing.cubic) }),
        withSpring(1, {
          damping: 23,
          stiffness: 1000,
          energyThreshold: 0.0001,
        })
      );

      // A plain fixed timeout, not the spring's own "finished" callback -- unreliable on Android
      // for driving real control flow (measured 3-4s there instead of the physics-predicted few
      // hundred ms). See TaskCard.tsx for the full history.
      const timer = setTimeout(() => {
        checkmarkOpacity.value = withTiming(0, { duration: 120 });
        iconOpacity.value = withTiming(1, { duration: 120 });
        onCompleted();
      }, COMPLETION_HOLD_DURATION);
      return () => clearTimeout(timer);
    }

    // Not completing -- just track the press depress (quick down on press, quick back up on
    // release). Skipped entirely while completing, above, so a release that happens to land
    // mid-pop can't fight the elastic settle.
    scale.value = withTiming(isPressed ? DEPRESS_SCALE : 1, { duration: isPressed ? 100 : 150 });
  }, [isPressed, isCompleting]);

  return (
    <Reanimated.View style={[styles.iconContainer, { width: iconSize, height: iconSize, borderRadius: iconSize / 2 }, containerStyle]}>
      <Svg width={iconSize} height={iconSize} viewBox="0 0 128 128">
        {/* Outer circle (border) -- solid fill once completed, regardless of timesPerDay. While
            incomplete it's a faded/muted track instead (either one continuous ring for 1x/day, or
            split into equal arc segments with gaps for >1x/day, see `ringSegments`) that the
            press-and-hold sweep below then fills in with solid color. */}
        {completed ? (
          <Circle
            cx={CIRCLE_CENTER}
            cy={CIRCLE_CENTER}
            r={CIRCLE_RADIUS}
            stroke={primaryColor}
            strokeWidth={CIRCLE_STROKE_WIDTH}
            fill={primaryColor}
          />
        ) : ringSegments ? (
          // Segments for reps already logged today render solid (full opacity) even though the
          // overall task isn't complete yet -- only the remaining, not-yet-done segments stay
          // muted. Segment order matches rep order (index 0 first), not tied to which particular
          // press logged which rep, since reps themselves are interchangeable increments.
          ringSegments.map((d, i) => (
            <Path
              key={i}
              d={d}
              stroke={primaryColor}
              strokeWidth={CIRCLE_STROKE_WIDTH}
              strokeLinecap="round"
              fill="none"
              opacity={i < completionCount ? 1 : INCOMPLETE_RING_OPACITY}
            />
          ))
        ) : (
          <Circle
            cx={CIRCLE_CENTER}
            cy={CIRCLE_CENTER}
            r={CIRCLE_RADIUS}
            stroke={primaryColor}
            strokeWidth={CIRCLE_STROKE_WIDTH}
            fill="none"
            opacity={INCOMPLETE_RING_OPACITY}
          />
        )}
        {/* Today's times-per-day progress, when this task requires more than one rep a day */}
        {!completed && timesPerDayCount > 1 && (
          <AnimatedPath fill={primaryColor} opacity={0.35} animatedProps={dayProgressAnimatedProps} />
        )}
        {/* Press-and-hold confirmation -- both fill the ring/track itself like a progress bar
            AND grow a solid pie slice from the center, together */}
        {!completed && (
          <>
            <AnimatedPath fill={primaryColor} animatedProps={holdProgressPieAnimatedProps} />
            <AnimatedPath
              stroke={primaryColor}
              strokeWidth={CIRCLE_STROKE_WIDTH}
              strokeLinecap="round"
              fill="none"
              animatedProps={holdProgressAnimatedProps}
            />
          </>
        )}
      </Svg>
      <Reanimated.View style={[StyleSheet.absoluteFill, iconStyle]}>
        <MaterialCommunityIcons
          name={task.icon}
          size={iconFontSize}
          color={completed ? onColor : primaryColor}
          style={{
            textAlign: 'center',
            textAlignVertical: 'center',
            lineHeight: iconSize
          }}
        />
      </Reanimated.View>
      <Reanimated.View style={[StyleSheet.absoluteFill, checkmarkStyle, { justifyContent: 'center', alignItems: 'center' }]}>
        <MaterialCommunityIcons
          name="check"
          size={iconFontSize}
          color={onColor}
          style={{
            textAlign: 'center',
            textAlignVertical: 'center',
            lineHeight: iconSize
          }}
        />
      </Reanimated.View>
    </Reanimated.View>
  );
});

TaskProgressIcon.displayName = 'TaskProgressIcon';

const styles = StyleSheet.create({
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
});
