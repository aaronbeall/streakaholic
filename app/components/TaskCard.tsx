import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { addDays, endOfWeek, format, getDay, getDaysInMonth, parseISO, startOfMonth, startOfWeek, subDays } from 'date-fns';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityActionEvent,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import Reanimated, {
  Easing,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { useFireCelebration } from '../hooks/useFireCelebration';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { useSettingsStore } from '../stores/settingsStore';
import { Task } from '../types';
import { MissedDayMark } from './MissedDayMark';
import { SkippedDayMark } from './SkippedDayMark';
import { ParticleSystem } from './ParticleSystem';
import { PartialDayPie } from './PartialDayPie';
import { TaskProgressIcon } from './TaskProgressIcon';
import { getTrailingBlankCount } from '../utils/calendarGrid';
import { getExpectedPeriodTotal } from '../utils/periodStats';
import { getDayStreakState, getTaskStreakChains, isConnectedDay } from '../utils/reports';
import { getCachedCompletionCountsByDate, getCompletionCount, getStreakBadgeStyle, isTaskCompleted } from '../utils/streaks';

// A rough estimate of the streak *bubble*'s own rendered bounds (icon + streak count text,
// padding -- deliberately not including the optional trophy icon, which sits outside the bubble
// itself and shouldn't be covered by the spawn area), used as `ParticleSystem`'s `spawnArea` --
// the bubble's actual size only varies by a couple pixels either way (streak digit count), so an
// estimate is close enough without needing to measure it via `onLayout`. Module-level so it's a
// stable reference across renders (matters since it's a prop on `ParticleSystem`, a `React.memo`'d
// component).
//
// Shaped as a capsule (a line segment thickened by `radius`) rather than a rectangle -- the
// bubble itself is a pill (`streakBubble`'s `borderRadius: 16` on a ~28px-tall bar rounds it into
// a full stadium shape), so a capsule spawn area matches its actual rounded silhouette instead of
// scattering particles into the rectangle's corners, which would read as blocky against a round
// source. `radius` is half the estimated height (14); the line runs between the two points that
// height would sweep out if slid across the estimated width, i.e. inset from each edge by that
// same radius.
const ESTIMATED_BADGE_HEIGHT = 28;
const ESTIMATED_BADGE_WIDTH = 48;
const ESTIMATED_BADGE_RADIUS = ESTIMATED_BADGE_HEIGHT / 2;
const ESTIMATED_BADGE_SPAWN_AREA = {
  start: { x: ESTIMATED_BADGE_RADIUS, y: ESTIMATED_BADGE_RADIUS },
  end: { x: ESTIMATED_BADGE_WIDTH - ESTIMATED_BADGE_RADIUS, y: ESTIMATED_BADGE_RADIUS },
  radius: ESTIMATED_BADGE_RADIUS,
};
// TEMP DEBUG -- flip off (or delete this flag and its render block below) once the capsule shape
// is visually confirmed against the real badge.
const DEBUG_SHOW_SPAWN_AREA = false;

export type CardSide = 'task' | 'calendar' | 'stats';

interface TaskCardProps {
  task: Task;
  size: number;
  // Take the task's id rather than being pre-bound to one task -- lets a parent (HomeScreen) hand
  // every card the exact same stable, useCallback'd function reference instead of constructing a
  // fresh closure per card per render, which used to defeat this component's own React.memo.
  onLongPressCalendar?: (taskId: string) => void;
  onLongPressStats?: (taskId: string) => void;
  onLongPressTask?: (taskId: string) => void;
  // Long-pressing the task face of an *already-completed* task is a separate gesture from
  // completing it -- opens task-detail (whichever tab was last viewed) instead, with no
  // completion animation. Kept distinct from `onLongPressTask` rather than having that same
  // prop branch on completed state itself, so neither callback has to know about the other's case.
  onLongPressCompletedTask?: (taskId: string) => void;
  onFlip?: (taskId: string, visibleSide: CardSide) => void;
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
  // Three independent primitive selectors (not one bulk-destructured object) -- each only
  // re-renders this card when that specific flag changes, not on unrelated settings changes
  // (e.g. themeMode, dashboardLastTab) the way a single wide-context read used to.
  const showTaskName = useSettingsStore(state => state.showTaskName);
  const showTaskCounter = useSettingsStore(state => state.showTaskCounter);
  const showCardBackground = useSettingsStore(state => state.showCardBackground);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { streakBadgeStyle, badgeAnimatedStyle, showParticles, celebrationKey, handleParticlesComplete } = useFireCelebration(task);

  // Scale the icon with the actual card size instead of a fixed 128px -- on a small grid
  // (3+ columns, narrow phones) a fixed-size icon left no room for the name/counter text
  // below it, silently squeezing them to zero height. Without a card background there's no
  // visual boundary to respect, so let the graphic claim even more of the tile.
  const iconSize = showCardBackground
    ? Math.max(48, Math.min(size * 0.68, 148))
    : Math.max(48, Math.min(size * 0.8, 176));
  const iconFontSize = iconSize / 2;
  const iconMarginBottom = Math.max(2, Math.min(size * 0.03, 8));

  const timesPerDayCount = task.timesPerDay || 1;
  const completionCount = getCompletionCount(task);

  return (
    <View style={styles.contentContainer}>
      <View style={{ marginBottom: iconMarginBottom }}>
        <TaskProgressIcon
          task={task}
          iconSize={iconSize}
          iconFontSize={iconFontSize}
          progress={progress}
          isPressed={isPressed}
          isCompleting={isCompleting}
          onCompleted={onCompleted}
        />
      </View>
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
        <Reanimated.View style={[styles.streakBadge, badgeAnimatedStyle]}>
          <View style={[styles.streakBubble, { backgroundColor: streakBadgeStyle.color }]}>
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
              key={celebrationKey}
              onComplete={handleParticlesComplete}
              spawnArea={ESTIMATED_BADGE_SPAWN_AREA}
            />
          )}
          {/* TEMP DEBUG -- visualizing ESTIMATED_BADGE_SPAWN_AREA's capsule shape to confirm it
              against the real badge before removing this block. */}
          {DEBUG_SHOW_SPAWN_AREA && (
            <>
              <View
                pointerEvents="none"
                style={[
                  styles.debugSpawnCapsuleBody,
                  {
                    left: ESTIMATED_BADGE_SPAWN_AREA.start.x,
                    top: ESTIMATED_BADGE_SPAWN_AREA.start.y - ESTIMATED_BADGE_SPAWN_AREA.radius,
                    width: ESTIMATED_BADGE_SPAWN_AREA.end.x - ESTIMATED_BADGE_SPAWN_AREA.start.x,
                    height: ESTIMATED_BADGE_SPAWN_AREA.radius * 2,
                  },
                ]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.debugSpawnCircle,
                  {
                    left: ESTIMATED_BADGE_SPAWN_AREA.start.x - ESTIMATED_BADGE_SPAWN_AREA.radius,
                    top: ESTIMATED_BADGE_SPAWN_AREA.start.y - ESTIMATED_BADGE_SPAWN_AREA.radius,
                    width: ESTIMATED_BADGE_SPAWN_AREA.radius * 2,
                    height: ESTIMATED_BADGE_SPAWN_AREA.radius * 2,
                    borderRadius: ESTIMATED_BADGE_SPAWN_AREA.radius,
                  },
                ]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.debugSpawnCircle,
                  {
                    left: ESTIMATED_BADGE_SPAWN_AREA.end.x - ESTIMATED_BADGE_SPAWN_AREA.radius,
                    top: ESTIMATED_BADGE_SPAWN_AREA.end.y - ESTIMATED_BADGE_SPAWN_AREA.radius,
                    width: ESTIMATED_BADGE_SPAWN_AREA.radius * 2,
                    height: ESTIMATED_BADGE_SPAWN_AREA.radius * 2,
                    borderRadius: ESTIMATED_BADGE_SPAWN_AREA.radius,
                  },
                ]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.debugSpawnLine,
                  {
                    left: ESTIMATED_BADGE_SPAWN_AREA.start.x,
                    top: ESTIMATED_BADGE_SPAWN_AREA.start.y - 1,
                    width: ESTIMATED_BADGE_SPAWN_AREA.end.x - ESTIMATED_BADGE_SPAWN_AREA.start.x,
                  },
                ]}
              />
            </>
          )}
        </Reanimated.View>
      )}
    </View>
  );
});

