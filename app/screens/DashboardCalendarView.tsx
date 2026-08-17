import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { differenceInCalendarDays, format, getDay, getDaysInMonth, isSameMonth, parseISO, startOfMonth, subDays } from 'date-fns';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View, ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { EntryAnimationsValues, LayoutAnimation, withTiming } from 'react-native-reanimated';
import Svg, { Line, Path } from 'react-native-svg';
import { EmptyState } from '../components/EmptyState';
import { MissedDayMark } from '../components/MissedDayMark';
import { PartialDayPie } from '../components/PartialDayPie';
import { StreakCountBadge } from '../components/StreakCountBadge';
import { useOnboardingHintTarget } from '../context/OnboardingHintsContext';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { Task } from '../types';
import { getTrailingBlankCount } from '../utils/calendarGrid';
import { buildDayConnectionInfo, getCachedTaskStreakChains, getDayStreakState } from '../utils/reports';
import { buildStreamLayerPath, computeStreamgraphLayers } from '../utils/streamgraph';
import { getCachedCompletionCountsByDate } from '../utils/streaks';

const GRID_LABEL_WIDTH = 36;
const GRID_CELL_SIZE = 32;
// Weekday letter (S/M/T/W/T/F/S) + day-of-month number -- rendered at both the top and bottom of
// the grid (see the render-site comment), so a task row far down the list is never more than a
// glance away from knowing which day its own column is. The month/year itself no longer lives
// here at all -- see timelineMonthLabel below for why a per-column abbreviation was dropped.
const GRID_WEEKDAY_HEIGHT = 14;
const GRID_DAY_HEADER_HEIGHT = 20;
const GRID_AXIS_HEIGHT = GRID_WEEKDAY_HEIGHT + GRID_DAY_HEADER_HEIGHT;
const DAYS_PAGE_SIZE = 30;
const EMPTY_COMPLETION_COUNTS: ReadonlyMap<string, number> = new Map();

// Bars mode's per-task segment unit height -- same as a single Grid-mode dot row, so a day where
// every task is fully done reaches exactly the same total height Grid mode's task rows already
// occupy (tasks.length * GRID_CELL_SIZE), keeping the two modes' vertical scale consistent.
const BAR_UNIT_HEIGHT = GRID_CELL_SIZE;
// A small cap on the topmost segment only, not every segment -- per explicit user direction
// ("a stacked bar chart"), segments now sit flush against each other with no per-segment gap or
// rounding, reading as one continuous multi-color bar rather than a stack of separate rounded
// pills; only the very top of the whole stack gets a soft corner, the same way a typical stacked
// bar chart's bar does, and the bottom stays square since it rests on the track's own baseline.
const BAR_SEGMENT_RADIUS = 4;
type MainGridMode = 'grid' | 'bars' | 'streamgraph';

// The day-tooltip card's reveal motion: grows downward out of the chart above it (height 0 -> its
// own natural height) rather than translating an already-fully-sized element in from off-screen
// the way Reanimated's built-in SlideInDown does -- that read as "arriving," not "extending out of
// the chart it's attached to." A custom entering worklet instead, animating `height` using
// Reanimated's own auto-measured targetHeight (no manual onLayout measurement needed) --
// dayTooltip's own `overflow: 'hidden'` clips its content while shorter than full height.
// Module-level (not defined inside the component) since worklets need a stable reference and
// don't depend on any component state -- durations are fixed constants.
//
// Deliberately no matching `exiting` animation -- per explicit user direction, closing (whether
// via the X button or tapping the same day again) removes the card immediately, no transition.
// Only the reveal is animated.
const dayTooltipEntering = (values: EntryAnimationsValues): LayoutAnimation => {
  'worklet';
  return {
    initialValues: { height: 0, opacity: 0 },
    animations: {
      height: withTiming(values.targetHeight, { duration: 220 }),
      opacity: withTiming(1, { duration: 160 }),
    },
  };
};

// Same per-day state shape as TaskCalendarView's Year-mode mini grid -- no due/not-due distinction,
// just completed/partial/future, matching that grid's already-established look.
type MonthDotCell = { isCompleted: boolean; isPartial: boolean; isFuture: boolean; fraction: number } | null;
const MONTH_DOT_GAP = 4;
const TASK_MONTH_CARD_GAP = 16;

// Same responsive breakpoints as HomeScreen's task grid -- 2 columns minimum, growing on wider
// screens rather than a fixed column count everywhere.
const getTaskMonthColumnCount = (width: number): number => {
  if (width >= 1200) return 4;
  if (width >= 900) return 3;
  return 2;
};

// Half of an assumed ~12px label line height -- vertically centers each tick label on its own
// tick point (position: 'absolute' + a computed `top`) rather than the label's own top edge
// landing there.
const Y_AXIS_LABEL_HALF_HEIGHT = 6;
// Ticks generated per whole task count ("0 tasks done" through "every task done"), scaling with
// how many are actually selected -- capped so a large task list doesn't cram the column past
// readability; beyond the cap, thins to evenly-spaced whole numbers instead of one per task.
const Y_AXIS_MAX_TICKS = 6;
const getYAxisTicks = (max: number): number[] => {
  if (max <= 0) return [];
  if (max <= Y_AXIS_MAX_TICKS) return Array.from({ length: max + 1 }, (_, i) => i);
  const step = Math.ceil(max / Y_AXIS_MAX_TICKS);
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  return ticks;
};

