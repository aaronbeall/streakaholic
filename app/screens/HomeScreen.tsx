import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator, ShadowDecorator } from 'react-native-draggable-flatlist';
import Reanimated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import tinycolor from 'tinycolor2';
import { OnboardingHint, TargetLayout } from '../components/OnboardingHint';
import { CardSide, TaskCard } from '../components/TaskCard';
import { useToast } from '../context/ToastContext';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { useSettingsStore } from '../stores/settingsStore';
import { useTaskStore } from '../stores/taskStore';
import { MaterialCommunityIconName, Task } from '../types';
import { getStreakStats } from '../utils/data';
import { isTaskCompleted } from '../utils/streaks';
import { ACTIVE_TASK_LIMIT_MESSAGE, hasReachedActiveTaskLimit } from '../utils/taskLimits';

// Narrower than the full OnboardingHintKey union -- this screen only ever produces one of these
// three (see onboardingCandidateKey below), never the other screens' single stationary-target hints.
type HomeHintKey = 'hold-to-complete' | 'tap-to-cycle' | 'hold-to-expand';
const HOME_HINT_KEYS: HomeHintKey[] = ['hold-to-complete', 'tap-to-cycle', 'hold-to-expand'];

const ONBOARDING_HINT_TEXT: Record<HomeHintKey, string> = {
  'hold-to-complete': 'Press and hold to complete',
  'tap-to-cycle': 'Tap to see calendar & stats',
  'hold-to-expand': 'Press and hold to open the full screen and make changes',
};

const GRID_SPACING = 16;
const SIDE_PADDING = 16;
const FAB_SIZE = 56;
const FAB_OFFSET = 24;

type FilterType = 'up_to_date' | 'expiring' | null;
type SortOption = 'created' | 'most-used' | 'color' | 'time';
const SORT_OPTIONS: readonly (readonly [SortOption, string, MaterialCommunityIconName])[] = [
  ['created', 'Created', 'calendar-clock-outline'],
  ['most-used', 'Most Used', 'chart-line'],
  ['color', 'Color', 'palette-outline'],
  ['time', 'Time of Day', 'clock-outline'],
];

const REORDER_ROW_HEIGHT = 64;
const REORDER_ROW_GAP = 12;
// The list's defaults favour a fairly soft spring. A firmer, clamped settle makes the release
// feel deliberate: the lifted row lands at its placeholder without a visible bounce.
const REORDER_ANIMATION_CONFIG = {
  damping: 24,
  mass: 0.35,
  stiffness: 220,
  overshootClamping: true,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 2,
};

const getReminderTime = (task: Task): string | null =>
  task.notifications?.level && task.notifications.level > 0 && /^\d{2}:\d{2}$/.test(task.notifications.time)
    ? task.notifications.time
    : null;

// Include the current index as a tie-breaker. This makes every preset stable: habits that have
// the same timestamp, usage count, color, or reminder time retain their existing relative order.
const orderTasksBy = (tasks: Task[], sort: SortOption): Task[] =>
  tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      if (sort === 'created') {
        return a.task.createdAt.localeCompare(b.task.createdAt) || a.index - b.index;
      }
      if (sort === 'most-used') {
        return (b.task.stats?.totalCompletions ?? 0) - (a.task.stats?.totalCompletions ?? 0) || a.index - b.index;
      }
      if (sort === 'color') {
        return tinycolor(a.task.color).toHsv().h - tinycolor(b.task.color).toHsv().h || a.index - b.index;
      }

      const aTime = getReminderTime(a.task);
      const bTime = getReminderTime(b.task);
      if (!aTime && !bTime) return a.index - b.index;
      if (!aTime) return 1;
      if (!bTime) return -1;
      return aTime.localeCompare(bTime) || a.index - b.index;
    })
    .map(({ task }) => task);

const ReorderableTaskRow: React.FC<{
  task: Task;
  drag: () => void;
  isActive: boolean;
}> = ({ task, drag, isActive }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScaleDecorator activeScale={1.02}>
      <ShadowDecorator elevation={isActive ? 6 : 0} opacity={isActive ? 0.2 : 0}>
        <TouchableOpacity
          style={[styles.reorderRow, isActive && styles.reorderRowActive]}
          // Start the draggable-list state as soon as any part of the row is touched. Its parent
          // pan recognizer still requires vertical movement (`activationDistance` below), so a
          // regular tap cannot reorder a habit.
          onPressIn={drag}
          disabled={isActive}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel={`Drag ${task.name} to reorder`}
          accessibilityHint="Touch and drag to a new position"
        >
          <View style={[styles.reorderIcon, { backgroundColor: task.color }]}>
            <MaterialCommunityIcons name={task.icon} size={20} color="#fff" />
          </View>
          <Text style={styles.reorderName} numberOfLines={1}>{task.name}</Text>
          <MaterialCommunityIcons name="drag-vertical" size={22} color={colors.textTertiary} />
        </TouchableOpacity>
      </ShadowDecorator>
    </ScaleDecorator>
  );
};