CardTask.displayName = 'CardTask';

const CardCalendar = React.memo(({ task }: { task: Task }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const today = format(new Date(), 'yyyy-MM-dd');
  const currentMonth = new Date();
  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDayOfMonth = startOfMonth(currentMonth);
  const startingDayOfWeek = getDay(firstDayOfMonth);

  // Retrieved from the shared immutable-reference cache instead of a `.find()` scan
  // per day -- this grid does up to ~31 lookups against the same array, so this turns that into
  // one O(completions) pass plus O(1) lookups, and derives isCompleted from the same looked-up
  // count instead of also calling isTaskCompleted (which would repeat the same lookup again).
  const completionCounts = useMemo(() => getCachedCompletionCountsByDate(task.completions || []), [task.completions]);
  const requiredTimes = task.timesPerDay || 1;
  // Memoized once per task rather than recomputed per empty cell -- getTaskStreakChains walks
  // the task's full history, so this turns a per-cell cost back into a per-render one.
  const streakChains = useMemo(() => getTaskStreakChains(task), [task]);

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i + 1);
    const dateString = format(date, 'yyyy-MM-dd');
    const completionCount = completionCounts.get(dateString) ?? 0;
    const isCompleted = completionCount >= requiredTimes;
    const isPartial = completionCount > 0 && !isCompleted;
    const isToday = dateString === today;
    const isPast = dateString < today;
    const isEmpty = isPast && !isCompleted && !isPartial;
    const streakState = isEmpty ? getDayStreakState(task, date, streakChains, completionCounts) : null;
    const isMissed = streakState === 'hardMiss';
    const isSkipped = streakState === 'connected';
    const isSoftMissed = streakState === 'softMiss';
    // Only completed days need an explicit connector stub -- a skipped day's own line already
    // spans its full cell width unconditionally (see SkippedDayMark), so it never needs one.
    const hasLeftConnector = isCompleted && isConnectedDay(task, subDays(date, 1), streakChains, completionCounts);
    const hasRightConnector = isCompleted && isConnectedDay(task, addDays(date, 1), streakChains, completionCounts);
    return {
      date,
      isCompleted,
      isPartial,
      completionCount,
      isToday,
      isMissed,
      isSkipped,
      isSoftMissed,
      hasLeftConnector,
      hasRightConnector,
      dayNumber: i + 1
    };
  });

  // Pad the tail to a full multiple of 7 too, matching the leading padding.
  const trailingBlanks = getTrailingBlankCount(startingDayOfWeek, days.length);

  // Chunked into week-rows via a plain array instead of a FlatList with numColumns -- this grid
  // is small and fully bounded (at most 6 weeks), so the VirtualizedList machinery a FlatList
  // carries (windowing, scroll-event bookkeeping) was pure overhead for something never actually
  // scrolled (scrollEnabled was already false). Matches the same plain-row pattern already used
  // for the other bounded calendar grids elsewhere (DashboardCalendarView's mini month grids,
  // TaskCalendarScreen's Year-mode dot grids).
  const cells: (typeof days[number] | null)[] = [
    ...Array(startingDayOfWeek).fill(null),
    ...days,
    ...Array(trailingBlanks).fill(null),
  ];
  const weeks: (typeof days[number] | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return (
    <View style={styles.calendarContainer}>
      <View style={styles.calendarGrid}>
        <View style={styles.calendarDayNames}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
            <Text key={index} style={styles.calendarDayName}>{day}</Text>
          ))}
        </View>
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.calendarWeekRow}>
            {week.map((day, dayIndex) => (
              <View key={dayIndex} style={styles.calendarDay}>
                {day ? (
                  <View style={styles.calendarDayInner}>
                    {day.isCompleted ? (
                      <>
                        {day.hasLeftConnector && (
                          <View style={styles.leftConnector}><SkippedDayMark color={task.color} /></View>
                        )}
                        {day.hasRightConnector && (
                          <View style={styles.rightConnector}><SkippedDayMark color={task.color} /></View>
                        )}
                        <View style={[styles.calendarDot, { backgroundColor: task.color }]} />
                      </>
                    ) : day.isPartial ? (
                      <View style={[styles.calendarDot, day.isToday && { borderWidth: 2, borderColor: task.color }]}>
                        <PartialDayPie fraction={day.completionCount / (task.timesPerDay || 1)} color={task.color} />
                      </View>
                    ) : day.isToday ? (
                      <View style={[styles.calendarDot, { borderWidth: 2, borderColor: task.color, backgroundColor: 'transparent' }]} />
                    ) : day.isMissed ? (
                      <MissedDayMark color={colors.textTertiary} size={11} />
                    ) : day.isSkipped ? (
                      <View style={styles.calendarSkippedLineWrap}>
                        <SkippedDayMark color={task.color} thickness={4} />
                      </View>
                    ) : (
                      // Covers both an actual future day and a "soft miss" (isSoftMissed) --
                      // an empty day with no streak currently at stake, neither a hard miss nor
                      // a connecting skip. Both read identically: a plain faded, empty dot.
                      <View style={[styles.calendarDot, styles.calendarDotFuture]} />
                    )}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ))}
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
    <View style={styles.periodStatGroup}>
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
    </View>
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
  const currentStreak = task.stats?.currentStreak || 0;
  const bestStreak = task.stats?.bestStreak || 0;
  const isBestStreak = currentStreak === bestStreak && bestStreak > 0;
  // Same status -> icon/color mapping the front face's own badge uses, so the two faces of the
  // same card agree on what a streak's current state looks like instead of the stats face using
  // a flat neutral tint regardless of whether the streak is live, expiring, or dormant.
  const streakBadgeStyle = getStreakBadgeStyle(task);
  const currentStreakColor = streakBadgeStyle?.color ?? colors.textSecondary;
  // Scaled against this task's own best streak (not a flat constant) so the bar means the same
  // thing -- "how close to your personal record" -- for a task whose best is 4 days as for one
  // whose best is 40. Hits 100% exactly when isBestStreak does.
  const streakBarFraction = bestStreak > 0 ? Math.min(currentStreak / bestStreak, 1) : 0;

  return (
    <View style={styles.statsContainer}>
      <View style={styles.periodStatGroup}>
        <View style={styles.statRow}>
          <View style={styles.statValueRow}>
            <MaterialCommunityIcons name={streakBadgeStyle?.icon ?? 'fire'} size={16} color={currentStreakColor} />
            <Text style={styles.statValue} numberOfLines={1}>{currentStreak}</Text>
          </View>
          <View style={styles.statValueRow}>
            <MaterialCommunityIcons name="trophy" size={16} color={isBestStreak ? '#FFD700' : colors.textSecondary} />
            {isBestStreak ? (
              <Text style={styles.bestStreakText} numberOfLines={1}>BEST!</Text>
            ) : (
              <Text style={styles.statValue} numberOfLines={1}>{bestStreak}</Text>
            )}
          </View>
        </View>
        <View style={[styles.progressBar, { backgroundColor: task.color + '33' }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: task.color, width: `${streakBarFraction * 100}%` as const }
            ]}
          />
        </View>
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
  onLongPressCompletedTask,
  onFlip,
  onLayout,
}: TaskCardProps, ref) => {
  const showCardBackground = useSettingsStore(state => state.showCardBackground);
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
    // Immediate tactile acknowledgment that the hold registered, before whatever it triggers
    // (navigation, or the completion pop below) actually plays out.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const visibleSide = isFlipped ? sides[1] : sides[0];
    if (visibleSide === 'calendar' && onLongPressCalendar) {
      onLongPressCalendar(task.id);
    } else if (visibleSide === 'stats' && onLongPressStats) {
      onLongPressStats(task.id);
    } else if (visibleSide === 'task') {
      // An already-completed task has nothing left to complete -- open task-detail directly
      // (no completion pop first) rather than running the completion animation and only
      // afterward discovering there was nothing to commit.
      if (isTaskCompleted(task)) {
        onLongPressCompletedTask?.(task.id);
      } else if (onLongPressTask) {
        setIsCompleting(true);
      }
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
    onFlip?.(task.id, nextIsFlipped ? nextSides[1] : nextSides[0]);

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
    onLongPressTask?.(task.id);
  }, [onLongPressTask, task.id]);

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

  // The long-press gesture that completes a task / opens the full Calendar or Stats screen is
  // hard for screen reader users to perform (VoiceOver/TalkBack's own double-tap already maps to
  // onPress/flipCard, and a physical long-press isn't a standard screen-reader gesture) -- exposed
  // here as a discoverable custom accessibilityAction instead, routed through the same
  // `handleLongPress` the physical gesture uses, so the two stay in sync automatically.
  const visibleSide = isFlipped ? sides[1] : sides[0];
  const longPressActionLabel = visibleSide === 'task'
    ? (isTaskCompleted(task) ? 'Open task details' : 'Mark complete')
    : visibleSide === 'calendar'
    ? 'Open full calendar'
    : 'Open full stats';

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'longpress') {
      handleLongPress();
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
        accessibilityRole="button"
        accessibilityLabel={`${task.name}, ${visibleSide} view`}
        accessibilityHint="Double tap to flip to the next view"
        accessibilityActions={[{ name: 'longpress', label: longPressActionLabel }]}
        onAccessibilityAction={handleAccessibilityAction}
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
    // No flex here -- width/height are always passed explicitly via the `size` prop. `flex: 1`
    // implies flexBasis: 0% on the main axis, which takes precedence over an explicit `width` in
    // a flexDirection: 'row' parent (HomeScreen's FlatList columnWrapperStyle) and let flexGrow
    // stretch a lone last-row card (an incomplete final row) to fill the row's leftover space.
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
  calendarWeekRow: {
    flexDirection: 'row',
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
  // A completed day's connector stub -- half the cell's width, anchored to that side, rendered
  // behind the solid dot (which covers its inner half) so only the outer stub reaching toward
  // the cell edge shows. Matches SkippedDayMark's own opacity so the connecting thread reads
  // consistently whether it's passing behind a dot or standing alone across a skipped day.
  leftConnector: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '50%',
    justifyContent: 'center',
    opacity: 0.3,
  },
  rightConnector: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: '50%',
    justifyContent: 'center',
    opacity: 0.3,
  },
  // A soft-skip day on this particular face reads as a short, thick, semi-transparent tick
  // rather than the full-width edge-to-edge connector the other calendars use -- at this small
  // a cell size (this is the densest calendar grid in the app), a thin line spanning the whole
  // cell read as too faint/busy; a short bold tick is more legible without needing to actually
  // touch neighboring cells the way the larger calendars' connecting line does.
  calendarSkippedLineWrap: {
    width: '55%',
    alignSelf: 'center',
    opacity: 0.5,
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
    // The space *between* each stat group (streak, this week, past 30 days) -- deliberately
    // larger than periodStatGroup's own internal gap below, so each label reads as grouped with
    // its own bar rather than sitting evenly between the bar above and the label below it.
    gap: 12,
  },
  // Wraps a stat row + its own progress bar as one visual unit -- a small internal gap keeps the
  // label close to the bar it describes, distinct from statsContainer's larger between-group gap.
  periodStatGroup: {
    gap: 4,
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
  // TEMP DEBUG -- see DEBUG_SHOW_SPAWN_AREA above; remove alongside it.
  debugSpawnCapsuleBody: {
    position: 'absolute',
    backgroundColor: 'rgba(57, 255, 20, 0.25)',
  },
  debugSpawnCircle: {
    position: 'absolute',
    backgroundColor: 'rgba(57, 255, 20, 0.25)',
    borderWidth: 1,
    borderColor: '#39FF14',
  },
  debugSpawnLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#39FF14',
  },
  bestStreakText: {
    color: '#FFD700',
    fontWeight: '700',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
