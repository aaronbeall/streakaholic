import { MaterialCommunityIcons } from '@expo/vector-icons';
import { addDays, endOfWeek, format, getDay, getDaysInMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
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
import { useSettings } from '../context/SettingsContext';
import { useTaskContext } from '../context/TaskContext';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { Task } from '../types';
import { MissedDayMark } from './MissedDayMark';
import { ParticleSystem } from './ParticleSystem';
import { PartialDayPie } from './PartialDayPie';
import { getTrailingBlankCount } from '../utils/calendarGrid';
import { getExpectedPeriodTotal } from '../utils/periodStats';

const AnimatedPath = Reanimated.createAnimatedComponent(Path);

// The icon's press-and-hold depress, its completion-pop peak (explicit and guaranteed, not
// physics-estimated -- see the comment in the completion effect for why), and how long the
// checkmark stays up before committing the completion. That hold is a plain fixed timeout, not
// the elastic spring's own "finished" callback, since that callback proved unreliable on Android
// for driving real control flow (measured 3-4s there instead of the physics-predicted few
// hundred ms).
const DEPRESS_SCALE = 0.9;
const POP_PEAK_SCALE = 1.2;
const COMPLETION_HOLD_DURATION = 750;

export type CardSide = 'task' | 'calendar' | 'stats';

interface TaskCardProps {
  task: Task;
  size: number;
  onLongPressCalendar?: () => void;
  onLongPressStats?: () => void;
  onLongPressTask?: () => void;
  onFlip?: (visibleSide: CardSide) => void;
  onLayout?: () => void;
}

interface CardTaskProps {
  task: Task;
  size: number;
  progress: SharedValue<number>;
  isPressed: boolean;
  isCompleting: boolean;
  onCompleted: () => void;
}

const CardTask = React.memo(({ task, size, progress, isPressed, isCompleting, onCompleted }: CardTaskProps) => {
  const { isTaskCompleted, getCompletionCount } = useTaskContext();
  const { showTaskName, showTaskCounter, showCardBackground } = useSettings();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const checkmarkOpacity = useSharedValue(0);
  const iconOpacity = useSharedValue(1);
  const scale = useSharedValue(1);
  const badgeScale = useSharedValue(1);
  const [showParticles, setShowParticles] = useState(false);

  // Scale the icon with the actual card size instead of a fixed 128px -- on a small grid
  // (3+ columns, narrow phones) a fixed-size icon left no room for the name/counter text
  // below it, silently squeezing them to zero height. Without a card background there's no
  // visual boundary to respect, so let the graphic claim even more of the tile.
  const iconSize = showCardBackground
    ? Math.max(48, Math.min(size * 0.68, 148))
    : Math.max(48, Math.min(size * 0.8, 176));
  const iconFontSize = iconSize / 2;
  const iconMarginBottom = Math.max(2, Math.min(size * 0.03, 8));

  const getStreakBadgeStyle = () => {
    const currentStreak = task.stats?.currentStreak || 0;
    const lastStreak = task.stats?.lastStreak || 0;
    const bestStreak = task.stats?.bestStreak || 0;
    const streakStatus = task.stats?.streakStatus;
    
    if (!streakStatus || streakStatus === 'never_started') {
      return null;
    }

    if (currentStreak > 0) {
      if (streakStatus === 'up_to_date') {
        return {
          backgroundColor: '#FF6B6B',
          icon: 'fire' as const,
          value: currentStreak,
          showTrophy: currentStreak === bestStreak
        };
      }
      return {
        backgroundColor: '#FFA726',
        icon: 'clock-outline' as const,
        value: currentStreak,
        showTrophy: currentStreak === bestStreak
      };
    }

    if (lastStreak > 0) {
      return {
        backgroundColor: '#90A4AE',
        icon: 'sleep' as const,
        value: lastStreak,
        showTrophy: false
      };
    }

    return null;
  };

  const streakBadgeStyle = getStreakBadgeStyle();

  const CIRCLE_STROKE_WIDTH = 8;
  const CIRCLE_RADIUS = 60;
  const CIRCLE_CENTER = 64;
  const INNER_CIRCLE_RADIUS = CIRCLE_RADIUS - CIRCLE_STROKE_WIDTH;

  const animatedProps = useAnimatedProps(() => {
    const angle = progress.value * 360;
    const radians = (angle - 90) * (Math.PI / 180);
    const x = CIRCLE_CENTER + INNER_CIRCLE_RADIUS * Math.cos(radians);
    const y = CIRCLE_CENTER + INNER_CIRCLE_RADIUS * Math.sin(radians);
    
    // Create the path for the pie slice
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

  // Animated pie slice showing how many of today's timesPerDay reps are logged so far --
  // eases toward the new fraction whenever a rep is logged, echoing the same sweep-in
  // motion as `animatedProps` above (the transient press-and-hold confirmation ring).
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

  const completed = isTaskCompleted(task) || isCompleting;

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }]
  }));

  useEffect(() => {
    if (streakBadgeStyle?.icon === 'fire') {
      badgeScale.value = withSequence(
        withSpring(1.2, { damping: 8, stiffness: 100 }),
        withSpring(1, { damping: 8, stiffness: 100 })
      );
      setShowParticles(true);
    }
  }, [task.stats?.currentStreak, streakBadgeStyle?.icon]);

  useEffect(() => {
    if (isCompleting) {
      // Fade out icon and show checkmark immediately -- it stays up for the entire pop.
      iconOpacity.value = withTiming(0, { duration: 120 });
      checkmarkOpacity.value = withTiming(1, { duration: 120 });

      // A spring's overshoot from a small starting displacement (0.9→1.0, only 0.1 of travel) is
      // physics-*estimated*, not guaranteed -- pushing `velocity` higher and higher never
      // produced a reliably dramatic result, because how much it actually overshoots by depends
      // on Reanimated's internal spring math, not just the numbers plugged in. So this no longer
      // asks a spring to produce the overshoot at all: it snaps to an explicit, guaranteed peak
      // (`POP_PEAK_SCALE`, a fixed target, not an estimate) with a fast `withTiming`, *then* a
      // separate spring eases it back down from there. Two chained animations, but no pause
      // between them -- the second starts the instant the first ends.
      //
      // For that return spring: `stiffness` sets how fast each oscillation cycle is (higher =
      // snappier bounces), `damping` sets how quickly those oscillations decay away (higher =
      // shorter overall settle time) -- they're independent knobs. Since the real-time-to-settle
      // depends on `damping` alone (not `stiffness`, given mass:1), raising `stiffness` further
      // fits *more* oscillation cycles into that same real-time envelope for free -- more visible
      // bounces, not a longer wait. Raising `damping` a little on top makes that envelope itself
      // decay a bit faster, as requested, without needing to sacrifice stiffness/bounce count to
      // get there.
      //
      // Reanimated's default `energyThreshold` (the combined kinetic+potential energy below which
      // it calls the spring "at rest" and snaps it to the target) was also cutting this over
      // before the decay had visibly finished -- read as an abrupt stop rather than a natural
      // fade-out. Tightened here so it keeps animating further into the tail of the decay first.
      scale.value = withSequence(
        withTiming(POP_PEAK_SCALE, { duration: 100, easing: Easing.out(Easing.cubic) }),
        withSpring(1, {
          damping: 23,
          stiffness: 1000,
          energyThreshold: 0.0001,
        })
      );

      // A plain fixed timeout, not the spring's own "finished" callback -- a previous version
      // relied on that callback to drive the checkmark reversal + onCompleted, but it measured
      // 3-4s on Android instead of the physics-predicted few hundred ms, so it can't drive real
      // control flow.
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
    <View style={styles.contentContainer}>
      <Reanimated.View style={[styles.iconContainer, { width: iconSize, height: iconSize, borderRadius: iconSize / 2, marginBottom: iconMarginBottom, backgroundColor: 'transparent' }, containerStyle]}>
        <Svg width={iconSize} height={iconSize} viewBox="0 0 128 128">
          {/* Outer circle (border) */}
          <Circle
            cx={CIRCLE_CENTER}
            cy={CIRCLE_CENTER}
            r={CIRCLE_RADIUS}
            stroke={task.color}
            strokeWidth={CIRCLE_STROKE_WIDTH}
            fill={completed ? task.color : 'none'}
          />
          {/* Today's times-per-day progress, when this task requires more than one rep a day */}
          {!completed && timesPerDayCount > 1 && (
            <AnimatedPath fill={task.color} opacity={0.35} animatedProps={dayProgressAnimatedProps} />
          )}
          {/* Inner circle (progress) */}
          {!completed && (
            <AnimatedPath
              fill={task.color}
              animatedProps={animatedProps}
            />
          )}
        </Svg>
        <Reanimated.View style={[StyleSheet.absoluteFill, iconStyle]}>
          <MaterialCommunityIcons
            name={task.icon}
            size={iconFontSize}
            color={completed ? '#fff' : task.color}
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
            color="#fff"
            style={{
              textAlign: 'center',
              textAlignVertical: 'center',
              lineHeight: iconSize
            }}
          />
        </Reanimated.View>
      </Reanimated.View>
      {(showTaskName || (timesPerDayCount > 1 && showTaskCounter)) && (
        <View style={styles.titleRow}>
          {showTaskName && (
            <Text style={styles.taskName} numberOfLines={1}>{task.name}</Text>
          )}
          {timesPerDayCount > 1 && showTaskCounter && (
            <Text style={[styles.progressCountText, { color: task.color }]}>
              {completionCount}/{timesPerDayCount}
            </Text>
          )}
        </View>
      )}
      {streakBadgeStyle && (
        <Reanimated.View style={[styles.streakBadge, badgeStyle]}>
          <View style={[styles.streakBubble, { backgroundColor: streakBadgeStyle.backgroundColor }]}>
            <MaterialCommunityIcons name={streakBadgeStyle.icon} size={14} color="#fff" />
            <Text style={styles.streakText}>{streakBadgeStyle.value}</Text>
          </View>
          {streakBadgeStyle.showTrophy && (
            <MaterialCommunityIcons 
              name="trophy" 
              size={20} 
              color="#FFD700" 
              style={styles.trophyIcon} 
            />
          )}
          {showParticles && (
            <ParticleSystem 
              onComplete={() => setShowParticles(false)}
            />
          )}
        </Reanimated.View>
      )}
    </View>
  );
});

