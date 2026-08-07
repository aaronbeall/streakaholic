import { MaterialCommunityIcons } from '@expo/vector-icons';
import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns';
import React, { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MissedDayMark } from '../components/MissedDayMark';
import { PartialDayPie } from '../components/PartialDayPie';
import { useTaskContext } from '../context/TaskContext';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { Task } from '../types';
import { isDueOnDate } from '../utils/streaks';

const GRID_LABEL_WIDTH = 36;
const GRID_CELL_SIZE = 32;
const GRID_MONTH_HEADER_HEIGHT = 16;
const GRID_DAY_HEADER_HEIGHT = 20;
const GRID_DATE_HEADER_HEIGHT = GRID_MONTH_HEADER_HEIGHT + GRID_DAY_HEADER_HEIGHT;
const DAYS_PAGE_SIZE = 30;

// The global equivalent of a single task's TaskCalendarScreen -- every selected task's calendar
// overlaid into one grid instead of one task's month view. Always "infinite" (paginates further
// into the past as you scroll right), with no timeframe toggle of its own -- that concept lives
// on the Stats tab's Activity section instead, which is the thing that actually needs a bounded
// window.
export const DashboardCalendarView: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
  const { isTaskCompleted, getCompletionCount } = useTaskContext();
  // The grid is its own thing, independent of any timeframe toggle -- always "infinite",
  // paginating further into the past as the user scrolls right. Starts with one page and grows
  // via onEndReached.
  const [loadedDays, setLoadedDays] = useState(DAYS_PAGE_SIZE);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const today = useMemo(() => new Date(), []);
  const todayStr = format(today, 'yyyy-MM-dd');

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
      <Text style={styles.sectionTitle}>Calendar Overview</Text>
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
    opacity: 0.5,
  },
});