// A minimal fixed left-hand vertical axis for Bars/Streamgraph -- both charts share the exact
// same total vertical scale (`tasks.length * BAR_UNIT_HEIGHT`, "every selected task fully done
// that day"), so one small shared component covers both rather than duplicating the tick math and
// layout twice. Just a thin line (colors.border) and a handful of plain number labels -- no
// gridlines reaching across the chart, no axis title -- per explicit user direction ("minimalist
// axis and a few numbers"). Sits *outside* the horizontal FlatList/ScrollView as a fixed sibling
// (matching how Grid mode's own task-icon label column already stays put while its content
// scrolls), not inside the scrollable content.
//
// `mirrored` (Streamgraph only) accounts for the two charts' genuinely different scales: Bars is
// a flat-bottomed 0-to-max stack (0 at the very bottom, max at the top), but Streamgraph's own
// silhouette baseline centers every day's stack around 0 (see computeStreamgraphLayers) -- so its
// "0" is the vertical *middle* of the track, and a given magnitude can appear that far *either*
// above or below center, not just once climbing from a fixed bottom. Mirrored mode reflects that:
// every nonzero tick renders twice (once above center, once below, both showing the same
// magnitude), with a single unmirrored "0" at the true center.
const YAxisColumn: React.FC<{
  ticks: number[];
  max: number;
  height: number;
  mirrored?: boolean;
  styles: ReturnType<typeof createStyles>;
}> = ({ ticks, max, height, mirrored, styles }) => {
  const labels: { key: string; value: number; top: number }[] = [];
  if (max > 0) {
    for (const tick of ticks) {
      if (mirrored) {
        const half = height / 2;
        if (tick === 0) {
          labels.push({ key: '0', value: 0, top: half - Y_AXIS_LABEL_HALF_HEIGHT });
        } else {
          const offset = (tick / max) * half;
          labels.push({ key: `top-${tick}`, value: tick, top: half - offset - Y_AXIS_LABEL_HALF_HEIGHT });
          labels.push({ key: `bottom-${tick}`, value: tick, top: half + offset - Y_AXIS_LABEL_HALF_HEIGHT });
        }
      } else {
        labels.push({ key: `${tick}`, value: tick, top: height - (tick / max) * height - Y_AXIS_LABEL_HALF_HEIGHT });
      }
    }
  }
  return (
    <View style={styles.yAxisColumn}>
      <View style={{ height: GRID_AXIS_HEIGHT }} />
      <View style={[styles.yAxisTrack, { height }]}>
        {labels.map(label => (
          <Text key={label.key} style={[styles.yAxisLabel, { top: label.top }]}>{label.value}</Text>
        ))}
      </View>
    </View>
  );
};

