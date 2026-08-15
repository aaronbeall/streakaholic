import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AchievementBadgeCard } from '../components/AchievementCard';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { useTaskStore } from '../stores/taskStore';
import {
  ACHIEVEMENT_META,
  Achievement,
  AchievementCardStatus,
  TASK_SCOPED_KIND_ORDER,
  getGroupedAchievementCardStatuses,
} from '../utils/achievements';
import { useAchievementsStore } from '../stores/achievementsStore';

// Same responsive breakpoints HomeScreen's own task grid uses (2/3/4 columns) -- kept identical
// rather than inventing a new set, so the app's grid density feels consistent screen to screen.
const getColumnCount = (width: number): number => {
  if (width >= 1200) return 4;
  if (width >= 900) return 3;
  return 2;
};

const GRID_SPACING = 16;
const SIDE_PADDING = 16;

// One row of the FlatList's data -- either a section heading (Unlocked/In Progress/Not Started,
// full row width) or a chunk of up to `columnCount` cards laid out side by side. FlatList's own
// `numColumns` can't mix full-width header rows into a multi-column grid, so the grid is chunked
// by hand into these instead and rendered with numColumns omitted (1, effectively) -- the same
// technique this codebase already reaches for whenever a FlatList needs mixed-shape rows.
type TrophyListItem =
  | { type: 'header'; key: string; label: string }
  | { type: 'row'; key: string; statuses: AchievementCardStatus[] };

const buildListItems = (
  groups: { group: string; label: string; statuses: AchievementCardStatus[] }[],
  columnCount: number
): TrophyListItem[] => {
  const items: TrophyListItem[] = [];
  for (const g of groups) {
    items.push({ type: 'header', key: `header-${g.group}`, label: g.label });
    for (let i = 0; i < g.statuses.length; i += columnCount) {
      items.push({ type: 'row', key: `row-${g.group}-${i}`, statuses: g.statuses.slice(i, i + columnCount) });
    }
  }
  return items;
};

