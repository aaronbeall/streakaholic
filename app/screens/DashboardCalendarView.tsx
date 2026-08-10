import { MaterialCommunityIcons } from '@expo/vector-icons';
import { differenceInCalendarDays, format, getDay, getDaysInMonth, isSameMonth, parseISO, startOfMonth, subDays } from 'date-fns';
import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { FlatList, LayoutChangeEvent, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View, ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MissedDayMark } from '../components/MissedDayMark';
import { PartialDayPie } from '../components/PartialDayPie';
import { StreakCountBadge } from '../components/StreakCountBadge';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { Task } from '../types';
import { getTrailingBlankCount } from '../utils/calendarGrid';
import { buildDayConnectionInfo, getDayStreakState, getTaskStreakChains } from '../utils/reports';
import { buildCompletionCountsByDate } from '../utils/streaks';

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
// Matches the `size` MissedDayMark is rendered at below (16) -- thick enough to read as a real
// track (not a hairline) without being as tall as the completed-day dot itself, so a connected
// dot still visibly pokes out above/below it rather than looking enveloped.
const CONNECTOR_LINE_THICKNESS = 16;

// Bars mode's per-task segment unit height -- same as a single Grid-mode dot row, so a day where
// every task is fully done reaches exactly the same total height Grid mode's task rows already
// occupy (tasks.length * GRID_CELL_SIZE), keeping the two modes' vertical scale consistent.
const BAR_UNIT_HEIGHT = GRID_CELL_SIZE;
const BAR_SEGMENT_GAP = 2;
const BAR_SEGMENT_RADIUS = 7;
// Narrower than the full track width, centered, so adjacent days' bars read as visually distinct
// columns rather than one nearly-touching band.
const BAR_SEGMENT_WIDTH = '75%';
type MainGridMode = 'grid' | 'bars';

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
  const { width: windowWidth } = useWindowDimensions();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const today = useMemo(() => new Date(), []);
  const todayStr = format(today, 'yyyy-MM-dd');

  // Built once per task (keyed on `tasks`, which itself only changes reference when a task is
  // actually added/edited/completed/etc. -- see the taskStore migration notes) instead of a
  // `.find()` scan per (task, day) cell. Both the Timeline grid (up to ~30 visible day columns x
  // every selected task) and the per-task mini month grids below do many lookups against the same
  // task's completions, so this turns each into one O(completions) pass per task up front plus
  // O(1) lookups per cell after that -- and derives isCompleted from the same looked-up count
  // instead of a separate isTaskCompleted call repeating the same lookup.
  const completionCountsByTask = useMemo(
    () => new Map(tasks.map(task => [task.id, buildCompletionCountsByDate(task.completions || [])])),
    [tasks]
  );

  // Same reasoning as completionCountsByTask above -- getTaskStreakChains walks a task's full
  // history, so this is computed once per task rather than once per empty cell in the grid below.
  const streakChainsByTask = useMemo(
    () => new Map(tasks.map(task => [task.id, getTaskStreakChains(task)])),
    [tasks]
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
      buildDayConnectionInfo(task, days, streakChainsByTask.get(task.id) ?? [], completionCountsByTask.get(task.id) ?? new Map()),
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

  // A segment's own rendered height can't just be `fraction * BAR_UNIT_HEIGHT` -- the
  // `BAR_SEGMENT_GAP` margins between segments add extra height on top of that, so a day with
  // every task fully completed (worst case: tasks.length - 1 gaps, the most any day can need)
  // would overshoot `barColumnTrack`'s fixed `tasks.length * BAR_UNIT_HEIGHT`. Shrinking each
  // unit by that worst-case gap total, spread evenly across every task, means the full-completion
  // case now lands exactly on the track's height instead of past it.
  const barSegmentUnitHeight = tasks.length > 0
    ? BAR_UNIT_HEIGHT - ((tasks.length - 1) * BAR_SEGMENT_GAP) / tasks.length
    : BAR_UNIT_HEIGHT;

  return (
    <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: insets.bottom }}>
      {tasks.length > 0 && (
        <View style={styles.timelineHeaderRow}>
          {/* Reuses visibleMonth -- already tracked reactively via onViewableItemsChanged for
              the mini month grids below -- as a large, prominent label right above the grid
              itself, rather than trying to cram "MMMM yyyy" into a single 32px day column (the
              old per-column abbreviation this replaced could only ever fit "MMM yy" at 8px). */}
          <Text style={styles.timelineMonthLabel} numberOfLines={1}>{format(visibleMonth, 'MMMM yyyy')}</Text>
          <View style={styles.mainGridModeToggle}>
            <TouchableOpacity
              style={[styles.mainGridModeButton, mainGridMode === 'grid' && styles.mainGridModeButtonActive]}
              onPress={() => setMainGridMode('grid')}
              accessibilityRole="radio"
              accessibilityState={{ checked: mainGridMode === 'grid' }}
            >
              <Text style={[styles.mainGridModeButtonText, mainGridMode === 'grid' && styles.mainGridModeButtonTextActive]}>Grid</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mainGridModeButton, mainGridMode === 'bars' && styles.mainGridModeButtonActive]}
              onPress={() => setMainGridMode('bars')}
              accessibilityRole="radio"
              accessibilityState={{ checked: mainGridMode === 'bars' }}
            >
              <Text style={[styles.mainGridModeButtonText, mainGridMode === 'bars' && styles.mainGridModeButtonTextActive]}>Bars</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {tasks.length === 0 ? (
        <Text style={styles.emptyText}>No tasks selected.</Text>
      ) : (
        <View style={styles.gridWrapper}>
          <View style={styles.gridLabelColumn}>
            <View style={{ height: GRID_AXIS_HEIGHT }} />
            {tasks.map(task => (
              <View key={task.id} style={styles.gridLabelRow}>
                <MaterialCommunityIcons name={task.icon} size={20} color={task.color} />
              </View>
            ))}
          </View>
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
                // (rather than skipping in place) so the gap between segments can be based on
                // position among *visible* segments, not raw task index. Otherwise a skipped
                // segment at the very top would still leave a phantom gap between it and the
                // first segment that does render.
                const barDateString = format(day, 'yyyy-MM-dd');
                const barSegments = tasks
                  .map(task => {
                    const completionCount = completionCountsByTask.get(task.id)?.get(barDateString) ?? 0;
                    return { task, fraction: Math.min(completionCount / (task.timesPerDay || 1), 1) };
                  })
                  .filter(({ fraction }) => fraction > 0);
                return (
                  <View style={styles.gridColumn}>
                    {separator}
                    {dateAxis}
                    <View style={[styles.barColumnTrack, { height: tasks.length * BAR_UNIT_HEIGHT }]}>
                      <View style={styles.barStack}>
                        {barSegments.map(({ task, fraction }, index) => (
                          <View
                            key={task.id}
                            style={[
                              styles.barSegment,
                              {
                                height: fraction * barSegmentUnitHeight,
                                backgroundColor: task.color,
                                marginTop: index > 0 ? BAR_SEGMENT_GAP : 0,
                              },
                            ]}
                          />
                        ))}
                      </View>
                    </View>
                  </View>
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
                      ? getDayStreakState(task, day, streakChainsByTask.get(task.id) ?? [], taskCompletionCounts ?? new Map())
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
                        {connection?.isConnectedSelf && !(connection.isRunStart && connection.isRunEnd) && (
                          // This grid renders newest-first left-to-right (today at index 0), the
                          // reverse of normal calendar order -- so the run's chronological start
                          // (isRunStart) is the *older* edge, rendered on the right, and its end
                          // (isRunEnd, the more recent edge) is rendered on the left. Centered via
                          // plain flex on the wrapper (not a percentage `top`, which didn't
                          // reliably center against gridCell). Rounding only matters where there's
                          // no dot to hide the track's own terminus -- a *completed* boundary
                          // day's track just stops cleanly at the cell's center (flat cut, tucked
                          // behind the dot); a *pass* (connected but not completed) boundary day
                          // has no dot to hide behind, so it keeps the full track length instead,
                          // rounded on the boundary side. An isolated single-day "run" gets no
                          // track at all.
                          <View style={styles.connectorBandWrap} pointerEvents="none">
                            <View
                              style={[
                                styles.connectorBand,
                                { backgroundColor: task.color },
                                isCompleted && connection.isRunEnd && styles.connectorHalfRight,
                                isCompleted && connection.isRunStart && styles.connectorHalfLeft,
                                !isCompleted && connection.isRunEnd && styles.connectorRoundLeft,
                                !isCompleted && connection.isRunStart && styles.connectorRoundRight,
                              ]}
                            />
                          </View>
                        )}
                        <View
                          style={[
                            styles.gridDot,
                            isCompleted && { backgroundColor: task.color },
                            (isMissed || isSkipped || isExpiringToday) && styles.gridDotEmpty,
                            isSoftMissed && styles.gridDotSoftMiss,
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
                accessibilityHint="Opens this task's calendar"
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
  emptyText: {
    fontSize: 13,
    color: colors.textTertiary,
    marginBottom: 20,
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
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 17,
  },
  mainGridModeButtonActive: {
    backgroundColor: '#007AFF',
  },
  mainGridModeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  mainGridModeButtonTextActive: {
    color: '#fff',
  },
  gridWrapper: {
    flexDirection: 'row',
    marginBottom: 24,
    marginHorizontal: -16,
    paddingLeft: 16,
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
    // The X should read as muted, not alarming -- equally quiet as the dash below.
    opacity: 0.3,
  },
  // A thick-but-not-full-height, semi-transparent connecting track -- vertically centered behind
  // the whole gridCell (not just gridDot's smaller, overflow:hidden circle) so a run of
  // consecutive connected days' tracks actually touch edge-to-edge across cells and read as one
  // continuous thread -- centers its one child (the actual track) via plain flex rather than a
  // percentage `top`, which didn't reliably center against gridCell.
  connectorBandWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  connectorBand: {
    height: CONNECTOR_LINE_THICKNESS,
    opacity: 0.4,
  },
  // A *completed* boundary day's track stops cleanly at the cell's center -- overrides
  // connectorBandWrap's default `alignItems: 'stretch'` (full width) to occupy only the named
  // half (see the render-site comment for why left/right map to end/start here). No rounding:
  // the flat cut is tucked behind the completed day's own dot, invisible either way.
  connectorHalfLeft: {
    width: '50%',
    alignSelf: 'flex-start',
  },
  connectorHalfRight: {
    width: '50%',
    alignSelf: 'flex-end',
  },
  // A *pass* (connected but not completed) boundary day's track keeps its full length -- there's
  // no dot to hide a cut behind, so it's rounded on the boundary side instead for a clean
  // terminus right at the cell's true edge.
  connectorRoundLeft: {
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
  },
  connectorRoundRight: {
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  streakBadgePosition: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  // Fixed height (tasks.length * BAR_UNIT_HEIGHT, set inline) so every day column shares the same
  // vertical scale regardless of that day's own total -- `justifyContent: 'flex-end'` anchors the
  // (auto-height) stack to the bottom of that shared space. marginHorizontal gives adjacent days'
  // bars visible separation instead of touching edge-to-edge.
  barColumnTrack: {
    justifyContent: 'flex-end',
    marginHorizontal: 3,
  },
  // Normal top-to-bottom column order -- the first task in `tasks` order renders as the topmost
  // segment (matching the label column's own top-to-bottom task order), with later tasks stacking
  // downward. The stack auto-sizes to the sum of only the segments actually present that day;
  // `barColumnTrack`'s `justifyContent: 'flex-end'` then anchors this whole (shorter) block flush
  // against the fixed-height track's bottom edge, so the *last* rendered segment ends up touching
  // bottom, not the first.
  barStack: {
    // Centers the (narrower-than-track) segments horizontally -- every segment shares the same
    // BAR_SEGMENT_WIDTH, so centering the stack keeps them all aligned on the same vertical axis.
    alignItems: 'center',
  },
  barSegment: {
    width: BAR_SEGMENT_WIDTH,
    borderRadius: BAR_SEGMENT_RADIUS,
    overflow: 'hidden',
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