const HomeHeader = React.memo(({
  activeFilter,
  onFilterChange,
  isReordering,
  onToggleReordering,
}: {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  isReordering: boolean;
  onToggleReordering: () => void;
}) => {
  const router = useRouter();
  const tasks = useTaskStore(state => state.tasks);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const streakStats = useMemo(() => getStreakStats(tasks.filter(task => !task.archived)), [tasks]);

  const handleFilterPress = (filter: FilterType) => {
    onFilterChange(activeFilter === filter ? null : filter);
  };

  if (isReordering) {
    return (
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerSpacer} />
        <Text style={styles.reorderTitle}>Reorder Habits</Text>
        <TouchableOpacity
          style={styles.doneButton}
          onPress={onToggleReordering}
          accessibilityRole="button"
          accessibilityLabel="Done reordering habits"
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerActions}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.push({ pathname: '/dashboard' })}
          accessibilityRole="button"
          accessibilityLabel="Dashboard"
        >
          <MaterialCommunityIcons name="chart-bar" size={24} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerButtonSecondary}
          onPress={() => router.push('/trophies')}
          accessibilityRole="button"
          accessibilityLabel="Trophy Case"
          accessibilityHint="Opens your trophy history"
        >
          <MaterialCommunityIcons name="trophy-outline" size={21} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.streakBubbles}>
        {streakStats.upToDate > 0 && (
          <TouchableOpacity
            style={[
              styles.streakBubble,
              { backgroundColor: 'rgba(255, 59, 48, 0.1)' },
              activeFilter === 'up_to_date' && { backgroundColor: '#FF3B30' }
            ]}
            onPress={() => handleFilterPress('up_to_date')}
            accessibilityRole="button"
            accessibilityLabel={`${streakStats.upToDate} ${streakStats.upToDate === 1 ? 'habit' : 'habits'} up to date`}
            accessibilityHint="Filters the list to only these habits"
            accessibilityState={{ selected: activeFilter === 'up_to_date' }}
          >
            <MaterialCommunityIcons
              name="fire"
              size={16}
              color={activeFilter === 'up_to_date' ? '#fff' : '#FF3B30'}
            />
            <Text style={[
              styles.streakBubbleText,
              { color: activeFilter === 'up_to_date' ? '#fff' : '#FF3B30' }
            ]}>
              {streakStats.upToDate}
            </Text>
          </TouchableOpacity>
        )}
        {streakStats.expiring > 0 && (
          <TouchableOpacity
            style={[
              styles.streakBubble,
              { backgroundColor: 'rgba(255, 167, 38, 0.1)' },
              activeFilter === 'expiring' && { backgroundColor: '#FFA726' }
            ]}
            onPress={() => handleFilterPress('expiring')}
            accessibilityRole="button"
            accessibilityLabel={`${streakStats.expiring} ${streakStats.expiring === 1 ? 'habit' : 'habits'} expiring`}
            accessibilityHint="Filters the list to only these habits"
            accessibilityState={{ selected: activeFilter === 'expiring' }}
          >
            <MaterialCommunityIcons
              name="clock-outline"
              size={16}
              color={activeFilter === 'expiring' ? '#fff' : '#FFA726'}
            />
            <Text style={[
              styles.streakBubbleText,
              { color: activeFilter === 'expiring' ? '#fff' : '#FFA726' }
            ]}>
              {streakStats.expiring}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.headerActions}>
        <TouchableOpacity
          style={styles.headerButtonSecondary}
          onPress={onToggleReordering}
          accessibilityRole="button"
          accessibilityLabel="Reorder habits"
          accessibilityHint="Opens controls to change the habit order"
        >
          <MaterialCommunityIcons name="sort-variant" size={21} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <MaterialCommunityIcons name="cog" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

HomeHeader.displayName = "HomeHeader";

export const HomeScreen: React.FC = () => {
  const router = useRouter();
  const tasks = useTaskStore(state => state.tasks);
  const completeTask = useTaskStore(state => state.completeTask);
  const undoCompleteTask = useTaskStore(state => state.undoCompleteTask);
  const reorderTasks = useTaskStore(state => state.reorderTasks);
  const { showToast } = useToast();
  const onboardingHintsSeen = useSettingsStore(state => state.onboardingHintsSeen);
  const setOnboardingHintSeen = useSettingsStore(state => state.setOnboardingHintSeen);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<FilterType>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [appliedSort, setAppliedSort] = useState<SortOption | null>(null);
  const [onboardingTargetLayout, setOnboardingTargetLayout] = useState<TargetLayout | null>(null);
  const [onboardingTargetFace, setOnboardingTargetFace] = useState<CardSide>('task');
  const onboardingTargetRef = useRef<View>(null);
  const onboardingContainerRef = useRef<View>(null);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const filteredTasks = useMemo(() => tasks.filter(task => {
    if (task.archived) return false;
    if (!filter) return true;
    if (filter === 'up_to_date') {
      return task.stats?.streakStatus === 'up_to_date' && task.stats.currentStreak > 0;
    }
    if (filter === 'expiring') {
      return task.stats?.streakStatus === 'expiring' && task.stats.currentStreak > 0;
    }
    return true;
  }), [tasks, filter]);

  const hasAnyTasks = useMemo(() => tasks.some(task => !task.archived), [tasks]);
  const activeTasks = useMemo(() => tasks.filter(task => !task.archived), [tasks]);
  const atTaskLimit = useMemo(() => hasReachedActiveTaskLimit(tasks), [tasks]);

  const applySort = useCallback((sort: SortOption) => {
    reorderTasks(orderTasksBy(activeTasks, sort).map(task => task.id));
    setAppliedSort(sort);
    Haptics.selectionAsync();
  }, [activeTasks, reorderTasks]);

  const handleAddTask = useCallback(() => {
    if (atTaskLimit) {
      showToast({ message: ACTIVE_TASK_LIMIT_MESSAGE });
      return;
    }
    router.push('/add-task');
  }, [atTaskLimit, showToast, router]);

  const getColumnCount = () => {
    if (width >= 1200) return 4;
    if (width >= 900) return 3;
    return 2;
  };

  const columnCount = getColumnCount();
  const availableWidth = width - (SIDE_PADDING * 2) - (GRID_SPACING * (columnCount - 1));
  const cardSize = Math.floor(availableWidth / columnCount);

  // The onboarding hints walk through the first visible card only -- same task throughout,
  // so the pointer/highlight never has to jump between cards. Once every hint has been seen
  // (each dismissed independently), stop targeting a card at all. Only this screen's own three
  // hints gate that -- Dashboard's/task-detail's unrelated stationary-target hints don't.
  const allOnboardingHintsSeen = HOME_HINT_KEYS.every(key => onboardingHintsSeen[key]);
  const onboardingTargetTask = allOnboardingHintsSeen ? undefined : filteredTasks[0];
  const onboardingTargetTaskId = onboardingTargetTask?.id;

  // Read inside the stable per-card callbacks below (each created once via useCallback, so
  // TaskCard's own React.memo isn't defeated by a fresh closure per card per render) instead of
  // being captured in their closures directly -- both of these can change on every render, but
  // the callbacks themselves must not, so they read the *current* value via ref at call time.
  const onboardingTargetTaskIdRef = useRef(onboardingTargetTaskId);
  onboardingTargetTaskIdRef.current = onboardingTargetTaskId;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // Which condition matches right now, purely a function of the target card's live state: its
  // due-today completion status, and which face it's currently showing. Only shown if that
  // specific hint hasn't already been seen/dismissed on its own.
  const onboardingCandidateKey: HomeHintKey | null = !onboardingTargetTask
    ? null
    : onboardingTargetFace !== 'task'
    ? 'hold-to-expand'
    : isTaskCompleted(onboardingTargetTask)
    ? 'tap-to-cycle'
    : 'hold-to-complete';

  const onboardingHintKey = onboardingCandidateKey && !onboardingHintsSeen[onboardingCandidateKey]
    ? onboardingCandidateKey
    : null;

  // Measured relative to `onboardingContainerRef` (the same View OnboardingHint's absoluteFill
  // is scoped inside), not `measureInWindow`. `measureInWindow` reports OS window coordinates,
  // which only line up with OnboardingHint's `top`/`left` (relative to its own RN parent) if that
  // parent's origin exactly coincides with the window's origin -- an assumption Android's
  // edge-to-edge status-bar handling breaks, which is what caused the ring to render offset
  // upward into the header. Measuring relative to the shared container sidesteps window/status
  // bar coordinates entirely: both the card and the overlay are positioned in the exact same
  // reference frame by construction.
  const measureOnboardingTarget = () => {
    if (!onboardingContainerRef.current) return;
    onboardingTargetRef.current?.measureLayout(
      onboardingContainerRef.current,
      (x, y, measuredWidth, measuredHeight) => {
        setOnboardingTargetLayout({ x, y, width: measuredWidth, height: measuredHeight });
      },
      () => {} // not mounted/measurable yet -- the next trigger (onLayout/poll below) will retry
    );
  };

  // `onLayout` (react-native-web's ResizeObserver-backed polyfill) doesn't reliably fire on
  // initial mount, so a rAF-scheduled measurement after render is the primary trigger; onLayout
  // and onScroll below are kept as supplementary re-measures for when layout genuinely shifts.
  //
  // On native Android, a single rAF isn't enough on its own: unlike web (where layout is
  // synchronous with paint), the native layout pass -- and any late reflow from the screen's own
  // slide-in navigation transition -- can still be in flight when that first frame fires. Rather
  // than guess how long that takes, poll on a short interval and stop once two consecutive reads
  // agree (layout has settled), capping the total wait so a card that never stabilizes doesn't
  // poll forever. Each call just overwrites `onboardingTargetLayout`, so the wrong-then-right
  // sequence of updates along the way is harmless (only ever visible for a frame or two).
  useEffect(() => {
    if (!onboardingTargetTaskId) return;

    const POLL_INTERVAL_MS = 100;
    const MAX_POLLS = 15; // ~1.5s ceiling
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastMeasured: TargetLayout | null = null;
    let stableCount = 0;
    let pollCount = 0;

    const isSameLayout = (a: TargetLayout, b: TargetLayout) =>
      a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

    const poll = () => {
      if (cancelled || !onboardingContainerRef.current) return;
      onboardingTargetRef.current?.measureLayout(
        onboardingContainerRef.current,
        (x, y, measuredWidth, measuredHeight) => {
          if (cancelled) return;
          const next: TargetLayout = { x, y, width: measuredWidth, height: measuredHeight };
          setOnboardingTargetLayout(next);
          stableCount = lastMeasured && isSameLayout(lastMeasured, next) ? stableCount + 1 : 0;
          lastMeasured = next;
          pollCount += 1;
          if (stableCount < 2 && pollCount < MAX_POLLS) {
            timer = setTimeout(poll, POLL_INTERVAL_MS);
          }
        },
        () => {
          pollCount += 1;
          if (pollCount < MAX_POLLS) {
            timer = setTimeout(poll, POLL_INTERVAL_MS);
          }
        }
      );
    };

    const frame = requestAnimationFrame(poll);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [onboardingTargetTaskId, columnCount]);

  // A new target card starts out showing its task face, until its own onFlip says otherwise.
  useEffect(() => {
    setOnboardingTargetFace('task');
  }, [onboardingTargetTaskId]);

  // Stable (`useCallback`'d) so `TaskCard`'s own `React.memo` isn't defeated by a fresh closure
  // handed to every visible card on every `HomeScreen` render -- `setOnboardingHintSeen` is
  // itself a stable Zustand action reference, so this never actually needs to change identity.
  const markOnboardingHintSeen = useCallback((key: HomeHintKey) => {
    setOnboardingHintSeen(key, true);
  }, [setOnboardingHintSeen]);

  // One stable handler per gesture, shared by every card (not one fresh closure per card per
  // render) -- each takes the task's id and looks up whatever it needs via the refs above, so
  // identity never has to change just because a *different* task became the onboarding target or
  // the task list itself changed.
  const handleLongPressCalendar = useCallback((taskId: string) => {
    if (taskId === onboardingTargetTaskIdRef.current) markOnboardingHintSeen('hold-to-expand');
    router.push({ pathname: '/task-detail', params: { taskId, tab: 'calendar' } });
  }, [router, markOnboardingHintSeen]);

  const handleLongPressStats = useCallback((taskId: string) => {
    if (taskId === onboardingTargetTaskIdRef.current) markOnboardingHintSeen('hold-to-expand');
    router.push({ pathname: '/task-detail', params: { taskId, tab: 'stats' } });
  }, [router, markOnboardingHintSeen]);

  // Only ever called for a task that isn't completed yet -- `TaskCard` itself checks
  // `isTaskCompleted` before deciding whether to trigger this (a real completion) or
  // `handleLongPressCompletedTask` below (open task-detail, nothing to complete).
  const handleLongPressTask = useCallback((taskId: string) => {
    const task = tasksRef.current.find(t => t.id === taskId);
    if (!task) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    completeTask(task.id);
    if (task.id === onboardingTargetTaskIdRef.current) markOnboardingHintSeen('hold-to-complete');
    showToast({
      message: `"${task.name}" completed`,
      action: { label: 'Undo', onPress: () => undoCompleteTask(task.id) },
    });
  }, [completeTask, undoCompleteTask, showToast, markOnboardingHintSeen]);

  // Long-pressing an already-completed task's face -- opens task-detail on whichever tab was
  // last viewed (no `tab` param, same fallback-to-`taskDetailLastTab` behavior `task-detail`
  // already has for any other no-tab-specified navigation), with no completion animation since
  // there's nothing left to complete.
  const handleLongPressCompletedTask = useCallback((taskId: string) => {
    router.push({ pathname: '/task-detail', params: { taskId } });
  }, [router]);

  const handleFlip = useCallback((taskId: string, side: CardSide) => {
    if (taskId !== onboardingTargetTaskIdRef.current) return;
    setOnboardingTargetFace(side);
    if (side !== 'task') markOnboardingHintSeen('tap-to-cycle');
  }, [markOnboardingHintSeen]);

  const renderItem = useCallback(({ item }: { item: Task }) => {
    const isOnboardingTarget = item.id === onboardingTargetTaskIdRef.current;
    return (
      <TaskCard
        ref={isOnboardingTarget ? onboardingTargetRef : undefined}
        onLayout={isOnboardingTarget ? measureOnboardingTarget : undefined}
        task={item}
        size={cardSize}
        onLongPressCalendar={handleLongPressCalendar}
        onLongPressStats={handleLongPressStats}
        onLongPressTask={handleLongPressTask}
        onLongPressCompletedTask={handleLongPressCompletedTask}
        onFlip={handleFlip}
      />
    );
  }, [cardSize, handleLongPressCalendar, handleLongPressStats, handleLongPressTask, handleLongPressCompletedTask, handleFlip]);

  return (
    <View style={styles.container} ref={onboardingContainerRef}>
      <HomeHeader
        activeFilter={filter}
        onFilterChange={setFilter}
        isReordering={isReordering}
        onToggleReordering={() => setIsReordering(value => !value)}
      />
      {isReordering ? (
        <DraggableFlatList
          data={activeTasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.reorderListContent, { paddingBottom: 16 + insets.bottom }]}
          ListHeaderComponent={
            <View style={styles.reorderHeader}>
              <Text style={styles.sortOptionsTitle}>Order by</Text>
              <View style={styles.sortOptions} accessibilityLabel="Sort habits">
                {SORT_OPTIONS.map(([sort, label, icon]) => (
                  <TouchableOpacity
                    key={sort}
                    style={[styles.sortOption, appliedSort === sort && styles.sortOptionSelected]}
                    onPress={() => applySort(sort)}
                    accessibilityRole="button"
                    accessibilityLabel={`Sort by ${label.toLowerCase()}`}
                    accessibilityState={{ selected: appliedSort === sort }}
                  >
                    <MaterialCommunityIcons
                      name={icon}
                      size={18}
                      color={appliedSort === sort ? '#fff' : colors.textSecondary}
                    />
                    <Text style={[styles.sortOptionText, appliedSort === sort && styles.sortOptionTextSelected]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.reorderDescription}>Or touch and drag any habit to place it exactly where you want.</Text>
            </View>
          }
          renderItem={({ item, drag, isActive }: RenderItemParams<Task>) => (
            <ReorderableTaskRow task={item} drag={drag} isActive={isActive} />
          )}
          onDragEnd={({ data }) => {
            reorderTasks(data.map(task => task.id));
            setAppliedSort(null);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          onDragBegin={() => Haptics.selectionAsync()}
          animationConfig={REORDER_ANIMATION_CONFIG}
          activationDistance={8}
          dragItemOverflow={false}
        />
      ) : (
      <FlatList
        key={columnCount}
        data={filteredTasks}
        keyExtractor={(item) => item.id}
        numColumns={columnCount}
        columnWrapperStyle={styles.row}
        getItemLayout={(data, index) => ({
          length: cardSize,
          offset: cardSize * Math.floor(index / columnCount),
          index,
        })}
        onScroll={onboardingTargetTaskId ? measureOnboardingTarget : undefined}
        scrollEventThrottle={100}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: FAB_OFFSET + FAB_SIZE + GRID_SPACING + insets.bottom },
          filteredTasks.length === 0 && styles.emptyListContent,
        ]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Reanimated.View
              entering={FadeIn.duration(400)}
              style={[
                styles.emptyIconBadge,
                { backgroundColor: hasAnyTasks ? colors.surfaceSecondary : 'rgba(255, 107, 107, 0.12)' },
              ]}
            >
              <MaterialCommunityIcons
                name={hasAnyTasks ? 'filter-off-outline' : 'fire'}
                size={40}
                color={hasAnyTasks ? colors.textTertiary : '#FF6B6B'}
              />
            </Reanimated.View>
            <Reanimated.View entering={FadeInDown.duration(400).delay(100)} style={styles.emptyStateTextGroup}>
              <Text style={styles.emptyStateTitle}>
                {hasAnyTasks ? 'No habits match this filter' : 'Start your first streak'}
              </Text>
              <Text style={styles.emptyStateSubtitle}>
                {hasAnyTasks
                  ? 'Try a different filter, or clear it to see everything.'
                  : 'Track a daily habit and watch your streak grow.'}
              </Text>
              {hasAnyTasks ? (
                <TouchableOpacity style={styles.emptyStateButtonSecondary} onPress={() => setFilter(null)} accessibilityRole="button">
                  <Text style={styles.emptyStateButtonSecondaryText}>Clear Filter</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.emptyStateButton} onPress={handleAddTask} accessibilityRole="button">
                  <MaterialCommunityIcons name="plus" size={18} color="#fff" />
                  <Text style={styles.emptyStateButtonText}>Add Habit</Text>
                </TouchableOpacity>
              )}
            </Reanimated.View>
          </View>
        }
      />
      )}
      {!isReordering && <TouchableOpacity
        style={[styles.addButton, { bottom: FAB_OFFSET + insets.bottom }]}
        onPress={handleAddTask}
        accessibilityRole="button"
        accessibilityLabel="Add habit"
      >
        <MaterialCommunityIcons name="plus" size={32} color="#fff" />
      </TouchableOpacity>}
      {!isReordering && onboardingHintKey && onboardingTargetLayout && (
        <OnboardingHint
          key={onboardingHintKey}
          text={ONBOARDING_HINT_TEXT[onboardingHintKey]}
          targetLayout={onboardingTargetLayout}
          onDismiss={() => markOnboardingHintSeen(onboardingHintKey)}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.iconButtonBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonSecondary: {
    width: 36,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  reorderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  doneButton: {
    minWidth: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '700',
  },
  streakBubbles: {
    flexDirection: 'row',
    gap: 8,
  },
  streakBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  streakBubbleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: SIDE_PADDING,
    paddingTop: SIDE_PADDING,
    // paddingBottom is applied inline (needs insets.bottom, computed at render time)
    gap: GRID_SPACING,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  reorderListContent: {
    padding: 16,
    gap: REORDER_ROW_GAP,
  },
  reorderHeader: {
    gap: 10,
    marginBottom: 4,
  },
  sortOptionsTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  reorderDescription: {
    color: colors.textTertiary,
    fontSize: 13,
    lineHeight: 18,
  },
  sortOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sortOption: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.iconButtonBackground,
  },
  sortOptionSelected: {
    backgroundColor: '#007AFF',
  },
  sortOptionText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  sortOptionTextSelected: {
    color: '#fff',
  },
  reorderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: REORDER_ROW_HEIGHT,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  reorderRowActive: {
    backgroundColor: colors.surfaceSecondary,
  },
  reorderIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderName: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyStateTextGroup: {
    alignItems: 'center',
    gap: 8,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 12,
  },
  emptyStateButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyStateButtonSecondary: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 12,
  },
  emptyStateButtonSecondaryText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  row: {
    // 'center' instead of 'space-between': a full row already exactly fills the available width
    // (cardSize is derived from it), so centering has no visible effect there -- it only changes
    // an incomplete last row, which now centers its leftover card(s) instead of being stretched
    // to fill the row (that stretch was TaskCard's own flex: 1, fixed at its source).
    justifyContent: 'center',
    gap: GRID_SPACING,
  },
  addButton: {
    position: 'absolute',
    right: FAB_OFFSET,
    // bottom is applied inline (needs insets.bottom, computed at render time)
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    padding: 8,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
});
