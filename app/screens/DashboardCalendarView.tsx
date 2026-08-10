import { MaterialCommunityIcons } from '@expo/vector-icons';
import { differenceInCalendarDays, format, getDay, getDaysInMonth, isSameMonth, parseISO, startOfMonth, subDays } from 'date-fns';
import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { FlatList, LayoutChangeEvent, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View, ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MissedDayMark } from '../components/MissedDayMark';
import { PartialDayPie } from '../components/PartialDayPie';
import { SkippedDayMark } from '../components/SkippedDayMark';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { Task } from '../types';
import { getTrailingBlankCount } from '../utils/calendarGrid';
import { getDayStreakState, getTaskStreakChains } from '../utils/reports';
import { buildCompletionCountsByDate } from '../utils/streaks';

const GRID_LABEL_WIDTH = 36;
const GRID_CELL_SIZE = 32;
const GRID_MONTH_HEADER_HEIGHT = 16;
const GRID_DAY_HEADER_HEIGHT = 20;
const GRID_DATE_HEADER_HEIGHT = GRID_MONTH_HEADER_HEIGHT + GRID_DAY_HEADER_HEIGHT;
const DAYS_PAGE_SIZE = 30;

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
          <Text style={styles.timelineTitle}>Timeline</Text>
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
            <View style={{ height: GRID_DATE_HEADER_HEIGHT }} />
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
              const isMonthStart = day.getDate() === 1;
              const dateHeader = (
                <View style={styles.gridDateHeaderCell}>
                  <View style={styles.gridMonthHeaderRow}>
                    {isMonthStart && (
                      <Text style={styles.gridMonthLabel} numberOfLines={1}>{format(day, 'MMM yy')}</Text>
                    )}
                  </View>
                  <View style={styles.gridDayHeaderRow}>
                    <Text style={styles.gridDateLabel}>{format(day, 'd')}</Text>
                  </View>
                </View>
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
                    {dateHeader}
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
                  {dateHeader}
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
                    return (
                      <View key={task.id} style={styles.gridCell}>
                        <View
                          style={[
                            styles.gridDot,
                            isCompleted && { backgroundColor: task.color },
                            (isMissed || isSkipped) && styles.gridDotEmpty,
                            isSoftMissed && styles.gridDotSoftMiss,
                          ]}
                        >
                          {isPartial && (
                            <PartialDayPie fraction={completionCount / (task.timesPerDay || 1)} color={task.color} />
                          )}
                          {isMissed && (
                            <View style={styles.missedMark}>
                              <MissedDayMark color={colors.textTertiary} size={16} />
                            </View>
                          )}
                        </View>
                        {isSkipped && (
                          <View style={styles.skippedLineOverlay}>
                            <SkippedDayMark color={task.color} />
                          </View>
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
        <>
          <Text style={styles.sectionTitle}>{format(visibleMonth, 'MMMM yyyy')}</Text>
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
        </>
      )}
    </ScrollView>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
    marginTop: 8,
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
  timelineTitle: {
    fontSize: 16,
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
  gridDateHeaderCell: {
    height: GRID_DATE_HEADER_HEIGHT,
  },
  gridMonthHeaderRow: {
    height: GRID_MONTH_HEADER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridDayHeaderRow: {
    height: GRID_DAY_HEADER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridDateLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  gridMonthLabel: {
    // "MMM yy" (2-digit year) so the label reliably fits the 32px day column at a legible size --
    // "MMM yyyy" doesn't and gets ellipsis-truncated by the FlatList item's clipping.
    fontSize: 8,
    fontWeight: '600',
    color: colors.textTertiary,
    textTransform: 'uppercase',
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
  // Full-bleed over the whole gridCell (not just gridDot's smaller, overflow:hidden circle) so a
  // run of consecutive skipped days' lines actually touch edge-to-edge across cells instead of
  // each being clipped down to the width of its own dot.
  skippedLineOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    // Matches missedMark's opacity -- a soft skip shouldn't visually outrank a hard miss just
    // because it's drawn in the task's own (potentially brighter) color.
    opacity: 0.3,
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
