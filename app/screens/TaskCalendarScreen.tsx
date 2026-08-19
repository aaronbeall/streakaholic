import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { addMonths, addYears, format, getDay, getDaysInMonth, startOfMonth, subMonths, subYears } from 'date-fns';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import { AccessibilityActionEvent, LayoutChangeEvent, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { MissedDayMark } from '../components/MissedDayMark';
import { PartialDayPie } from '../components/PartialDayPie';
import { StreakCountBadge } from '../components/StreakCountBadge';
import { useOnboardingHintTarget } from '../context/OnboardingHintsContext';
import { useToast } from '../context/ToastContext';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { useTaskStore } from '../stores/taskStore';
import { MaterialCommunityIconName, Task } from '../types';
import { getTrailingBlankCount } from '../utils/calendarGrid';
import { buildDayConnectionInfo, getCachedTaskStreakChains, getDayStreakState } from '../utils/reports';
import { getCachedCompletionCountsByDate, isScheduledOnDate } from '../utils/streaks';

type ViewMode = 'month' | 'year';

type YearDayCell = { isCompleted: boolean; isPartial: boolean; isFuture: boolean; fraction: number } | null;

// 3 months per row makes a clean 4x3 grid for a full year, each still readable as a tiny
// week-by-week calendar rather than a flat strip of dots.
const YEAR_GRID_COLUMNS = 3;
const YEAR_COLUMN_GAP = 14;
const YEAR_DOT_GAP = 2;

// A bit thicker than MissedDayMark's own 16px size (per explicit user direction, this screen's
// track specifically -- Dashboard's Timeline grid keeps its own separate constant unchanged) --
// still shorter than the completed-day dot itself, so a connected dot visibly pokes out
// above/below it rather than looking enveloped.
const CONNECTOR_LINE_THICKNESS = 22;

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
  const { completeTask, uncompleteTask, undoCompleteTask, restoreCompletion, skipDate, unskipDate } = useTaskStore(
    useShallow(state => ({
      completeTask: state.completeTask,
      uncompleteTask: state.uncompleteTask,
      undoCompleteTask: state.undoCompleteTask,
      restoreCompletion: state.restoreCompletion,
      skipDate: state.skipDate,
      unskipDate: state.unskipDate,
    }))
  );
  const { showToast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(initialMonth ?? new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [yearGridWidth, setYearGridWidth] = useState(0);
  // Long-press opens this day's details popover rather than acting directly -- see
  // handleDayLongPress/dayPopoverInfo below.
  const [dayPopoverDate, setDayPopoverDate] = useState<Date | null>(null);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Only in month view -- the year view's dots aren't tappable. The root coordinator handles
  // dismissed state and competition with every other registered hint.
  const tapDayHint = useOnboardingHintTarget('task-calendar-tap-day', viewMode === 'month');

  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDayOfMonth = startOfMonth(currentMonth);
  const startingDayOfWeek = getDay(firstDayOfMonth);
  const today = format(new Date(), 'yyyy-MM-dd');
  const requiredTimes = task.timesPerDay || 1;

  // Retrieved from the shared immutable-reference cache instead of a `.find()` scan
  // per cell -- the Month grid does up to ~31 lookups and the Year grid up to 365, all against
  // the same array, so this turns each into one O(completions) pass plus O(1) lookups per cell.
  const completionCounts = useMemo(() => getCachedCompletionCountsByDate(task.completions || []), [task.completions]);
  // Shared across every view that receives this immutable task version, not merely this render.
  const streakChains = useMemo(() => getCachedTaskStreakChains(task), [task]);

  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i + 1);
    const dateString = format(date, 'yyyy-MM-dd');
    const completionCount = completionCounts.get(dateString) ?? 0;
    const isCompleted = completionCount >= requiredTimes;
    const isPartial = completionCount > 0 && !isCompleted;
    const isToday = dateString === today;
    return {
      date,
      isCompleted,
      isPartial,
      completionCount,
      isToday,
      dayNumber: i + 1
    };
  }),
  [currentMonth, daysInMonth, completionCounts, requiredTimes, today]);

  // Run-boundary/badge info for the visible month, keyed by date string -- see reports.ts's
  // buildDayConnectionInfo. isRunStart/isRunEnd are checked against the true neighboring
  // calendar date (not just the edge of this month), so a streak that continues into the
  // previous/next month correctly doesn't get a rounded cap where it's merely clipped by view.
  const dayConnectionInfo = useMemo(
    () => buildDayConnectionInfo(task, days.map(d => d.date), streakChains, completionCounts),
    [task, days, streakChains, completionCounts]
  );

  // Always exactly 42 cells (6 weeks) -- chunked into week-rows for the Month view's plain-row
  // grid below (see the RN-traps note there for why it's not a FlatList).
  const calendarWeeks = useMemo(() => {
    const cells: CalendarItem[] = Array(42).fill(null).map((_, index) => {
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
        index,
      };
    });
    const rows: CalendarItem[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  }, [startingDayOfWeek, daysInMonth, days]);

  // A full year's worth of per-day states, grouped by month and chunked into weeks (like the
  // month view's own grid, just non-interactive and without day numbers) -- only computed when
  // actually viewing the year (365 lookups against `completionCounts` isn't free, so there's no
  // reason to pay for it while in month view).
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
          const completionCount = completionCounts.get(dateString) ?? 0;
          const isCompleted = completionCount >= requiredTimes;
          return {
            isCompleted,
            isPartial: completionCount > 0 && !isCompleted,
            isFuture: dateString > today,
            fraction: Math.min(completionCount / requiredTimes, 1),
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
  }, [viewMode, currentMonth, completionCounts, requiredTimes, today]);

  const monthCardWidth = yearGridWidth > 0
    ? (yearGridWidth - YEAR_COLUMN_GAP * (YEAR_GRID_COLUMNS - 1)) / YEAR_GRID_COLUMNS
    : 0;
  const yearDotSize = monthCardWidth > 0 ? (monthCardWidth - YEAR_DOT_GAP * 6) / 7 : 0;

  const handleYearGridLayout = (event: LayoutChangeEvent) => {
    setYearGridWidth(event.nativeEvent.layout.width);
  };

  const handleDayPress = (date: Date) => {
    const dateString = format(date, 'yyyy-MM-dd');
    const isCompleted = (completionCounts.get(dateString) ?? 0) >= requiredTimes;
    const isFuture = dateString > today;

    if (isFuture) {
      return; // Don't allow completing future dates
    }

    // Tapping a day is the gesture this hint teaches -- dismiss it the same way Home's hints
    // dismiss themselves when the user performs the taught gesture directly.
    tapDayHint.complete();

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
      const nextCount = (completionCounts.get(dateString) ?? 0) + 1;
      // A full completion earns the stronger "success" buzz; logging one of several reps for a
      // >1x/day task gets a lighter tap instead, matching the toast's own full-vs-partial message.
      if (nextCount >= timesPerDay) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      // Calendar completions get a generous achievement debounce -- see taskStore's own
      // scheduleDeferredAchievementCheck comment for why. Home/TaskHeader's own completeTask
      // calls omit this and stay fully immediate.
      completeTask(taskId, date, { deferAchievements: true });
      showToast({
        message: nextCount >= timesPerDay ? `${label} completed` : `${label}: ${nextCount}/${timesPerDay}`,
        action: { label: 'Undo', onPress: () => undoCompleteTask(taskId, date) },
      });
    }
  };

  // Long-press no longer acts directly (it used to instant-toggle skip) -- per explicit user
  // direction, a single gesture (tap) should stay the fast path for the common case
  // (complete/clear), while the rarer/less-obvious actions live behind a self-describing details
  // popover instead of a gesture you have to remember. Nothing to review for a day that hasn't
  // happened yet, matching handleDayPress' own future restriction.
  const handleDayLongPress = (date: Date) => {
    const dateString = format(date, 'yyyy-MM-dd');
    if (dateString > today) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDayPopoverDate(date);
  };

  // The popover's own skip action -- only for daily/specific_days_of_week (quota tasks don't
  // support this at all, see Task.skippedDates' own comment), never for a day that's already
  // completed (nothing to skip), and never to *create* a new skip on a day that isn't actually
  // scheduled in the first place (per explicit user direction -- redundant: a Weekday-only task
  // shouldn't offer to "skip" a Saturday). Removing an *existing* skip is still allowed
  // regardless, since that's just reverting a real, already-made choice. The popover only ever
  // renders this button when dayPopoverInfo.canSkip is true, but the guard is repeated here too,
  // matching the store's own skipDate defense-in-depth.
  const handleToggleSkip = (date: Date) => {
    if (task.frequency !== 'daily' && task.frequency !== 'specific_days_of_week') return;

    const dateString = format(date, 'yyyy-MM-dd');
    const isCompleted = (completionCounts.get(dateString) ?? 0) >= requiredTimes;
    if (isCompleted) return;

    const alreadySkipped = task.skippedDates?.includes(dateString) ?? false;
    if (!alreadySkipped && !isScheduledOnDate(task, date)) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDayPopoverDate(null);
    const label = format(date, 'MMM d');

    if (alreadySkipped) {
      unskipDate(taskId, date);
      showToast({ message: `${label} skip removed` });
    } else {
      skipDate(taskId, date);
      showToast({
        message: `${label} marked as skipped`,
        action: { label: 'Undo', onPress: () => unskipDate(taskId, date) },
      });
    }
  };

  // Recomputes the popover's own status line + which actions apply, independent of the day-cell
  // rendering loop below (which needs row/column neighbor info the popover doesn't) -- same
  // "recompute fresh, don't cache" reasoning as TaskHeader's own statusInfo, since "today" is
  // part of what a day's own state depends on.
  const dayPopoverInfo = useMemo(() => {
    if (!dayPopoverDate) return null;
    const date = dayPopoverDate;
    const dateString = format(date, 'yyyy-MM-dd');
    const completionCount = completionCounts.get(dateString) ?? 0;
    const isCompleted = completionCount >= requiredTimes;
    const isPartial = completionCount > 0 && !isCompleted;
    const isPast = dateString < today;
    const isEmpty = isPast && !isCompleted && !isPartial;
    const streakState = isEmpty ? getDayStreakState(task, date, streakChains, completionCounts) : null;
    const isMissed = streakState === 'hardMiss';
    const isPassThrough = streakState === 'connected';
    const isUserSkipped = (task.frequency === 'daily' || task.frequency === 'specific_days_of_week')
      && (task.skippedDates?.includes(dateString) ?? false);
    const canSkip = !isCompleted
      && (task.frequency === 'daily' || task.frequency === 'specific_days_of_week')
      && (isUserSkipped || isScheduledOnDate(task, date));

    let statusIcon: MaterialCommunityIconName;
    let statusColor: string;
    let statusText: string;
    if (isCompleted) {
      statusIcon = 'check-circle';
      statusColor = task.color;
      statusText = 'Completed';
    } else if (isPartial) {
      statusIcon = 'circle-half-full';
      statusColor = task.color;
      statusText = `${completionCount} of ${requiredTimes} completed`;
    } else if (isMissed) {
      statusIcon = 'close-circle';
      statusColor = colors.textSecondary;
      statusText = 'Missed';
    } else if (isUserSkipped) {
      statusIcon = 'calendar-remove';
      statusColor = colors.textSecondary;
      statusText = 'Skipped';
    } else if (isPassThrough) {
      statusIcon = 'calendar-blank-outline';
      statusColor = colors.textTertiary;
      statusText = 'Not due';
    } else {
      statusIcon = 'circle-outline';
      statusColor = colors.textSecondary;
      statusText = 'Nothing logged';
    }

    return { date, completionCount, isCompleted, isUserSkipped, canSkip, statusIcon, statusColor, statusText };
  }, [dayPopoverDate, completionCounts, requiredTimes, today, task, streakChains, colors]);

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
    <View style={styles.container}>
      <View style={[styles.content, { paddingBottom: insets.bottom }]}>
        <View style={styles.navigation}>
          <TouchableOpacity
            onPress={handlePrev}
            style={styles.navButton}
            accessibilityRole="button"
            accessibilityLabel={viewMode === 'year' ? 'Previous year' : 'Previous month'}
          >
            <MaterialCommunityIcons name="chevron-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleTitlePress} hitSlop={8} accessibilityRole="button" accessibilityHint="Jumps back to today">
            <Text style={styles.monthText}>
              {viewMode === 'year' ? format(currentMonth, 'yyyy') : format(currentMonth, 'MMMM yyyy')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleNext}
            style={styles.navButton}
            accessibilityRole="button"
            accessibilityLabel={viewMode === 'year' ? 'Next year' : 'Next month'}
          >
            <MaterialCommunityIcons name="chevron-right" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.viewModeToggle}>
          <TouchableOpacity
            style={[styles.viewModeButton, viewMode === 'month' && { backgroundColor: task.color }]}
            onPress={() => setViewMode('month')}
            accessibilityRole="radio"
            accessibilityState={{ checked: viewMode === 'month' }}
          >
            <Text style={[styles.viewModeButtonText, viewMode === 'month' && styles.viewModeButtonTextActive]}>Month</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewModeButton, viewMode === 'year' && { backgroundColor: task.color }]}
            onPress={() => setViewMode('year')}
            accessibilityRole="radio"
            accessibilityState={{ checked: viewMode === 'year' }}
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
                  accessibilityRole="button"
                  accessibilityLabel={`${month.label} ${currentMonth.getFullYear()}`}
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
            {/* Plain week-row chunks instead of a FlatList with numColumns -- this grid is always
                exactly 42 cells (6 weeks), fully bounded and never scrolled (scrollEnabled was
                already false), so the VirtualizedList machinery was pure overhead. Matches the
                same plain-row pattern used for the other bounded calendar grids elsewhere. */}
            {calendarWeeks.map((week, weekIndex) => (
              <View key={weekIndex} style={styles.weekRow}>
                {week.map((item, colIndex) => {
                  if (item.type === 'empty') {
                    return <View key={`empty-${item.index}`} style={styles.day} />;
                  }

                  const { date, isCompleted, isPartial, completionCount, isToday, dayNumber } = item;
                  const dateString = format(date, 'yyyy-MM-dd');
                  const isPast = dateString < today;
                  const isEmpty = isPast && !isCompleted && !isPartial;
                  const streakState = isEmpty ? getDayStreakState(task, date, streakChains, completionCounts) : null;
                  const isMissed = streakState === 'hardMiss';
                  // Schedule-driven slack (non-due, or quota slack) -- NOT the user-initiated skip
                  // feature below. A real skip mechanically becomes non-due (see isDueOnDate,
                  // streaks.ts) and so also reads as pass-through here, same as any other non-due
                  // day would -- isUserSkipped is what actually distinguishes "you chose to skip
                  // this" from "this was never due in the first place" for display purposes.
                  const isPassThrough = streakState === 'connected';
                  const isSoftMissed = streakState === 'softMiss';
                  const isFuture = dateString > today;
                  // The real, user-initiated skip (Task.skippedDates) -- only meaningful for
                  // daily/specific_days_of_week, matching isDueOnDate's own restriction.
                  const isUserSkipped = (task.frequency === 'daily' || task.frequency === 'specific_days_of_week')
                    && (task.skippedDates?.includes(dateString) ?? false);
                  const connection = dayConnectionInfo.get(dateString);
                  // A horizontal track can only ever visually bridge two cells sitting side by
                  // side in the *same* row -- a streak that data-wise continues past a week's
                  // Saturday into the next row's Sunday (or past the month's own first/last day)
                  // has nowhere to visually go from here, even though isRunStart/isRunEnd (see
                  // buildDayConnectionInfo) correctly say the streak itself doesn't end there.
                  // These flags fold that in: true wherever *either* the data says the run
                  // stops, *or* there's simply no rendered day cell to connect to on that side of
                  // the grid -- so the track always rounds off cleanly at a week/month wrap
                  // instead of showing a flat, dangling cut with nothing visually continuing it.
                  const hasLeftGridNeighbor = colIndex > 0 && week[colIndex - 1]?.type === 'day';
                  const hasRightGridNeighbor = colIndex < 6 && week[colIndex + 1]?.type === 'day';
                  const visualRunStart = !!connection && (connection.isRunStart || !hasLeftGridNeighbor);
                  const visualRunEnd = !!connection && (connection.isRunEnd || !hasRightGridNeighbor);
                  // A *completed* day with no visual neighbor on either side has nothing to poke
                  // a half-track stub toward -- render neither half rather than let one
                  // arbitrarily win via style-array merge order.
                  const isolatedBothSides = visualRunStart && visualRunEnd;
                  // Today, not yet (fully) completed, with the streak's own status saying today
                  // is the make-or-break day -- matches exactly the days isConnectedDay now
                  // withholds a connector from (see reports.ts). Drives a small expiring-colored
                  // badge alongside the day number (see the render site below) so this calendar's
                  // own visual cue lines up with the same "no free pass today" signal the
                  // missing connector already gives.
                  const isExpiringToday = isToday && !isCompleted && task.stats?.streakStatus === 'expiring';

                  const stateLabel = isCompleted
                    ? 'Completed'
                    : isExpiringToday
                    ? (isPartial ? `${completionCount} of ${task.timesPerDay || 1} completed, action needed today` : 'Action needed today')
                    : isPartial
                    ? `${completionCount} of ${task.timesPerDay || 1} completed`
                    : isMissed
                    ? 'Missed'
                    // Checked before the more general pass-through case -- a real skip is a
                    // specific reason a day reads as pass-through, worth naming distinctly rather
                    // than folding into the same generic label an ordinary non-due day gets.
                    : isUserSkipped
                    ? 'Skipped'
                    : isPassThrough
                    ? 'Not due'
                    : '';

                  // Long-press opens a details popover instead of acting directly -- available
                  // for any day that's already happened (nothing to review for the future,
                  // matching handleDayPress' own restriction on tap).
                  const canOpenDayDetails = !isFuture;

                  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
                    if (event.nativeEvent.actionName === 'longpress') {
                      handleDayLongPress(date);
                    }
                  };

                  return (
                    <TouchableOpacity
                      key={dateString}
                      style={styles.day}
                      onPress={() => handleDayPress(date)}
                      onLongPress={canOpenDayDetails ? () => handleDayLongPress(date) : undefined}
                      delayLongPress={500}
                      accessibilityRole="button"
                      accessibilityLabel={`${format(date, 'EEEE, MMMM d')}${stateLabel ? `, ${stateLabel}` : ''}`}
                      accessibilityHint={isFuture ? undefined : 'Double tap to toggle completion'}
                      accessibilityState={{ disabled: isFuture }}
                      accessibilityActions={canOpenDayDetails
                        ? [{ name: 'longpress', label: 'Day details' }]
                        : undefined}
                      onAccessibilityAction={canOpenDayDetails ? handleAccessibilityAction : undefined}
                    >
                      {connection?.isConnectedSelf && !(connection.isRunStart && connection.isRunEnd) && (
                        // Vertically centered via plain flex (not a percentage `top` + negative
                        // `marginTop`, which doesn't reliably center against a padded,
                        // aspectRatio-derived parent). Rounding only matters where there's no dot
                        // to hide the track's own terminus -- a *completed* boundary day's track
                        // just stops cleanly at the cell's center (flat cut, tucked behind the
                        // dot, no rounding needed since it's invisible either way); a *pass*
                        // (connected but not completed) boundary day has no dot to hide behind,
                        // so it keeps the full track length instead, rounded on the boundary side
                        // for a clean terminus -- using visualRunStart/visualRunEnd (data *or*
                        // grid-wrap boundary) rather than the raw connection flags, so a track
                        // rounds off at a week/month wrap too, not just a true streak boundary.
                        // A day connected on both sides gets the plain full-width track (no
                        // boundary at all); an isolated single-day "run" gets no track.
                        <View style={styles.connectorBandWrap} pointerEvents="none">
                          <View
                            style={[
                              styles.connectorBand,
                              { backgroundColor: task.color },
                              isCompleted && visualRunStart && !isolatedBothSides && styles.connectorHalfRight,
                              isCompleted && visualRunEnd && !isolatedBothSides && styles.connectorHalfLeft,
                              !isCompleted && visualRunStart && styles.connectorRoundLeft,
                              !isCompleted && visualRunEnd && styles.connectorRoundRight,
                            ]}
                          />
                        </View>
                      )}
                      <View
                        key={ `${task.id}-${isCompleted}-${isPartial}` }
                        ref={dayNumber === 1 ? tapDayHint.ref : undefined}
                        style={[
                          styles.dayContent,
                          isCompleted && { backgroundColor: task.color },
                          isToday && !isCompleted && { borderWidth: 2, borderColor: task.color }
                        ]}>
                        {isMissed ? (
                          <MissedDayMark color={colors.textTertiary} size={16} />
                        ) : isUserSkipped ? (
                          // A real skip still *behaves* exactly like an ordinary non-due day
                          // (streak math, isDueOnDate) -- but per explicit user direction it now
                          // gets its own visual instead of blending into the same faded treatment
                          // an ordinary non-due day gets: same faded color, plus a strikethrough,
                          // so "I explicitly chose to skip this" reads as a deliberate mark, not
                          // just an absence.
                          <Text style={[styles.dayNumber, styles.fadedDayNumber, styles.skippedDayNumber]}>{dayNumber}</Text>
                        ) : isPassThrough ? (
                          <Text style={[styles.dayNumber, styles.fadedDayNumber]}>{dayNumber}</Text>
                        ) : isSoftMissed ? (
                          // No streak currently at stake here -- just a faded day number, no
                          // mark or connecting line at all, deliberately less notable than either
                          // a hard miss or a pass-through day.
                          <Text style={[styles.dayNumber, styles.fadedDayNumber]}>{dayNumber}</Text>
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
                      {connection?.showStreakBadge && (
                        <StreakCountBadge
                          value={connection.badgeValue!}
                          iconSize={11}
                          style={styles.streakBadgePosition}
                        />
                      )}
                      {/* Mutually exclusive with the streak-count badge above -- that one only
                          ever lands on a completed day, this one only ever on an incomplete
                          today -- so they never compete for the same corner. Keeps the day
                          number visible (unlike the earlier version of this feature) and adds a
                          small expiring-colored badge instead, matching the same orange
                          getStreakBadgeStyle already uses for 'expiring' elsewhere in the app. */}
                      {isExpiringToday && (
                        <View style={[styles.expiringBadge, styles.streakBadgePosition]}>
                          <MaterialCommunityIcons name="clock-outline" size={10} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        {/* A persistent reminder of both gestures, not just the one-time onboarding hint --
            per direct user concern that long-press specifically is easy to forget once that
            hint is gone. Month view only, matching tapDayHint's own gating (Year view's dots
            aren't interactive at all). Each gesture is its own low-contrast pill so it reads as
            a quiet legend rather than a call to action; the gesture name is bold/higher-contrast
            and the resulting action is lighter, so the eye parses "which gesture -> what it
            does" instead of one flat run of text. */}
        {viewMode === 'month' && (
          <View style={styles.gestureLegend}>
            <View style={styles.gestureLegendChip}>
              <MaterialCommunityIcons name="gesture-tap" size={12} color={colors.textTertiary} />
              <Text style={styles.gestureLegendText}>
                <Text style={styles.gestureLegendName}>Tap</Text> complete/clear
              </Text>
            </View>
            <View style={styles.gestureLegendChip}>
              <MaterialCommunityIcons name="gesture-tap-hold" size={12} color={colors.textTertiary} />
              <Text style={styles.gestureLegendText}>
                <Text style={styles.gestureLegendName}>Hold</Text> day details
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Same Modal + manual-backdrop pattern as TaskHeader's own status popover -- a plain
          absolute overlay would only cover this View's own bounds, not the full screen. Opens on
          long-press instead of long-press acting directly, so every action here is a labeled
          button rather than something you have to remember a gesture for. */}
      <Modal
        transparent
        visible={dayPopoverInfo !== null}
        animationType="fade"
        onRequestClose={() => setDayPopoverDate(null)}
      >
        <Pressable
          style={styles.dayPopoverBackdrop}
          onPress={() => setDayPopoverDate(null)}
          accessibilityRole="none"
        >
          {dayPopoverInfo && (
            <Pressable style={styles.dayPopoverCard} onPress={() => {}}>
              <View style={styles.dayPopoverHeader}>
                <Text style={styles.dayPopoverTitle}>{format(dayPopoverInfo.date, 'EEEE, MMM d')}</Text>
                <TouchableOpacity
                  onPress={() => setDayPopoverDate(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  hitSlop={8}
                >
                  <MaterialCommunityIcons name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.dayPopoverStatusRow}>
                <View style={[styles.dayPopoverStatusIconWrap, { backgroundColor: `${dayPopoverInfo.statusColor}26` }]}>
                  <MaterialCommunityIcons name={dayPopoverInfo.statusIcon} size={16} color={dayPopoverInfo.statusColor} />
                </View>
                <Text style={styles.dayPopoverStatusText}>{dayPopoverInfo.statusText}</Text>
              </View>

              <View style={styles.dayPopoverActions}>
                <TouchableOpacity
                  style={styles.dayPopoverAction}
                  onPress={() => {
                    handleDayPress(dayPopoverInfo.date);
                    setDayPopoverDate(null);
                  }}
                  accessibilityRole="button"
                >
                  <View style={[styles.dayPopoverActionIconWrap, { backgroundColor: 'rgba(0,0,0,0.06)' }]}>
                    <MaterialCommunityIcons
                      name={dayPopoverInfo.isCompleted ? 'close-circle-outline' : 'check-circle-outline'}
                      size={16}
                      color={colors.textSecondary}
                    />
                  </View>
                  <Text style={styles.dayPopoverActionText}>
                    {dayPopoverInfo.isCompleted
                      ? 'Clear completion'
                      : dayPopoverInfo.completionCount > 0
                      ? `Log another (${dayPopoverInfo.completionCount}/${requiredTimes})`
                      : 'Mark complete'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />
                </TouchableOpacity>

                {dayPopoverInfo.canSkip && (
                  <TouchableOpacity
                    style={styles.dayPopoverAction}
                    onPress={() => handleToggleSkip(dayPopoverInfo.date)}
                    accessibilityRole="button"
                    accessibilityHint={dayPopoverInfo.isUserSkipped
                      ? 'Removes the skip, restoring it to a normal due day'
                      : "Marks this day as a one-off pass -- doesn't break your streak"}
                  >
                    <View style={[styles.dayPopoverActionIconWrap, { backgroundColor: 'rgba(0,0,0,0.06)' }]}>
                      <MaterialCommunityIcons
                        name={dayPopoverInfo.isUserSkipped ? 'calendar-remove' : 'calendar-remove-outline'}
                        size={16}
                        color={colors.textSecondary}
                      />
                    </View>
                    <Text style={styles.dayPopoverActionText}>
                      {dayPopoverInfo.isUserSkipped ? 'Remove skip' : 'Skip this day'}
                    </Text>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
            </Pressable>
          )}
        </Pressable>
      </Modal>
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
  gestureLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  gestureLegendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: colors.surfaceSecondary,
  },
  gestureLegendText: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  gestureLegendName: {
    fontWeight: '700',
    color: colors.textSecondary,
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
  weekRow: {
    flexDirection: 'row',
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
  fadedDayNumber: {
    opacity: 0.4,
  },
  // Layered on top of fadedDayNumber -- same faded color, plus a strikethrough, so a real
  // user-chosen skip reads as a deliberate mark rather than blending into an ordinary non-due
  // day's own identical fade.
  skippedDayNumber: {
    textDecorationLine: 'line-through',
  },
  // Full-sized, behind the whole outer `day` cell (not nested inside dayContent, a smaller
  // overflow:hidden circle) so its edges reach the cell's true left/right bounds and adjacent
  // connected cells' tracks touch seamlessly -- centers its one child (the actual track) via
  // plain flex rather than a percentage `top`, which measured off-center against this padded,
  // aspectRatio-derived parent.
  connectorBandWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  // Thick-but-not-full-height, semi-transparent connecting track.
  connectorBand: {
    height: CONNECTOR_LINE_THICKNESS,
    opacity: 0.4,
  },
  // A *completed* boundary day's track stops cleanly at the cell's center -- overrides
  // connectorBandWrap's default `alignItems: 'stretch'` (full width) to occupy only the named
  // half. No rounding: the flat cut is tucked behind the completed day's own dot, invisible
  // either way, so there's nothing to gain from rounding it.
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
    top: 2,
    right: 2,
  },
  // Same small-badge shape/shadow language as StreakCountBadge, just a plain icon (no numeric
  // value) colored with getStreakBadgeStyle's own 'expiring' orange (#FFA726) rather than the
  // task's own color, so it reads as a status indicator, not a streak-length label.
  expiringBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFA726',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
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
  dayPopoverBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dayPopoverCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  dayPopoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dayPopoverTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  dayPopoverStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dayPopoverStatusIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPopoverStatusText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    color: colors.text,
  },
  dayPopoverActions: {
    gap: 8,
  },
  // Same icon-circle + text + chevron row shape as TaskHeader's own status-popover actions
  // (Schedule/Status/Best/Skip rows there) -- a familiar, already-proven "this is tappable"
  // pattern, not a new visual language just for this screen.
  dayPopoverAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dayPopoverActionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPopoverActionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
});
