import { MaterialCommunityIcons } from '@expo/vector-icons';
import { addMonths, addYears, format, getDay, getDaysInMonth, startOfMonth, subMonths, subYears } from 'date-fns';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useRef, useState } from 'react';
import { FlatList, LayoutChangeEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MissedDayMark } from '../components/MissedDayMark';
import { OnboardingHint } from '../components/OnboardingHint';
import { PartialDayPie } from '../components/PartialDayPie';
import { useSettings } from '../context/SettingsContext';
import { useTaskContext } from '../context/TaskContext';
import { useToast } from '../context/ToastContext';
import { useOnboardingTarget } from '../hooks/useOnboardingTarget';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { Task } from '../types';
import { getTrailingBlankCount } from '../utils/calendarGrid';

const TAP_DAY_HINT_TEXT = 'Tap a day to mark a day complete, tap again to clear it';

type ViewMode = 'month' | 'year';

type YearDayCell = { isCompleted: boolean; isPartial: boolean; isFuture: boolean; fraction: number } | null;

// 3 months per row makes a clean 4x3 grid for a full year, each still readable as a tiny
// week-by-week calendar rather than a flat strip of dots.
const YEAR_GRID_COLUMNS = 3;
const YEAR_COLUMN_GAP = 14;
const YEAR_DOT_GAP = 2;

// Add type definitions at the top of the file
type CalendarDay = {
  type: 'day';
  date: Date;
  isCompleted: boolean;
  isPartial: boolean;
  completionCount: number;
  isToday: boolean;
  dayNumber: number;
  index: number;
};

type EmptyDay = {
  type: 'empty';
  index: number;
};

type CalendarItem = CalendarDay | EmptyDay;