// The global equivalent of a single task's TaskCalendarScreen -- every selected task's calendar
// overlaid into one grid instead of one task's month view. Always "infinite" (paginates further
// into the past as you scroll right), with no timeframe toggle of its own -- that concept lives
// on the Stats tab's Activity section instead, which is the thing that actually needs a bounded
// window.
export const DashboardCalendarView: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
  const router = useRouter();
  // The grid is its own thing, independent of any timeframe toggle -- always "infinite",
  // paginating further into the past as the user scrolls right. Starts with one page and grows
  // via onEndReached.
  const [loadedDays, setLoadedDays] = useState(DAYS_PAGE_SIZE);
  // Grid vs Bars only changes what each day column renders below its date header -- the
  // underlying FlatList (data, ref, scroll position, pagination) is shared, so toggling doesn't
  // reset or remount the scroll.
  const [mainGridMode, setMainGridMode] = useState<MainGridMode>('grid');
  // Which month the main grid is currently scrolled to -- drives the mini month grids below it,
  // so they always reflect whatever's actually in view rather than always showing "now".
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [taskMonthGridWidth, setTaskMonthGridWidth] = useState(0);
  // Tap-to-inspect a single day's column, Bars/Streamgraph only (see the render branches below) --
  // a `yyyy-MM-dd` string rather than a Date so it can be compared directly against the same
  // format every other per-day lookup in this file already uses.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { width: windowWidth } = useWindowDimensions();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const chartModesHint = useOnboardingHintTarget('dashboard-calendar-chart-modes', tasks.length > 0);

  const today = useMemo(() => new Date(), []);
  const todayStr = format(today, 'yyyy-MM-dd');

  // Retrieved once per task (the outer map is memoized on `tasks`, which changes reference when a
  // task is added/edited/completed/etc. -- see the taskStore migration notes) instead of a `.find()`
  // scan per (task, day) cell. Both the Timeline grid (up to ~30 visible day columns x
  // every selected task) and the per-task mini month grids below do many lookups against the same
  // task's completions, so this turns each into one O(completions) pass per task up front plus
  // O(1) lookups per cell after that -- and derives isCompleted from the same looked-up count
  // instead of a separate isTaskCompleted call repeating the same lookup.
  const completionCountsByTask = useMemo(
    () => new Map(tasks.map(task => [task.id, getCachedCompletionCountsByDate(task.completions || [])])),
    [tasks]
  );

  // The shared immutable-task cache means a new `tasks` array only reconstructs chains for task
  // objects that actually changed; unchanged task references are reused across every calendar.
  const streakChainsByTask = useMemo(
    () => new Map(tasks.map(task => [task.id, getCachedTaskStreakChains(task, today)])),
    [tasks, today]
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const handleViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length === 0) return;
    const anchor = viewableItems[Math.floor(viewableItems.length / 2)].item as Date;
    const monthStart = startOfMonth(anchor);
    setVisibleMonth(prev => (isSameMonth(prev, monthStart) ? prev : monthStart));
  }).current;
  const handleTaskMonthGridLayout = (event: LayoutChangeEvent) => {
    setTaskMonthGridWidth(event.nativeEvent.layout.width);
  };

  const taskMonthColumns = getTaskMonthColumnCount(windowWidth);
  const taskMonthCardWidth = taskMonthGridWidth > 0
    ? (taskMonthGridWidth - TASK_MONTH_CARD_GAP * (taskMonthColumns - 1)) / taskMonthColumns
    : 0;
  // Floored to a whole pixel -- a fractional dot size (and the fractional sub-pixel left offsets
  // it produces across the row) made corners anti-alias inconsistently from one dot to the next,
  // some reading crisply rounded and others almost square.
  const monthDotSize = taskMonthCardWidth > 0 ? Math.floor((taskMonthCardWidth - MONTH_DOT_GAP * 6) / 7) : 0;
  const monthDotRadius = Math.max(1, Math.round(monthDotSize * 0.25));

  // The blank/day layout of the visible month is identical for every task -- only which days are
  // completed/partial/future differs per task -- so this is computed once, not per task.
  const monthShape = useMemo(() => {
    const daysInThisMonth = getDaysInMonth(visibleMonth);
    const leadingBlanks = getDay(visibleMonth);
    const trailingBlanks = getTrailingBlankCount(leadingBlanks, daysInThisMonth);
    const totalCells = leadingBlanks + daysInThisMonth + trailingBlanks;
    return { daysInThisMonth, leadingBlanks, trailingBlanks, numWeeks: totalCells / 7 };
  }, [visibleMonth]);

  const buildMonthRows = (task: Task): MonthDotCell[][] => {
    const { daysInThisMonth, leadingBlanks, trailingBlanks } = monthShape;
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const requiredTimes = task.timesPerDay || 1;
    const completionCounts = completionCountsByTask.get(task.id);
    const cells: MonthDotCell[] = [
      ...Array(leadingBlanks).fill(null),
      ...Array.from({ length: daysInThisMonth }, (_, i): MonthDotCell => {
        const date = new Date(year, month, i + 1);
        const dateString = format(date, 'yyyy-MM-dd');
        const completionCount = completionCounts?.get(dateString) ?? 0;
        const isCompleted = completionCount >= requiredTimes;
        return {
          isCompleted,
          isPartial: completionCount > 0 && !isCompleted,
          isFuture: dateString > todayStr,
          fraction: Math.min(completionCount / requiredTimes, 1),
        };
      }),
      ...Array(trailingBlanks).fill(null),
    ];
    const rows: MonthDotCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  };

  // Newest first (today at index 0) -- scrolling right reveals further-past days, so the most
  // recent day reads on the left, matching how the rest of the grid should feel: "now" anchors
  // the view, history trails off to the right as you explore it.
  const days = useMemo(
    () => Array.from({ length: loadedDays }, (_, i) => subDays(today, i)),
    [loadedDays, today]
  );

  // Run-boundary/badge info per task, built once here rather than per cell -- see reports.ts's
  // buildDayConnectionInfo. Recomputed for every task whenever `days` grows (pagination further
  // into the past), matching the same full-recompute-on-change pattern the two maps above already
  // use in this file rather than an incremental cache.
  const dayConnectionInfoByTask = useMemo(
    () => new Map(tasks.map(task => [
      task.id,
      buildDayConnectionInfo(task, days, streakChainsByTask.get(task.id) ?? [], completionCountsByTask.get(task.id) ?? EMPTY_COMPLETION_COUNTS),
    ])),
    [tasks, days, streakChainsByTask, completionCountsByTask]
  );

  // Don't paginate forever into empty pre-history -- stop growing once we've reached back to
  // before the earliest task even existed.
  const earliestCreatedAt = useMemo(() => {
    if (tasks.length === 0) return null;
    return tasks.reduce((earliest, task) => (task.createdAt < earliest ? task.createdAt : earliest), tasks[0].createdAt);
  }, [tasks]);
  const maxDays = earliestCreatedAt
    ? Math.max(DAYS_PAGE_SIZE, differenceInCalendarDays(today, parseISO(earliestCreatedAt)) + 1)
    : DAYS_PAGE_SIZE;

  const handleEndReached = () => {
    setLoadedDays(prev => Math.min(prev + DAYS_PAGE_SIZE, maxDays));
  };

  // A selected day tied to a task set or a mode it no longer applies to (the task filter changed
  // out from under it, or the user switched to Grid, which has no tap interaction at all) would
  // otherwise leave a stale line/tooltip with nothing real behind it.
  useEffect(() => {
    setSelectedDate(null);
  }, [tasks, mainGridMode]);

  // Per explicit user direction, tapping the already-selected column again is a no-op rather than
  // a toggle-off -- the only way to close the card is its own X button (setSelectedDate(null)
  // directly, see the render site below).
  const handleColumnTap = (dateString: string) => {
    setSelectedDate(dateString);
  };

  // The tapped day's per-task summary for the tooltip -- a task only appears here if it was
  // actually completed that day (partial or full). Per explicit follow-up direction, pass-through
  // days (a task merely staying streak-connected with zero completion, e.g. a non-due day or an
  // open quota period) are excluded entirely now too, not just genuinely absent ones -- this
  // tooltip is specifically about what got *done*, not the full streak-connectivity picture the
  // calendars already show.
  const selectedDayEntries = useMemo(() => {
    if (!selectedDate) return null;
    return tasks
      .map(task => {
        const completionCount = completionCountsByTask.get(task.id)?.get(selectedDate) ?? 0;
        if (completionCount === 0) return null;
        const requiredTimes = task.timesPerDay || 1;
        const isCompleted = completionCount >= requiredTimes;
        const connection = dayConnectionInfoByTask.get(task.id)?.get(selectedDate);
        return {
          task,
          completionCount,
          requiredTimes,
          isCompleted,
          badgeValue: connection?.showStreakBadge ? connection.badgeValue : null,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [selectedDate, tasks, completionCountsByTask, dayConnectionInfoByTask]);

  // Streamgraph's selection line needs the tapped day's x position within the one continuous SVG
  // (unlike Bars mode, which just checks its own renderItem's own date against selectedDate).
  const selectedDayIndex = useMemo(
    () => (selectedDate ? days.findIndex(d => format(d, 'yyyy-MM-dd') === selectedDate) : -1),
    [selectedDate, days]
  );

  // Streamgraph mode doesn't fit the FlatList-per-day-column model Grid/Bars share -- a
  // streamgraph is one continuous flowing shape across the whole visible width, which can't be
  // decomposed into independently-rendered, virtualized columns the way a grid of cells or a set
  // of flat-bottomed bars can. So it renders as one plain horizontal ScrollView holding a single
  // SVG sized to the full loaded date range, rather than a FlatList -- it still shares the same
  // `days`/pagination state as Grid/Bars (so switching modes doesn't reset how much history is
  // loaded), just via its own onScroll-driven "am I near the end" check instead of onEndReached.
  const streamHeight = tasks.length * BAR_UNIT_HEIGHT; // same total scale as Bars mode
  const streamWidth = days.length * GRID_CELL_SIZE;
  // Shared Bars/Streamgraph Y-axis ticks -- one per whole task count (see getYAxisTicks).
  const yAxisMax = tasks.length;
  const yAxisTicks = getYAxisTicks(yAxisMax);
  // Skipped entirely outside streamgraph mode -- no reason to pay for this on every render while
  // the user's looking at Grid or Bars.
  const streamPaths = useMemo(() => {
    if (mainGridMode !== 'streamgraph' || tasks.length === 0 || days.length === 0) return [];
    const values = tasks.map(task =>
      days.map(day => {
        const dateString = format(day, 'yyyy-MM-dd');
        const completionCount = completionCountsByTask.get(task.id)?.get(dateString) ?? 0;
        return Math.min(completionCount / (task.timesPerDay || 1), 1) * BAR_UNIT_HEIGHT;
      })
    );
    const layers = computeStreamgraphLayers(values);
    return tasks.map((task, t) => {
      const toPoint = (layerPoint: (typeof layers)[number][number], d: number, edge: 'top' | 'bottom') => ({
        x: d * GRID_CELL_SIZE + GRID_CELL_SIZE / 2,
        y: layerPoint[edge] + streamHeight / 2, // shift the centered baseline into the SVG's own top-down coordinate space
      });
      const topPoints = layers[t].map((layerPoint, d) => toPoint(layerPoint, d, 'top'));
      const bottomPoints = layers[t].map((layerPoint, d) => toPoint(layerPoint, d, 'bottom'));
      return { task, path: buildStreamLayerPath(topPoints, bottomPoints) };
    });
  }, [mainGridMode, tasks, days, completionCountsByTask, streamHeight]);

  const handleStreamScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    if (days.length > 0) {
      const centerIndex = Math.min(
        days.length - 1,
        Math.max(0, Math.round((contentOffset.x + layoutMeasurement.width / 2) / GRID_CELL_SIZE))
      );
      const monthStart = startOfMonth(days[centerIndex]);
      setVisibleMonth(prev => (isSameMonth(prev, monthStart) ? prev : monthStart));
    }
    if (contentOffset.x + layoutMeasurement.width >= contentSize.width - GRID_CELL_SIZE * 5) {
      handleEndReached();
    }
  };

  // Placed after every hook above (React's rules-of-hooks require them to run unconditionally,
  // same as DashboardStreaksView/DashboardStatsView's identical early-return placement) -- styled
  // to match those two views' own "no habits selected" treatment exactly (see EmptyState.tsx),
  // rather than this screen's previous plain, unstyled fallback line.
  if (tasks.length === 0) {
    return <EmptyState icon="calendar-blank-outline" title="No habits selected" />;
  }

  return (
    <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: insets.bottom }}>
      <View style={styles.timelineHeaderRow}>
        {/* Reuses visibleMonth -- already tracked reactively via onViewableItemsChanged for
            the mini month grids below -- as a large, prominent label right above the grid
            itself, rather than trying to cram "MMMM yyyy" into a single 32px day column (the
            old per-column abbreviation this replaced could only ever fit "MMM yy" at 8px). */}
        <Text style={styles.timelineMonthLabel} numberOfLines={1}>{format(visibleMonth, 'MMMM yyyy')}</Text>
        <View ref={chartModesHint.ref} style={styles.mainGridModeToggle}>
          {([
            { mode: 'grid' as const, icon: 'view-grid-outline' as const, label: 'Grid view' },
            { mode: 'bars' as const, icon: 'chart-bar' as const, label: 'Bars view' },
            { mode: 'streamgraph' as const, icon: 'chart-areaspline-variant' as const, label: 'Streamgraph view' },
          ]).map(({ mode, icon, label }) => (
            <TouchableOpacity
              key={mode}
              style={[styles.mainGridModeButton, mainGridMode === mode && styles.mainGridModeButtonActive]}
              onPress={() => {
                chartModesHint.complete();
                setMainGridMode(mode);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: mainGridMode === mode }}
              accessibilityLabel={label}
            >
              <MaterialCommunityIcons name={icon} size={18} color={mainGridMode === mode ? '#fff' : colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {mainGridMode === 'streamgraph' ? (
        <View style={styles.streamWrapper}>
          <YAxisColumn ticks={yAxisTicks} max={yAxisMax} height={streamHeight} mirrored styles={styles} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            onScroll={handleStreamScroll}
            scrollEventThrottle={32}
            style={styles.gridScroll}
          >
            <View>
              <View style={{ flexDirection: 'row' }}>
                {days.map(day => {
                  // Same week/month boundary markers as Grid/Bars' own date axis -- see the
                  // renderItem below for the fuller reasoning (newest-first-left ordering, why
                  // the separator sits on the right edge, month winning over week on a tie).
                  const isWeekStart = day.getDay() === 0;
                  const isMonthStart = day.getDate() === 1;
                  const separator = (isMonthStart || isWeekStart) && (
                    <View
                      style={[styles.gridSeparator, isMonthStart ? styles.gridSeparatorMonth : styles.gridSeparatorWeek]}
                      pointerEvents="none"
                    />
                  );
                  return (
                    // gridColumn's fixed width (matching each day's GRID_CELL_SIZE slot in the
                    // SVG below) is essential here -- without it these cells would shrink-to-
                    // content instead, misaligning every label against its own day's x position.
                    <View key={format(day, 'yyyy-MM-dd')} style={[styles.gridColumn, styles.gridAxisCell]}>
                      {separator}
                      <Text style={styles.gridWeekdayLabel} numberOfLines={1}>{format(day, 'EEEEE')}</Text>
                      <Text style={styles.gridDateLabel}>{format(day, 'd')}</Text>
                    </View>
                  );
                })}
              </View>
              <View style={{ width: streamWidth, height: streamHeight }}>
                <Svg width={streamWidth} height={streamHeight}>
                  {streamPaths.map(({ task, path }) => (
                    <Path key={task.id} d={path} fill={task.color} fillOpacity={0.85} />
                  ))}
                  {/* Rendered after the paths (on top) so it stays visible crossing through
                      whichever layers happen to sit at that x position. */}
                  {selectedDayIndex >= 0 && (
                    <Line
                      x1={selectedDayIndex * GRID_CELL_SIZE + GRID_CELL_SIZE / 2}
                      y1={0}
                      x2={selectedDayIndex * GRID_CELL_SIZE + GRID_CELL_SIZE / 2}
                      y2={streamHeight}
                      stroke={colors.text}
                      strokeOpacity={0.5}
                      strokeWidth={2}
                    />
                  )}
                </Svg>
                {/* One invisible tap target per day, overlaid on the whole SVG -- the flowing
                    ribbons aren't discrete per-day elements the way Bars' segments are, so there's
                    nothing else here to attach a per-day onPress to directly. */}
                <View style={styles.streamTapOverlay}>
                  {days.map(day => {
                    const dateString = format(day, 'yyyy-MM-dd');
                    return (
                      <Pressable
                        key={dateString}
                        style={styles.streamTapCell}
                        onPress={() => handleColumnTap(dateString)}
                        accessibilityRole="button"
                        accessibilityLabel={`${format(day, 'EEEE, MMMM d')} details`}
                      />
                    );
                  })}
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      ) : (
        <View style={styles.gridWrapper}>
          {/* Bars mode dropped the task-icon column -- unlike Grid mode, a bar's stacked segments
              don't sit in a fixed per-task row (only tasks with a completion that day render a
              segment at all, in a shifting bottom-anchored stack), so this column never actually
              lined up 1:1 with anything. A minimal Y axis takes its place instead. */}
          {mainGridMode === 'bars' ? (
            <YAxisColumn ticks={yAxisTicks} max={yAxisMax} height={tasks.length * BAR_UNIT_HEIGHT} styles={styles} />
          ) : (
            <View style={styles.gridLabelColumn}>
              <View style={{ height: GRID_AXIS_HEIGHT }} />
              {tasks.map(task => (
                <View key={task.id} style={styles.gridLabelRow}>
                  <MaterialCommunityIcons name={task.icon} size={20} color={task.color} />
                </View>
              ))}
            </View>
          )}
          <FlatList
            data={days}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(day) => format(day, 'yyyy-MM-dd')}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            onViewableItemsChanged={handleViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            style={styles.gridScroll}
            renderItem={({ item: day }) => {
              // Sunday: the boundary between this week and the (older) week to its right in
              // this newest-first-left grid. The 1st of the month: same idea, one level up.
              const isWeekStart = day.getDay() === 0;
              const isMonthStart = day.getDate() === 1;
              // One axis, two stacked labels -- a weekday letter and the day-of-month number --
              // not a separate top *and* bottom copy.
              const dateAxis = (
                <View style={styles.gridAxisCell}>
                  <Text style={styles.gridWeekdayLabel} numberOfLines={1}>{format(day, 'EEEEE')}</Text>
                  <Text style={styles.gridDateLabel}>{format(day, 'd')}</Text>
                </View>
              );
              // Confined to the axis's own height, not stretching down through the task rows
              // below it (per explicit user direction). Month wins over week when a month also
              // happens to start on a Sunday -- one line, not two stacked.
              const separator = (isMonthStart || isWeekStart) && (
                <View
                  style={[styles.gridSeparator, isMonthStart ? styles.gridSeparatorMonth : styles.gridSeparatorWeek]}
                  pointerEvents="none"
                />
              );

              if (mainGridMode === 'bars') {
                // Only the segments that actually contributed that day -- filtered before mapping
                // (rather than skipping in place) so the "topmost segment" rounding below applies
                // to whichever segment actually renders first, not a fixed task index.
                const barDateString = format(day, 'yyyy-MM-dd');
                const barSegments = tasks
                  .map(task => {
                    const completionCount = completionCountsByTask.get(task.id)?.get(barDateString) ?? 0;
                    return { task, fraction: Math.min(completionCount / (task.timesPerDay || 1), 1) };
                  })
                  .filter(({ fraction }) => fraction > 0);
                return (
                  <Pressable
                    style={styles.gridColumn}
                    onPress={() => handleColumnTap(barDateString)}
                    accessibilityRole="button"
                    accessibilityLabel={`${format(day, 'EEEE, MMMM d')} details`}
                  >
                    {separator}
                    {dateAxis}
                    <View style={[styles.barColumnTrack, { height: tasks.length * BAR_UNIT_HEIGHT }]}>
                      <View style={styles.barStack}>
                        {barSegments.map(({ task, fraction }, index) => (
                          <View
                            key={task.id}
                            style={[
                              styles.barSegment,
                              index === 0 && styles.barSegmentTop,
                              {
                                height: fraction * BAR_UNIT_HEIGHT,
                                backgroundColor: task.color,
                              },
                            ]}
                          />
                        ))}
                      </View>
                      {/* Rendered last (on top of the segments) so it stays visible regardless
                          of what color/segment happens to sit underneath it. */}
                      {selectedDate === barDateString && (
                        <View style={styles.columnSelectionLine} pointerEvents="none" />
                      )}
                    </View>
                  </Pressable>
                );
              }

              return (
                <View style={styles.gridColumn}>
                  {separator}
                  {dateAxis}
                  {tasks.map(task => {
                    const dateString = format(day, 'yyyy-MM-dd');
                    const taskCompletionCounts = completionCountsByTask.get(task.id);
                    const completionCount = taskCompletionCounts?.get(dateString) ?? 0;
                    const isCompleted = completionCount >= (task.timesPerDay || 1);
                    const isPartial = completionCount > 0 && !isCompleted;
                    const isFuture = dateString > todayStr;
                    const isEmpty = !isFuture && !isCompleted && !isPartial;
                    const streakState = isEmpty
                      ? getDayStreakState(task, day, streakChainsByTask.get(task.id) ?? [], taskCompletionCounts ?? EMPTY_COMPLETION_COUNTS)
                      : null;
                    const isMissed = streakState === 'hardMiss';
                    const isSkipped = streakState === 'connected';
                    const isSoftMissed = streakState === 'softMiss';
                    const connection = dayConnectionInfoByTask.get(task.id)?.get(dateString);
                    // Today, not yet (fully) completed, with the streak's own status saying today
                    // is the make-or-break day -- matches the days isConnectedDay withholds a
                    // connector from (see reports.ts). This grid has no day numbers to badge like
                    // TaskCalendarScreen does, so it gets a gray clock icon replacing whatever
                    // would otherwise show in the dot instead (mutually exclusive with the
                    // partial-progress pie and the hard-miss X, same as those already are with
                    // each other).
                    const isExpiringToday = dateString === todayStr && !isCompleted && task.stats?.streakStatus === 'expiring';
                    return (
                      <View key={task.id} style={styles.gridCell}>
                        <View
                          style={[
                            styles.gridDot,
                            isCompleted && { backgroundColor: task.color },
                            (isMissed || isExpiringToday) && styles.gridDotEmpty,
                            // A pass-through day's dot now matches a plain soft-miss day's own
                            // grey/faded look exactly -- per explicit user direction ("a gray
                            // circle, same as skipped day with no streak") -- the colored thread
                            // below is what distinguishes "connected" from "genuinely nothing
                            // going on," not the dot itself anymore.
                            (isSoftMissed || isSkipped) && styles.gridDotSoftMiss,
                          ]}
                        >
                          {isExpiringToday ? (
                            // Sized close to gridDot's own diameter (GRID_CELL_SIZE - 8 = 24) --
                            // larger than MissedDayMark's `size={16}` elsewhere in this same dot,
                            // since an icon-font glyph carries real internal padding within its
                            // own box that a hand-drawn stroke mark doesn't, so matching the
                            // numeric size alone read visibly smaller/lighter than the X.
                            <View style={styles.missedMark}>
                              <MaterialCommunityIcons name="clock-outline" size={22} color={colors.textTertiary} />
                            </View>
                          ) : (
                            <>
                              {isPartial && (
                                <PartialDayPie fraction={completionCount / (task.timesPerDay || 1)} color={task.color} />
                              )}
                              {isMissed && (
                                <View style={styles.missedMark}>
                                  <MissedDayMark color={colors.textTertiary} size={16} />
                                </View>
                              )}
                            </>
                          )}
                        </View>
                        {/* A pass-through day's own thread -- a thin, full-cell-width, semi-
                            transparent line in the task's own color, rendered *on top of* the dot
                            (last in paint order, per explicit user direction) rather than behind
                            it. Only pass-through days get this -- completed days are unaffected,
                            and a plain soft-miss day (no streak at stake) has no thread since
                            there's no streak to thread. */}
                        {isSkipped && (
                          <View style={[styles.skipLine, { backgroundColor: task.color }]} pointerEvents="none" />
                        )}
                        {connection?.showStreakBadge && (
                          <StreakCountBadge
                            value={connection.badgeValue!}
                            iconSize={8}
                            style={styles.streakBadgePosition}
                          />
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            }}
          />
        </View>
      )}

      {/* Bars/Streamgraph only -- Grid mode has no tap interaction. Below the chart (per explicit
          user direction), not floating over the tapped column: both charts scroll horizontally,
          so the tapped column's on-screen x position would otherwise need to be re-tracked on
          every scroll frame; a docked summary card is simpler and never mispositions or clips. */}
      {selectedDate && (mainGridMode === 'bars' || mainGridMode === 'streamgraph') && (
        <Reanimated.View
          entering={dayTooltipEntering}
          style={styles.dayTooltip}
        >
          <View style={styles.dayTooltipHeader}>
            <Text style={styles.dayTooltipDate}>{format(parseISO(selectedDate), 'EEEE, MMM d')}</Text>
            <TouchableOpacity
              onPress={() => setSelectedDate(null)}
              style={styles.dayTooltipCloseButton}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close day details"
            >
              <MaterialCommunityIcons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.dayTooltipHeaderDivider} />
          {selectedDayEntries && selectedDayEntries.length > 0 ? (
            selectedDayEntries.map(entry => (
              <View key={entry.task.id} style={styles.dayTooltipRow}>
                <MaterialCommunityIcons name={entry.task.icon} size={16} color={entry.task.color} />
                <Text style={styles.dayTooltipTaskName} numberOfLines={1}>{entry.task.name}</Text>
                {/* Streak-ending days get their final count called out separately from the plain
                    completion dot below -- the same StreakCountBadge the calendars use elsewhere. */}
                {entry.badgeValue && <StreakCountBadge value={entry.badgeValue} iconSize={10} />}
                {/* Same solid-fill/partial-wedge treatment as Grid mode's own gridDot, instead of
                    text like "Completed"/"4/4" -- a fully solid circle in the task's own color
                    reads the same "done" signal the calendars already teach, and the wedge fills
                    proportionally for an under-quota multi-rep day. */}
                <View style={[styles.dayTooltipDot, entry.isCompleted && { backgroundColor: entry.task.color }]}>
                  {!entry.isCompleted && (
                    <PartialDayPie fraction={entry.completionCount / entry.requiredTimes} color={entry.task.color} />
                  )}
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.dayTooltipEmptyText}>No activity that day</Text>
          )}
        </Reanimated.View>
      )}

      {tasks.length > 0 && (
        // No section title here anymore -- the big month/year label above the Timeline grid
        // already shows this (see timelineMonthLabel), and having the exact same text repeated
        // immediately below it read as redundant.
        <View style={styles.taskMonthGrid} onLayout={handleTaskMonthGridLayout}>
            {taskMonthCardWidth > 0 && tasks.map(task => (
              <TouchableOpacity
                key={task.id}
                style={[styles.taskMonthCard, { width: taskMonthCardWidth }]}
                onPress={() => router.push({
                  pathname: '/task-detail',
                  params: { taskId: task.id, tab: 'calendar', month: format(visibleMonth, 'yyyy-MM-dd') },
                })}
                accessibilityRole="button"
                accessibilityLabel={`${task.name}, ${format(visibleMonth, 'MMMM yyyy')}`}
                accessibilityHint="Opens this habit's calendar"
              >
                <View style={styles.taskMonthCardHeader}>
                  <MaterialCommunityIcons name={task.icon} size={16} color={task.color} />
                  <Text style={styles.taskMonthCardTitle} numberOfLines={1}>{task.name}</Text>
                </View>
                {buildMonthRows(task).map((row, rowIndex) => (
                  <View key={rowIndex} style={styles.monthGridWeekRow}>
                    {row.map((day, dayIndex) => (
                      <View
                        key={dayIndex}
                        style={[
                          styles.monthGridDot,
                          {
                            width: monthDotSize,
                            height: monthDotSize,
                            borderRadius: monthDotRadius,
                            marginRight: dayIndex < 6 ? MONTH_DOT_GAP : 0,
                          },
                          day === null && styles.monthGridDotEmpty,
                          day?.isCompleted && { backgroundColor: task.color },
                          // Opacity scales with how much of the day's quota was actually hit --
                          // a >1x/day task's partial days no longer all read as one flat dimmed
                          // shade regardless of whether 1 of 3 or 2 of 3 reps were done.
                          day?.isPartial && { backgroundColor: task.color, opacity: Math.max(0.35, day.fraction) },
                          day?.isFuture && styles.monthGridDotFuture,
                        ]}
                      />
                    ))}
                  </View>
                ))}
              </TouchableOpacity>
            ))}
          </View>
      )}
    </ScrollView>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: {
    flex: 1,
    padding: 16,
  },
  timelineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  // Deliberately much larger than the old per-column month abbreviation it replaced (which
  // topped out at 8px to fit a single 32px day column) -- since this now lives once, above the
  // whole grid, it isn't constrained by any one column's width at all.
  timelineMonthLabel: {
    flexShrink: 1,
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  mainGridModeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 20,
    padding: 3,
    gap: 3,
  },
  mainGridModeButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 17,
  },
  mainGridModeButtonActive: {
    backgroundColor: '#007AFF',
  },
  gridWrapper: {
    flexDirection: 'row',
    marginBottom: 24,
    marginHorizontal: -16,
    paddingLeft: 16,
  },
  // Same marginBottom as gridWrapper -- per explicit user direction, Streamgraph's own gap before
  // the mini month grid cards below should match Grid/Bars', not read as tighter just because
  // this wrapper doesn't also need gridWrapper's edge-to-edge-scroll horizontal treatment.
  streamWrapper: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  gridScroll: {
    flex: 1,
  },
  gridLabelColumn: {
    width: GRID_LABEL_WIDTH,
  },
  gridLabelRow: {
    height: GRID_CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Same width as gridLabelColumn (not its own separate value) -- per explicit user direction, so
  // switching between Grid/Bars/Streamgraph never shifts the header/chart content horizontally
  // just because the left column happens to be narrower or wider in one mode.
  yAxisColumn: {
    width: GRID_LABEL_WIDTH,
  },
  yAxisTrack: {
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  yAxisLabel: {
    position: 'absolute',
    right: 6,
    fontSize: 10,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  gridColumn: {
    width: GRID_CELL_SIZE,
  },
  // Rendered at both the top and bottom of every column -- see the render-site comment. A plain
  // column flex with justifyContent: 'center' stacks the weekday letter above the day number as
  // one centered unit within the fixed GRID_AXIS_HEIGHT box.
  gridAxisCell: {
    height: GRID_AXIS_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridWeekdayLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textTertiary,
    textTransform: 'uppercase',
  },
  gridDateLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  // Spans the whole column's own rendered height (axis through the last task row) via a
  // plain-relative gridColumn parent -- rendered on the *left* edge of the day whose
  // Sunday/1st-of-month it belongs to, landing exactly on the shared boundary with the (older)
  // column to its right.
  // Positioned on the *right* edge, not the left -- index increases going right (older) in this
  // newest-first grid, so a Sunday's/1st's own left edge borders the more-recent day still
  // within the *same* week/month (Monday, or the 2nd), not the boundary. The right edge borders
  // the next index over -- the older Saturday, or the prior month's last day -- which is the
  // actual boundary this is meant to mark. Confined to the axis's own height (not stretching
  // down through the task rows below it) per explicit user direction.
  gridSeparator: {
    position: 'absolute',
    right: 0,
    top: 0,
    height: GRID_AXIS_HEIGHT,
  },
  // Dotted, not solid -- a border, not a filled background, since RN only supports dash/dot
  // patterns on borders -- reading as a faint rhythm marking each week rather than a hard line.
  gridSeparatorWeek: {
    width: 0,
    borderLeftWidth: 1.5,
    borderStyle: 'dotted',
    borderLeftColor: colors.textTertiary,
    opacity: 0.6,
  },
  // Solid and visibly heavier than the week separator -- a real dividing line, since a month
  // boundary is the more significant one of the two.
  gridSeparatorMonth: {
    width: 2,
    backgroundColor: colors.textSecondary,
    opacity: 0.9,
  },
  gridCell: {
    width: GRID_CELL_SIZE,
    height: GRID_CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridDot: {
    width: GRID_CELL_SIZE - 8,
    height: GRID_CELL_SIZE - 8,
    borderRadius: (GRID_CELL_SIZE - 8) / 2,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Shared by both empty-day states (hard miss and soft skip) -- the base grey circle gives way
  // to a transparent background so only the mark itself (X or dash) shows through.
  gridDotEmpty: {
    backgroundColor: 'transparent',
  },
  // A "soft miss" -- an empty day with no streak currently at stake -- keeps gridDot's own
  // default grey fill (unlike gridDotEmpty's transparent one, since there's no mark drawn inside
  // it to show through) just faded, reading as a plain empty day rather than a meaningful X/dash.
  gridDotSoftMiss: {
    opacity: 0.3,
  },
  missedMark: {
    // The X should read as muted, not alarming -- equally quiet as the thread below.
    opacity: 0.3,
  },
  // A pass-through day's own thread -- full gridCell width (not just gridDot's own smaller
  // diameter), thin, and semi-transparent, in the task's own color. `top: '50%'` + a negative
  // marginTop is safe here (unlike this file's own earlier centering bugs elsewhere) since
  // gridCell has an explicit fixed height (GRID_CELL_SIZE), not an aspectRatio-derived one --
  // percentage positioning only misbehaved against the latter.
  skipLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 2,
    marginTop: -1,
    opacity: 0.4,
  },
  streakBadgePosition: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  // Fixed height (tasks.length * BAR_UNIT_HEIGHT, set inline) so every day column shares the same
  // vertical scale regardless of that day's own total -- `justifyContent: 'flex-end'` anchors the
  // (auto-height) stack to the bottom of that shared space. marginHorizontal gives adjacent days'
  // bars visible separation instead of touching edge-to-edge. The bottom border is an x-axis line
  // the bars visually rest on -- per explicit user direction, not a divider placed below the whole
  // chart section with its own margin, but touching the bars' own bottom edge directly. Applied
  // per-column (every day's own track, at the exact same fixed height) rather than one element
  // spanning the whole scrollable width, since there's no single element that could span across
  // FlatList's independently-rendered/virtualized columns -- each column's own segment lines up
  // with its neighbors' since they all share the same height, reading as one continuous line
  // (with only the ~6px marginHorizontal gap between adjacent days as a minor, barely-visible
  // break, not worth solving with more complex cross-column geometry for this small a visual gap).
  barColumnTrack: {
    justifyContent: 'flex-end',
    marginHorizontal: 3,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  // Normal top-to-bottom column order -- the first task in `tasks` order renders as the topmost
  // segment (matching the label column's own top-to-bottom task order), with later tasks stacking
  // downward. The stack auto-sizes to the sum of only the segments actually present that day;
  // `barColumnTrack`'s `justifyContent: 'flex-end'` then anchors this whole (shorter) block flush
  // against the fixed-height track's bottom edge, so the *last* rendered segment ends up touching
  // bottom, not the first. Purely a structural wrapper -- no styles of its own needed now that
  // segments are full width rather than narrower-and-centered.
  barStack: {},
  // Full width of the track and no gap between segments -- per explicit user direction ("a
  // stacked bar chart"), adjacent tasks' segments touch directly to read as one continuous
  // multi-color bar rather than a stack of separate narrower pills.
  barSegment: {
    width: '100%',
  },
  // Applied only to whichever segment renders first (the topmost one) -- a soft cap at the very
  // top of the whole stack, the same way a typical stacked bar chart's bar has, while the rest of
  // the stack (including the bottom, which rests on the track's own baseline) stays square.
  barSegmentTop: {
    borderTopLeftRadius: BAR_SEGMENT_RADIUS,
    borderTopRightRadius: BAR_SEGMENT_RADIUS,
    overflow: 'hidden',
  },
  // A thin vertical crosshair through the tapped column's own bar, spanning barColumnTrack's full
  // height -- centered via percentage left + a negative margin half its own width (safe here,
  // unlike the earlier connector-track centering bugs elsewhere in this file, since this is a
  // plain absolute-positioned line with no aspectRatio-derived parent or corner-radius math
  // involved, just simple centering).
  columnSelectionLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    marginLeft: -1,
    width: 2,
    backgroundColor: colors.text,
    opacity: 0.5,
  },
  streamTapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  streamTapCell: {
    width: GRID_CELL_SIZE,
    height: '100%',
  },
  // A docked summary card (see the render-site comment for why not a floating tooltip) styled
  // like the app's other small surface cards -- a bordered `colors.surface` box with a subtle
  // shadow, not the semi-transparent OnboardingHint/ToastBanner treatment those deliberately use
  // to stay legible over arbitrary content, since this one always sits on the screen's own themed
  // background.
  dayTooltip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
    // Clips content while dayTooltipEntering/Exiting are animating height below its natural full
    // value -- without this, rows would visibly overflow the shrunken box mid-animation instead
    // of being cleanly hidden. Android's elevation-based shadow isn't affected by this the way an
    // iOS shadow prop can be; not a concern in practice for this app's primary target platform.
    overflow: 'hidden',
  },
  dayTooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Sized/weighted up from the original 14/700 to read as an actual title, not just another line
  // of body text -- matches the weight of e.g. DashboardScreen's own headerTitle.
  dayTooltipDate: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  // Separates the title row from the task list below -- dayTooltip's own `gap: 8` already spaces
  // it from its neighbors on both sides, so no extra margin needed here.
  dayTooltipHeaderDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  // Padded well beyond the icon's own bounds for a real touch target, not just the bare 20px
  // glyph -- `hitSlop` alone only extends the *invisible* tappable area, this also grows the
  // button's own visible footprint to look and feel bigger, not just register taps over a wider
  // area around a still-small icon.
  dayTooltipCloseButton: {
    padding: 6,
    margin: -6,
  },
  dayTooltipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayTooltipTaskName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  // Same shape/pattern as gridDot -- a grey circle that goes solid task.color when complete, or
  // stays grey with a PartialDayPie wedge inside for an under-quota multi-rep day.
  dayTooltipDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dayTooltipEmptyText: {
    fontSize: 13,
    color: colors.textTertiary,
  },
  taskMonthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TASK_MONTH_CARD_GAP,
    marginBottom: 24,
  },
  taskMonthCard: {
    // width set inline from the measured grid width / column count
  },
  taskMonthCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  taskMonthCardTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  monthGridWeekRow: {
    flexDirection: 'row',
    marginBottom: MONTH_DOT_GAP,
  },
  monthGridDot: {
    backgroundColor: colors.border,
    // Without this, Android renders borderRadius on a plain-backgroundColor View inconsistently
    // at these small sizes -- some corners crisp, others nearly square -- even though every dot
    // shares the exact same (already whole-pixel) width/height/radius. Not reproducible on web.
    overflow: 'hidden',
  },
  monthGridDotEmpty: {
    backgroundColor: 'transparent',
  },
  monthGridDotFuture: {
    opacity: 0.3,
  },
});