CardTask.displayName = 'CardTask';

const CardCalendar = React.memo(({ task }: { task: Task }) => {
  const { isTaskCompleted, getCompletionCount } = useTaskContext();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const today = format(new Date(), 'yyyy-MM-dd');
  const currentMonth = new Date();
  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDayOfMonth = startOfMonth(currentMonth);
  const startingDayOfWeek = getDay(firstDayOfMonth);

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i + 1);
    const dateString = format(date, 'yyyy-MM-dd');
    const completionCount = getCompletionCount(task, date);
    const isCompleted = isTaskCompleted(task, date);
    const isPartial = completionCount > 0 && !isCompleted;
    const isToday = dateString === today;
    const isPast = dateString < today;
    const isMissed = isPast && !isCompleted && !isPartial;
    return {
      date,
      isCompleted,
      isPartial,
      completionCount,
      isToday,
      isMissed,
      dayNumber: i + 1
    };
  });

  // Pad the tail to a full multiple of 7 too, matching the leading padding.
  const trailingBlanks = getTrailingBlankCount(startingDayOfWeek, days.length);

  return (
    <View style={styles.calendarContainer}>
      <View style={styles.calendarGrid}>
        <View style={styles.calendarDayNames}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
            <Text key={index} style={styles.calendarDayName}>{day}</Text>
          ))}
        </View>
        <FlatList
          data={[
            ...Array(startingDayOfWeek).fill(null),
            ...days,
            ...Array(trailingBlanks).fill(null)
          ]}
          renderItem={({ item: day, index }) => (
            <View style={styles.calendarDay}>
              {day ? (
                <View style={styles.calendarDayInner}>
                  {day.isCompleted ? (
                    <View style={[styles.calendarDot, { backgroundColor: task.color }]} />
                  ) : day.isPartial ? (
                    <View style={[styles.calendarDot, day.isToday && { borderWidth: 2, borderColor: task.color }]}>
                      <PartialDayPie fraction={day.completionCount / (task.timesPerDay || 1)} color={task.color} />
                    </View>
                  ) : day.isToday ? (
                    <View style={[styles.calendarDot, { borderWidth: 2, borderColor: task.color, backgroundColor: 'transparent' }]} />
                  ) : day.isMissed ? (
                    <MissedDayMark color={colors.textTertiary} size={11} />
                  ) : (
                    <View style={[styles.calendarDot, styles.calendarDotFuture]} />
                  )}
                </View>
              ) : null}
            </View>
          )}
          numColumns={7}
          scrollEnabled={false}
          keyExtractor={(_, index) => index.toString()}
        />
      </View>
    </View>
  );
});