// The Calendar tab's content, rendered below the shared TaskHeader by TaskDetailScreen -- pulled
// out of a standalone routed screen so switching tabs is a local state change (see
// TaskDetailScreen) rather than a full navigation that re-transitions the header too.
export const TaskCalendarView: React.FC<{ task: Task; initialMonth?: Date }> = ({ task, initialMonth }) => {
  const taskId = task.id;
  const { completeTask, uncompleteTask, undoCompleteTask, restoreCompletion, isTaskCompleted, getCompletionCount } = useTaskContext();
  const { showToast } = useToast();
  const { onboardingHintsSeen, setOnboardingHintSeen } = useSettings();
  const [currentMonth, setCurrentMonth] = useState(initialMonth ?? new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [yearGridWidth, setYearGridWidth] = useState(0);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const containerRef = useRef<View>(null);
  const calendarGridRef = useRef<View>(null);

  // Only in month view -- the year view's dots aren't tappable.
  const showTapDayHint = !onboardingHintsSeen['task-calendar-tap-day'] && viewMode === 'month';
  const tapDayHintLayout = useOnboardingTarget(containerRef, calendarGridRef, showTapDayHint);
  const dismissTapDayHint = () => setOnboardingHintSeen('task-calendar-tap-day', true);

  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDayOfMonth = startOfMonth(currentMonth);
  const startingDayOfWeek = getDay(firstDayOfMonth);
  const today = format(new Date(), 'yyyy-MM-dd');

  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i + 1);
    const completionCount = getCompletionCount(task, date);
    const isCompleted = isTaskCompleted(task, date);
    const isPartial = completionCount > 0 && !isCompleted;
    const isToday = format(date, 'yyyy-MM-dd') === today;
    return {
      date,
      isCompleted,
      isPartial,
      completionCount,
      isToday,
      dayNumber: i + 1
    };
  }),
  [currentMonth, daysInMonth, task, isTaskCompleted, getCompletionCount, today]);

  // A full year's worth of per-day states, grouped by month and chunked into weeks (like the
  // month view's own grid, just non-interactive and without day numbers) -- only computed when
  // actually viewing the year (365 isTaskCompleted/getCompletionCount lookups isn't free, so
  // there's no reason to pay for it while in month view).
  const yearMonths = useMemo(() => {
    if (viewMode !== 'year') return [];
    const year = currentMonth.getFullYear();
    return Array.from({ length: 12 }, (_, monthIndex) => {
      const monthStart = new Date(year, monthIndex, 1);
      const daysInThisMonth = getDaysInMonth(monthStart);
      const leadingBlanks = getDay(monthStart);
      const trailingBlanks = getTrailingBlankCount(leadingBlanks, daysInThisMonth);

      const cells: YearDayCell[] = [
        ...Array(leadingBlanks).fill(null),
        ...Array.from({ length: daysInThisMonth }, (_, i): YearDayCell => {
          const date = new Date(year, monthIndex, i + 1);
          const dateString = format(date, 'yyyy-MM-dd');
          const completionCount = getCompletionCount(task, date);
          const isCompleted = isTaskCompleted(task, date);
          return {
            isCompleted,
            isPartial: completionCount > 0 && !isCompleted,
            isFuture: dateString > today,
            fraction: Math.min(completionCount / (task.timesPerDay || 1), 1),
          };
        }),
        ...Array(trailingBlanks).fill(null),
      ];

      const rows: YearDayCell[][] = [];
      for (let i = 0; i < cells.length; i += 7) {
        rows.push(cells.slice(i, i + 7));
      }

      return { monthIndex, label: format(monthStart, 'MMM'), rows };
    });
  }, [viewMode, currentMonth, task, isTaskCompleted, getCompletionCount, today]);

  const monthCardWidth = yearGridWidth > 0
    ? (yearGridWidth - YEAR_COLUMN_GAP * (YEAR_GRID_COLUMNS - 1)) / YEAR_GRID_COLUMNS
    : 0;
  const yearDotSize = monthCardWidth > 0 ? (monthCardWidth - YEAR_DOT_GAP * 6) / 7 : 0;

  const handleYearGridLayout = (event: LayoutChangeEvent) => {
    setYearGridWidth(event.nativeEvent.layout.width);
  };

  const handleDayPress = (date: Date) => {
    const dateString = format(date, 'yyyy-MM-dd');
    const isCompleted = isTaskCompleted(task, date);
    const isFuture = dateString > today;

    if (isFuture) {
      return; // Don't allow completing future dates
    }

    // Tapping a day is the gesture this hint teaches -- dismiss it the same way Home's hints
    // dismiss themselves when the user performs the taught gesture directly.
    dismissTapDayHint();

    const label = format(date, 'MMM d');

    if (isCompleted) {
      // uncompleteTask clears the whole day, which can wipe out a `timesCompleted` > 1 for a
      // multi-rep task -- snapshot the exact completion so Undo can restore it precisely.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const existingCompletion = task.completions?.find(c => c.date === dateString);
      uncompleteTask(taskId, date);
      showToast({
        message: `${label} cleared`,
        action: existingCompletion
          ? { label: 'Undo', onPress: () => restoreCompletion(taskId, existingCompletion) }
          : undefined,
      });
    } else {
      const timesPerDay = task.timesPerDay || 1;
      const nextCount = getCompletionCount(task, date) + 1;
      // A full completion earns the stronger "success" buzz; logging one of several reps for a
      // >1x/day task gets a lighter tap instead, matching the toast's own full-vs-partial message.
      if (nextCount >= timesPerDay) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      completeTask(taskId, date);
      showToast({
        message: nextCount >= timesPerDay ? `${label} completed` : `${label}: ${nextCount}/${timesPerDay}`,
        action: { label: 'Undo', onPress: () => undoCompleteTask(taskId, date) },
      });
    }
  };

  const handlePrev = () => {
    setCurrentMonth(viewMode === 'year' ? subYears(currentMonth, 1) : subMonths(currentMonth, 1));
  };

  const handleNext = () => {
    setCurrentMonth(viewMode === 'year' ? addYears(currentMonth, 1) : addMonths(currentMonth, 1));
  };

  const handleSelectMonth = (monthIndex: number) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), monthIndex, 1));
    setViewMode('month');
  };

  const handleTitlePress = () => {
    setCurrentMonth(new Date());
  };

  return (
    <View style={styles.container} ref={containerRef}>
      <View style={[styles.content, { paddingBottom: insets.bottom }]}>
        <View style={styles.navigation}>
          <TouchableOpacity onPress={handlePrev} style={styles.navButton}>
            <MaterialCommunityIcons name="chevron-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleTitlePress} hitSlop={8}>
            <Text style={styles.monthText}>
              {viewMode === 'year' ? format(currentMonth, 'yyyy') : format(currentMonth, 'MMMM yyyy')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleNext} style={styles.navButton}>
            <MaterialCommunityIcons name="chevron-right" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.viewModeToggle}>
          <TouchableOpacity
            style={[styles.viewModeButton, viewMode === 'month' && { backgroundColor: task.color }]}
            onPress={() => setViewMode('month')}
          >
            <Text style={[styles.viewModeButtonText, viewMode === 'month' && styles.viewModeButtonTextActive]}>Month</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewModeButton, viewMode === 'year' && { backgroundColor: task.color }]}
            onPress={() => setViewMode('year')}
          >
            <Text style={[styles.viewModeButtonText, viewMode === 'year' && styles.viewModeButtonTextActive]}>Year</Text>
          </TouchableOpacity>
        </View>

        {viewMode === 'year' ? (
          <ScrollView style={styles.yearScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.yearMonthsGrid} onLayout={handleYearGridLayout}>
              {yearGridWidth > 0 && yearMonths.map(month => (
                <TouchableOpacity
                  key={month.monthIndex}
                  style={[styles.yearMonthCard, { width: monthCardWidth }]}
                  onPress={() => handleSelectMonth(month.monthIndex)}
                >
                  <Text style={styles.yearMonthLabel}>{month.label}</Text>
                  {month.rows.map((row, rowIndex) => (
                    <View key={rowIndex} style={styles.yearWeekRow}>
                      {row.map((day, dayIndex) => (
                        <View
                          key={dayIndex}
                          style={[
                            styles.yearDot,
                            {
                              width: yearDotSize,
                              height: yearDotSize,
                              borderRadius: Math.max(1, yearDotSize * 0.25),
                              marginRight: dayIndex < 6 ? YEAR_DOT_GAP : 0,
                            },
                            day === null && styles.yearDotEmpty,
                            day?.isCompleted && { backgroundColor: task.color },
                            // Opacity scales with how much of the day's quota was hit, not a flat
                            // shade for any nonzero-but-incomplete count -- floored at 0.35 so a
                            // bare sliver of progress still reads clearly.
                            day?.isPartial && { backgroundColor: task.color, opacity: Math.max(0.35, day.fraction) },
                            day?.isFuture && styles.yearDotFuture,
                          ]}
                        />
                      ))}
                    </View>
                  ))}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        ) : (
          <View style={styles.calendar}>
            <View style={styles.weekDays}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <Text key={day} style={styles.weekDay}>{day}</Text>
              ))}
            </View>
            <FlatList<CalendarItem>
              data={Array(42).fill(null).map((_, index) => {
                const dayIndex = index - startingDayOfWeek;
                if (dayIndex < 0 || dayIndex >= daysInMonth) {
                  return { type: 'empty', index };
                }
                const day = days[dayIndex];
                return {
                  type: 'day',
                  date: day.date,
                  isCompleted: day.isCompleted || false,
                  isPartial: day.isPartial || false,
                  completionCount: day.completionCount || 0,
                  isToday: day.isToday,
                  dayNumber: day.dayNumber,
                  index
                };
              })}
              renderItem={({ item }) => {
                if (item.type === 'empty') {
                  return <View key={`empty-${item.index}`} style={styles.day} />;
                }

                const { date, isCompleted, isPartial, completionCount, isToday, dayNumber } = item;
                const dateString = format(date, 'yyyy-MM-dd');
                const isPast = dateString < today;
                const isMissed = isPast && !isCompleted && !isPartial;
                const isFuture = dateString > today;

                return (
                  <TouchableOpacity
                    key={dateString}
                    style={styles.day}
                    onPress={() => handleDayPress(date)}
                    delayLongPress={500}
                  >
                    <View
                      key={ `${task.id}-${isCompleted}-${isPartial}` }
                      ref={dayNumber === 1 ? calendarGridRef : undefined}
                      style={[
                        styles.dayContent,
                        isCompleted && { backgroundColor: task.color },
                        isToday && !isCompleted && { borderWidth: 2, borderColor: task.color }
                      ]}>
                      {isMissed ? (
                        <MissedDayMark color={colors.textTertiary} size={16} />
                      ) : isPartial ? (
                        <>
                          <View style={StyleSheet.absoluteFill}>
                            <PartialDayPie fraction={completionCount / (task.timesPerDay || 1)} color={task.color} />
                          </View>
                          <Text style={[styles.dayNumber, { color: task.color }]}>{dayNumber}</Text>
                        </>
                      ) : (
                        <Text style={[
                          styles.dayNumber,
                          isCompleted && styles.completedDayNumber,
                          isToday && !isCompleted && { color: task.color },
                          isFuture && styles.futureDay
                        ]}>
                          {dayNumber}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
              numColumns={7}
              scrollEnabled={false}
              keyExtractor={(item) => item.type === 'empty' ? `empty-${item.index}` : format(item.date, 'yyyy-MM-dd')}
            />
          </View>
        )}
      </View>

      {showTapDayHint && tapDayHintLayout && (
        <OnboardingHint
          text={TAP_DAY_HINT_TEXT}
          targetLayout={tapDayHintLayout}
          onDismiss={dismissTapDayHint}
        />
      )}
    </View>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  navButton: {
    padding: 8,
  },
  monthText: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text,
  },
  viewModeToggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 20,
    padding: 3,
    marginTop: 12,
    gap: 3,
  },
  viewModeButton: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 17,
  },
  viewModeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  viewModeButtonTextActive: {
    color: '#fff',
  },
  calendar: {
    flex: 1,
    padding: 16,
  },
  weekDays: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  day: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  dayContent: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: '50%',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  completedDayNumber: {
    color: '#fff',
  },
  futureDay: {
    opacity: 0.4,
  },
  yearScroll: {
    flex: 1,
    marginTop: 16,
  },
  yearMonthsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: YEAR_COLUMN_GAP,
    paddingBottom: 8,
  },
  yearMonthCard: {
    // width set inline from the measured grid width
  },
  yearMonthLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  yearWeekRow: {
    flexDirection: 'row',
    marginBottom: YEAR_DOT_GAP,
  },
  yearDot: {
    backgroundColor: colors.border,
  },
  yearDotEmpty: {
    backgroundColor: 'transparent',
  },
  yearDotFuture: {
    opacity: 0.3,
  },
});