// Grid of badge-style cards, one per achievement kind -- unlocked kinds show their most recent
// earn (gold/task-colored, full opacity), locked kinds show a dimmed badge with a lock overlay
// plus, where a meaningful metric exists, a live "how close" progress bar derived from the
// current task list (see achievements.ts's getAchievementCardStatus for exactly what counts as
// "close" per kind). Mirrors ArchivedTasksScreen's header shape; the content below it is new.
// Cards are grouped under two headings -- Unlocked, Locked -- per explicit user direction
// (2026-08-12, collapsed from an original three-heading Unlocked/In Progress/Not Started split):
// unlocked sorts by most-recently-earned; within Locked, still-in-progress kinds (sorted by
// closeness) come first, followed by not-yet-started kinds (sorted by the catalog's own fixed
// order) -- the same two sub-sorts as before, just concatenated into one section instead of
// headed separately (see achievements.ts's getGroupedAchievementCardStatuses for the actual
// bucketing/sort logic -- this screen only renders what it returns). Tapping an unlocked card
// replays its celebration (queueCelebration re-queues the same earned record for
// AchievementCelebration, no new history entry); a locked card instead previews a synthetic,
// never-persisted achievement (see AchievementCard.tsx's own buildPreviewAchievement).
//
// The dressed-up card itself (TrophyEmblem, the ribbon banner, the locked/progress states) lives
// in a shared app/components/AchievementCard.tsx (extracted 2026-08-13) so the Stats screens' own
// compact AchievementsPreviewCard can render kinds identically to their counterparts here, rather
// than a cheaper-looking treatment that would visually disagree with this actual Trophy Case.
export const TrophiesScreen: React.FC = () => {
  const router = useRouter();
  // Lets a per-task screen (TaskStatsView's own AchievementsPreviewCard) deep-link straight into
  // this task's own filtered view, e.g. `router.push({pathname:'/trophies', params:{taskId}})` --
  // read once as this state's own initial value (a fresh navigation always mounts this screen
  // fresh, so a plain useState initializer is sufficient; the filter row itself takes over from
  // there for any further in-screen changes).
  const params = useLocalSearchParams<{ taskId?: string }>();
  const achievements = useAchievementsStore(state => state.achievements);
  const queueCelebration = useAchievementsStore(state => state.queueCelebration);
  const queueCelebrations = useAchievementsStore(state => state.queueCelebrations);
  const queueAlerts = useAchievementsStore(state => state.queueAlerts);
  const mutedKinds = useAchievementsStore(state => state.mutedKinds);
  const tasks = useTaskStore(state => state.tasks);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const activeTasks = useMemo(() => tasks.filter(t => !t.archived), [tasks]);

  // "All" (null) vs. a single selected task -- a radio choice, not Dashboard's own multi-select
  // checkbox filter, since a per-kind grid card only ever shows *one* task's worth of progress at
  // a time anyway (see getAchievementCardStatus's own "closest task" logic below), so filtering to
  // more than one task at once wouldn't actually narrow anything further.
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(params.taskId ?? null);
  const selectedTask = useMemo(
    () => (selectedTaskId ? activeTasks.find(t => t.id === selectedTaskId) : undefined),
    [selectedTaskId, activeTasks]
  );

  // Achievements attributed to any *other* task (or no task at all) are excluded outright rather
  // than left to read as "not yet earned by this task" -- global achievement records carry no
  // taskId at all, so they're excluded here regardless (`a.taskId === selectedTask.id` is always
  // false for them), same as a genuinely different task's own records.
  const filteredAchievements = useMemo(
    () => (selectedTask ? achievements.filter(a => a.taskId === selectedTask.id) : achievements),
    [achievements, selectedTask]
  );
  // Scopes every "closest task" progress calculation down to just this one task, so a locked
  // kind's progress bar reads as "how close is *this* task" instead of "how close is whichever
  // task happens to be closest across the whole list."
  const activeTasksForGroups = useMemo(
    () => (selectedTask ? [selectedTask] : activeTasks),
    [selectedTask, activeTasks]
  );

  const groups = useMemo(() => {
    // Global-scoped kinds (first-completion, perfect-day, century-club, habit-collector, ...)
    // aren't attributable to any single task -- their own condition genuinely spans every task
    // (or none in particular), so scoping their progress down to one task would either always
    // read as "not yet started" or show a number that doesn't mean what it looks like it means
    // (e.g. Century Club's cross-task completion sum, computed against just this one task).
    // Passed as the `kinds` param (excluding them from computation entirely, not just the
    // rendered result) rather than filtered out afterward -- computing several global kinds'
    // status just to discard it isn't free, see getAllAchievementCardStatuses' own comment on
    // why this was a real performance problem (each task switch/filter re-running two full,
    // unbounded sorts of the selected task's own completion history for kinds that were always
    // going to be dropped here).
    // getGroupedAchievementCardStatuses already omits any bucket that ends up empty (see its own
    // doc comment), so no extra filtering is needed here regardless of which kind list was used.
    return getGroupedAchievementCardStatuses(
      filteredAchievements,
      activeTasksForGroups,
      undefined,
      selectedTask ? TASK_SCOPED_KIND_ORDER : undefined
    );
  }, [filteredAchievements, activeTasksForGroups, selectedTask]);

  const columnCount = getColumnCount(width);
  const availableWidth = width - SIDE_PADDING * 2 - GRID_SPACING * (columnCount - 1);
  const cardWidth = Math.floor(availableWidth / columnCount);

  const totalCount = groups.reduce((sum, g) => sum + g.statuses.length, 0);
  const unlockedCount = groups.find(g => g.group === 'unlocked')?.statuses.length ?? 0;
  const listItems = useMemo(() => buildListItems(groups, columnCount), [groups, columnCount]);

  const handleSelectTask = (taskId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTaskId(prev => (prev === taskId ? null : taskId));
  };

  // Dev-only one-tap fixture for a single mixed unlock event: a random two-to-four achievements
  // receive the full treatment while two behave as snoozed kinds. Full-screen work should show
  // first as one batch; closing it should reveal the quick alerts in order, without fake history.
  const handleTestCelebrationBatch = () => {
    const now = Date.now();
    const fullCelebrationCount = Math.floor(Math.random() * 3) + 2;
    const statuses = groups.flatMap(group => group.statuses).slice(0, fullCelebrationCount + 2);
    const previews: Achievement[] = statuses.map((status, index) => {
      if (status.latest) {
        return {
          ...status.latest,
          id: `dev-batch-${now}-${index}`,
          dedupScope: 'preview',
          earnedAt: new Date(now).toISOString(),
        };
      }

      const meta = ACHIEVEMENT_META[status.kind];
      const task = meta.scope === 'task' ? (selectedTask ?? activeTasks[0]) : undefined;
      return {
        id: `dev-batch-${now}-${index}`,
        kind: status.kind,
        taskId: task?.id,
        taskName: task?.name ?? status.progress?.taskName,
        taskIcon: task?.icon,
        taskColor: task?.color ?? status.progress?.taskColor,
        value: status.progress?.target,
        dedupScope: 'preview',
        earnedAt: new Date(now).toISOString(),
      };
    });

    const celebrations = previews.slice(0, fullCelebrationCount);
    const alerts = previews.slice(fullCelebrationCount);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Queue the high-priority side first, then the alert side in the same event turn. This mirrors
    // recordCompletionAchievements' mixed result without the old artificial delayed preemption.
    queueCelebrations(celebrations);
    queueAlerts(alerts);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Trophy Case</Text>
          <Text style={styles.headerSubtitle}>{unlockedCount} of {totalCount} unlocked</Text>
        </View>
        {__DEV__ ? (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleTestCelebrationBatch}
            accessibilityRole="button"
            accessibilityLabel="Test achievement presentation queues"
            accessibilityHint="Shows two to four full celebrations followed by snoozed alerts"
          >
            <MaterialCommunityIcons name="test-tube" size={21} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>

      {activeTasks.length > 1 && (
        <View style={styles.taskFilterContainer}>
          <TouchableOpacity
            style={[styles.taskFilterChip, !selectedTaskId && styles.taskFilterChipActive]}
            onPress={() => setSelectedTaskId(null)}
            accessibilityRole="radio"
            accessibilityLabel="All habits"
            accessibilityState={{ checked: !selectedTaskId }}
          >
            <Text style={[styles.taskFilterChipText, !selectedTaskId && styles.taskFilterChipTextActive]}>All</Text>
          </TouchableOpacity>
          {activeTasks.map(task => (
            <TouchableOpacity
              key={task.id}
              style={[
                styles.taskFilterIconChip,
                { backgroundColor: colors.overlay },
                selectedTaskId === task.id && { backgroundColor: task.color },
              ]}
              onPress={() => handleSelectTask(task.id)}
              accessibilityRole="radio"
              accessibilityLabel={task.name}
              accessibilityState={{ checked: selectedTaskId === task.id }}
            >
              <MaterialCommunityIcons
                name={task.icon}
                size={16}
                color={selectedTaskId === task.id ? '#fff' : task.color}
              />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {listItems.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="trophy-outline" size={40} color={colors.textTertiary} />
          <Text style={styles.emptyStateText}>No task-specific trophies yet for {selectedTask?.name}</Text>
        </View>
      ) : (
        <FlatList
          data={listItems}
          key={columnCount}
          keyExtractor={item => item.key}
          contentContainerStyle={[styles.listContent, { paddingBottom: 16 + insets.bottom }]}
          renderItem={({ item, index }) =>
            item.type === 'header' ? (
              <View style={[styles.sectionHeaderRow, index === 0 && styles.sectionHeaderRowFirst]}>
                <View style={styles.sectionHeaderDivider} />
                <Text style={styles.sectionHeader}>{item.label}</Text>
                <View style={styles.sectionHeaderDivider} />
              </View>
            ) : (
              <View style={styles.row}>
                {item.statuses.map(status => (
                  <AchievementBadgeCard
                    key={status.kind}
                    status={status}
                    cardWidth={cardWidth}
                    onPlay={queueCelebration}
                    isMuted={mutedKinds.includes(status.kind)}
                    mutedIconColor={colors.textSecondary}
                    hideTaskAttribution={!!selectedTask}
                  />
                ))}
              </View>
            )
          }
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 2,
  },
  taskFilterContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: SIDE_PADDING,
    paddingVertical: 12,
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  taskFilterChip: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  taskFilterChipActive: {
    backgroundColor: colors.text,
  },
  taskFilterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  taskFilterChipTextActive: {
    color: colors.background,
  },
  taskFilterIconChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: SIDE_PADDING,
    paddingTop: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
    marginBottom: 14,
  },
  sectionHeaderRowFirst: {
    marginTop: 12,
  },
  sectionHeaderDivider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: GRID_SPACING,
    marginBottom: 26,
  },
});