CardCalendar.displayName = 'CardCalendar';

// Shared by the "This week" / "Past 30 days" rows: label truncates instead of wrapping (the
// value never shrinks, so a long label never pushes into or wraps around the "x/y" text), and
// `completed` exceeding `total` (a prorated quota target got outpaced) renders as a small bonus
// star rather than an overflowed/broken progress bar.
const PeriodStatRow: React.FC<{
  label: string;
  completed: number;
  total: number;
  color: string;
  styles: ReturnType<typeof createStyles>;
}> = ({ label, completed, total, color, styles }) => {
  const isBonus = completed > total;
  const fraction = total > 0 ? completed / total : 0;

  return (
    <>
      <View style={styles.statRow}>
        <Text style={styles.statLabel} numberOfLines={1} ellipsizeMode="tail">{label}</Text>
        <View style={styles.statValueRow}>
          <Text style={[styles.statValue, isBonus && { color }]}>{completed}/{total}</Text>
          {isBonus && <MaterialCommunityIcons name="star" size={14} color={color} />}
        </View>
      </View>
      <View style={[styles.progressBar, { backgroundColor: color + '33' }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: color, width: `${Math.min(fraction * 100, 100)}%` as const }
          ]}
        />
      </View>
    </>
  );
};

const CardStats = React.memo(({ task }: { task: Task }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const requiredTimes = task.timesPerDay || 1;

  const getWeeklyStats = () => {
    const today = new Date();
    const weekStart = startOfWeek(today);
    const completions = task.completions?.filter(completion => {
      const date = parseISO(completion.date);
      return date >= weekStart && date <= today && completion.timesCompleted >= requiredTimes;
    }) || [];
    return {
      completed: completions.length,
      // Full 7-day week (not just the days elapsed so far) so the total doesn't shrink mid-week.
      total: getExpectedPeriodTotal(task, weekStart, endOfWeek(today), 7),
    };
  };

  const getMonthlyStats = () => {
    const today = new Date();
    const thirtyDaysAgo = addDays(today, -30);
    const completions = task.completions?.filter(completion => {
      const date = parseISO(completion.date);
      return date >= thirtyDaysAgo && date <= today && completion.timesCompleted >= requiredTimes;
    }) || [];
    return {
      completed: completions.length,
      total: getExpectedPeriodTotal(task, thirtyDaysAgo, today, 30),
    };
  };

  const weeklyStats = getWeeklyStats();
  const monthlyStats = getMonthlyStats();
  const isBestStreak = task.stats?.currentStreak === task.stats?.bestStreak && (task.stats?.bestStreak || 0) > 0;

  return (
    <View style={styles.statsContainer}>
      <View style={styles.statRow}>
        <Text style={styles.statLabel}>Streak: <Text style={styles.statValue}>{task.stats?.currentStreak || 0}</Text></Text>
        {isBestStreak ? (
          <View style={styles.bestStreakContainer}>
            <MaterialCommunityIcons name="trophy" size={16} color="#FFD700" />
            <Text style={[styles.statLabel, styles.bestStreakText]}>Best!</Text>
          </View>
        ) : (
          <Text style={styles.statLabel}>Best: <Text style={styles.statValue}>{task.stats?.bestStreak || 0}</Text></Text>
        )}
      </View>
      <View style={[styles.progressBar, { backgroundColor: task.color + '33' }]}>
        <View 
          style={[
            styles.progressFill, 
            { 
              backgroundColor: task.color,
              width: `${Math.min((task.stats?.currentStreak || 0) / 10 * 100, 100)}%` as const
            }
          ]} 
        />
      </View>

      <PeriodStatRow label="This week" completed={weeklyStats.completed} total={weeklyStats.total} color={task.color} styles={styles} />
      <PeriodStatRow label="Past 30 days" completed={monthlyStats.completed} total={monthlyStats.total} color={task.color} styles={styles} />
    </View>
  );
});

