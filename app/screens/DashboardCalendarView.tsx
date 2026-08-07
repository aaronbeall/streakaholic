import { MaterialCommunityIcons } from '@expo/vector-icons';
import { differenceInCalendarDays, format, getDay, getDaysInMonth, isSameMonth, parseISO, startOfMonth, subDays } from 'date-fns';
import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { FlatList, LayoutChangeEvent, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View, ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MissedDayMark } from '../components/MissedDayMark';
import { PartialDayPie } from '../components/PartialDayPie';
import { useTaskContext } from '../context/TaskContext';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { Task } from '../types';
import { getTrailingBlankCount } from '../utils/calendarGrid';
import { isDueOnDate } from '../utils/streaks';

const GRID_LABEL_WIDTH = 36;
const GRID_CELL_SIZE = 32;
const GRID_MONTH_HEADER_HEIGHT = 16;
const GRID_DAY_HEADER_HEIGHT = 20;
const GRID_DATE_HEADER_HEIGHT = GRID_MONTH_HEADER_HEIGHT + GRID_DAY_HEADER_HEIGHT;
const DAYS_PAGE_SIZE = 30;

// Same per-day state shape as TaskCalendarView's Year-mode mini grid -- no due/not-due distinction,
// just completed/partial/future, matching that grid's already-established look.
type MonthDotCell = { isCompleted: boolean; isPartial: boolean; isFuture: boolean } | null;
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
  const { isTaskCompleted, getCompletionCount } = useTaskContext();
  const router = useRouter();
  // The grid is its own thing, independent of any timeframe toggle -- always "infinite",
  // paginating further into the past as the user scrolls right. Starts with one page and grows
  // via onEndReached.
  const [loadedDays, setLoadedDays] = useState(DAYS_PAGE_SIZE);
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
    return { daysInThisMonth, leadingBlanks, numWeeks: totalCells / 7 };
  }, [visibleMonth]);

  const buildMonthRows = (task: Task): MonthDotCell[][] => {
    const { daysInThisMonth, leadingBlanks } = monthShape;
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const cells: MonthDotCell[] = [
      ...Array(leadingBlanks).fill(null),
      ...Array.from({ length: daysInThisMonth }, (_, i): MonthDotCell => {
        const date = new Date(year, month, i + 1);
        const dateString = format(date, 'yyyy-MM-dd');
        const completionCount = getCompletionCount(task, date);
        const isCompleted = isTaskCompleted(task, date);
        return {
          isCompleted,
          isPartial: completionCount > 0 && !isCompleted,
          isFuture: dateString > todayStr,
        };
      }),
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

  return (
    <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: insets.bottom }}>
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
              return (
                <View style={styles.gridColumn}>
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
                  {tasks.map(task => {
                    const dateString = format(day, 'yyyy-MM-dd');
                    const completionCount = getCompletionCount(task, day);
                    const isCompleted = isTaskCompleted(task, day);
                    const isPartial = completionCount > 0 && !isCompleted;
                    const isFuture = dateString > todayStr;
                    const isDue = isDueOnDate(task, day);
                    const isMissed = !isFuture && !isCompleted && !isPartial && isDue;
                    return (
                      <View key={task.id} style={styles.gridCell}>
                        <View
                          style={[
                            styles.gridDot,
                            isCompleted && { backgroundColor: task.color },
                            !isDue && !isCompleted && !isPartial && styles.gridDotNotDue,
                            isMissed && styles.gridDotMissed,
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
                          day?.isPartial && { backgroundColor: task.color, opacity: 0.4 },
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
  gridDotNotDue: {
    opacity: 0.3,
  },
  gridDotMissed: {
    backgroundColor: 'transparent',
  },
  missedMark: {
    // Matches gridDotNotDue's opacity -- the X should read as equally muted as the dimmed
    // not-due circle, not more prominent than it.
    opacity: 0.3,
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
