import { MaterialCommunityIcons } from '@expo/vector-icons';
import { addMonths, addYears, format, getDay, getDaysInMonth, startOfMonth, subMonths, subYears } from 'date-fns';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { MissedDayMark } from '../components/MissedDayMark';
import { OnboardingHint } from '../components/OnboardingHint';
import { PartialDayPie } from '../components/PartialDayPie';
import { StreakCountBadge } from '../components/StreakCountBadge';
import { useToast } from '../context/ToastContext';
import { useOnboardingTarget } from '../hooks/useOnboardingTarget';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { useSettingsStore } from '../stores/settingsStore';
import { useTaskStore } from '../stores/taskStore';
import { Task } from '../types';
import { getTrailingBlankCount } from '../utils/calendarGrid';
import { buildDayConnectionInfo, getDayStreakState, getTaskStreakChains } from '../utils/reports';
import { buildCompletionCountsByDate } from '../utils/streaks';

const TAP_DAY_HINT_TEXT = 'Tap a day to mark a day complete, tap again to clear it';

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
  const { completeTask, uncompleteTask, undoCompleteTask, restoreCompletion } = useTaskStore(
    useShallow(state => ({
      completeTask: state.completeTask,
      uncompleteTask: state.uncompleteTask,
      undoCompleteTask: state.undoCompleteTask,
      restoreCompletion: state.restoreCompletion,
    }))
  );
  const { showToast } = useToast();
  const { onboardingHintsSeen, setOnboardingHintSeen } = useSettingsStore(
    useShallow(state => ({
      onboardingHintsSeen: state.onboardingHintsSeen,
      setOnboardingHintSeen: state.setOnboardingHintSeen,
    }))
  );
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
  const requiredTimes = task.timesPerDay || 1;

  // Built once per task (keyed on its own `completions` reference) instead of a `.find()` scan
  // per cell -- the Month grid does up to ~31 lookups and the Year grid up to 365, all against
  // the same array, so this turns each into one O(completions) pass plus O(1) lookups per cell.
  const completionCounts = useMemo(() => buildCompletionCountsByDate(task.completions || []), [task.completions]);
  // Memoized once per task rather than recomputed per empty cell -- getTaskStreakChains walks
  // the task's full history, so this turns a per-cell cost back into a per-render one.
  const streakChains = useMemo(() => getTaskStreakChains(task), [task]);

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
      const nextCount = (completionCounts.get(dateString) ?? 0) + 1;
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
                  const isSkipped = streakState === 'connected';
                  const isSoftMissed = streakState === 'softMiss';
                  const isFuture = dateString > today;
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
                    : isSkipped
                    ? 'Skipped'
                    : '';

                  return (
                    <TouchableOpacity
                      key={dateString}
                      style={styles.day}
                      onPress={() => handleDayPress(date)}
                      delayLongPress={500}
                      accessibilityRole="button"
                      accessibilityLabel={`${format(date, 'EEEE, MMMM d')}${stateLabel ? `, ${stateLabel}` : ''}`}
                      accessibilityHint={isFuture ? undefined : 'Double tap to toggle completion'}
                      accessibilityState={{ disabled: isFuture }}
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
                        ref={dayNumber === 1 ? calendarGridRef : undefined}
                        style={[
                          styles.dayContent,
                          isCompleted && { backgroundColor: task.color },
                          isToday && !isCompleted && { borderWidth: 2, borderColor: task.color }
                        ]}>
                        {isMissed ? (
                          <MissedDayMark color={colors.textTertiary} size={16} />
                        ) : isSkipped ? (
                          <Text style={[styles.dayNumber, styles.fadedDayNumber]}>{dayNumber}</Text>
                        ) : isSoftMissed ? (
                          // No streak currently at stake here -- just a faded day number, no
                          // mark or connecting line at all, deliberately less notable than either
                          // a hard miss or a skip.
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
});