CardStats.displayName = 'CardStats';

export const TaskCard = React.memo(React.forwardRef<View, TaskCardProps>(({
  task,
  size,
  onLongPressCalendar,
  onLongPressStats,
  onLongPressTask,
  onFlip,
  onLayout,
}: TaskCardProps, ref) => {
  const { showCardBackground } = useSettings();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const flipAnim = useSharedValue(0);
  const scaleAnim = useSharedValue(1);
  const progressAnim = useSharedValue(0);
  const [sides, setSides] = useState<[CardSide, CardSide]>(['task', 'calendar']);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const handlePressIn = () => {
    scaleAnim.value = withSpring(0.95, { damping: 8, stiffness: 100 });
    progressAnim.value = withTiming(0.99999, { duration: 500 });
    setIsPressed(true);
  };

  const handlePressOut = () => {
    scaleAnim.value = withSpring(1, { damping: 8, stiffness: 100 });
    progressAnim.value = withTiming(0, { duration: 200 });
    setIsPressed(false);
  };

  const handleLongPress = () => {
    const visibleSide = isFlipped ? sides[1] : sides[0];
    if (visibleSide === 'calendar' && onLongPressCalendar) {
      onLongPressCalendar();
    } else if (visibleSide === 'stats' && onLongPressStats) {
      onLongPressStats();
    } else if (visibleSide === 'task' && onLongPressTask) {
      setIsCompleting(true);
    }
  };

  const flipCard = () => {
    const nextSides: [CardSide, CardSide] = [...sides];
    if (!isFlipped) {
      // Flipping to back, update back side
      if (sides[0] === 'task') {
        nextSides[1] = 'calendar';
      } else if (sides[0] === 'calendar') {
        nextSides[1] = 'stats';
      } else if (sides[0] === 'stats') {
        nextSides[1] = 'task';
      }
    } else {
      // Flipping to front, update front side
      if (sides[1] === 'calendar') {
        nextSides[0] = 'stats';
      } else if (sides[1] === 'stats') {
        nextSides[0] = 'task';
      } else if (sides[1] === 'task') {
        nextSides[0] = 'calendar';
      }
    }
    setSides(nextSides);
    const nextIsFlipped = !isFlipped;
    setIsFlipped(nextIsFlipped);
    onFlip?.(nextIsFlipped ? nextSides[1] : nextSides[0]);

    flipAnim.value = withTiming(isFlipped ? 0 : 1, {
      duration: 800,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  };

  const frontAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotateY: `${flipAnim.value * 180}deg`,
      },
      { scale: scaleAnim.value }
    ],
  }));

  const backAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotateY: `${180 + flipAnim.value * 180}deg`,
      },
      { scale: scaleAnim.value }
    ],
  }));

  const handleTaskCompleted = useCallback(() => {
    onLongPressTask?.();
  }, [onLongPressTask]);

  useEffect(() => {
    setIsCompleting(false);
  }, [task])

  const renderContent = (side: CardSide) => {
    switch (side) {
      case 'task':
        return <CardTask task={task} size={size} progress={progressAnim} isPressed={isPressed} isCompleting={isCompleting} onCompleted={handleTaskCompleted} />;
      case 'calendar':
        return <CardCalendar task={task} />;
      case 'stats':
        return <CardStats task={task} />;
    }
  };

  return (
    <View ref={ref} onLayout={onLayout} style={[styles.container, { width: size, height: size }]}>
      <Pressable
        onPress={flipCard} 
        onLongPress={handleLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        delayLongPress={500}
        style={styles.touchable}
      >
        <Reanimated.View style={[styles.cardContainer, frontAnimatedStyle]}>
          <View style={[styles.card, !showCardBackground && styles.cardTransparent]}>
            {renderContent(sides[0])}
          </View>
        </Reanimated.View>

        <Reanimated.View style={[styles.cardContainer, styles.cardBack, backAnimatedStyle]}>
          <View style={[styles.card, !showCardBackground && styles.cardTransparent]}>
            {renderContent(sides[1])}
          </View>
        </Reanimated.View>
      </Pressable>
    </View>
  );
}));

TaskCard.displayName = 'TaskCard';

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  touchable: {
    flex: 1,
  },
  cardContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backfaceVisibility: 'hidden',
  },
  card: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardBack: {
    transform: [{ rotateY: '180deg' }],
  },
  cardTransparent: {
    backgroundColor: 'transparent',
    elevation: 0,
    shadowOpacity: 0,
    padding: 2,
  },
  contentContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  taskName: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'center',
  },
  progressCountText: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '600',
  },
  streakBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakBubble: {
    backgroundColor: '#FF6B6B',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  streakText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  calendarContainer: {
    flex: 1,
    padding: 12,
  },
  calendarGrid: {
    flex: 1,
  },
  calendarDayNames: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calendarDayName: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    color: colors.textSecondary,
  },
  calendarDay: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  calendarDayInner: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    aspectRatio: 1,
  },
  calendarDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  calendarDotFuture: {
    opacity: 0.3,
  },
  calendarX: {
    fontSize: 24,
    color: '#E0E0E0',
    fontWeight: '300',
    lineHeight: 24,
  },
  statsContainer: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    flexShrink: 1,
    marginRight: 8,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    flexShrink: 0,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  trophyIcon: {
    marginLeft: 2,
  },
  bestStreakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bestStreakText: {
    color: '#FFD700',
    fontWeight: '600',
  },
}); 