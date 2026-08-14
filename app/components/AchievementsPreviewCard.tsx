import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AchievementBadgeCard } from './AchievementCard';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { useAchievementsStore } from '../stores/achievementsStore';
import { Task } from '../types';
import {
  ACHIEVEMENT_META,
  Achievement,
  TASK_SCOPED_KIND_ORDER,
  getGroupedAchievementCardStatuses,
} from '../utils/achievements';

// Up to this many of the most-recently-unlocked cards get the full dressed-up treatment; the
// single closest not-yet-earned kind (if any) renders separately below as a compact bar instead
// of a fourth card -- per explicit user direction ("I want the stats achievement showcase to show
// up to 3 achievements, and the Next be a simplified row/bar below them").
const MAX_VISIBLE_CARDS = 3;

// A compact "here's what you've earned" card for the Stats screens (both per-task TaskStatsView
// and the aggregate DashboardStatsView), linking out to the full Trophy Case -- addresses the
// standing TODO.md item asking for achievements to surface on Stats, not just live behind their
// own dedicated screen. Reuses achievements.ts's existing pure engine
// (getGroupedAchievementCardStatuses) plus AchievementCard.tsx's own dressed-up card component
// directly, so unlocked kinds render identically to their counterparts in the actual Trophy Case.
//
// `taskScoped` mirrors TrophiesScreen's own task-filter behavior exactly (dropping global-scoped
// kinds like Century Club/Perfect Day, which aren't attributable to a single task -- see
// isTaskScopedKind's own comment for why) -- callers are expected to have already pre-filtered
// `achievements`/`activeTasks` down to the relevant task the same way TrophiesScreen's filter row
// does, this component only decides whether to *also* drop the global kinds on top of that.
interface AchievementsPreviewCardProps {
  achievements: Achievement[];
  activeTasks: Task[];
  taskScoped: boolean;
  accentColor: string;
  onViewAll: () => void;
}

export const AchievementsPreviewCard: React.FC<AchievementsPreviewCardProps> = ({
  achievements,
  activeTasks,
  taskScoped,
  accentColor,
  onViewAll,
}) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queueCelebration = useAchievementsStore(state => state.queueCelebration);
  const mutedKinds = useAchievementsStore(state => state.mutedKinds);

  // `kinds` (not a post-filter) is what actually keeps this cheap on every task switch -- see
  // getAllAchievementCardStatuses' own comment on why computing, then discarding, the global
  // kinds' status isn't free (`time-of-day-ratio` in particular sorts the whole task's completion
  // history twice, unbounded, for a status that was only ever going to be filtered back out here).
  const groups = useMemo(
    () => getGroupedAchievementCardStatuses(achievements, activeTasks, undefined, taskScoped ? TASK_SCOPED_KIND_ORDER : undefined),
    [achievements, activeTasks, taskScoped]
  );

  const unlocked = groups.find(g => g.group === 'unlocked')?.statuses ?? [];
  // `locked` is already sorted in-progress-first (by closeness), then not-started (by catalog
  // order) -- see getGroupedAchievementCardStatuses's own doc comment -- so its first entry is
  // exactly "the single most relevant thing to work toward next," no extra sorting needed here.
  const nextUp = groups.find(g => g.group === 'locked')?.statuses[0];

  const visibleUnlocked = unlocked.slice(0, MAX_VISIBLE_CARDS);
  const nextUpMeta = nextUp ? ACHIEVEMENT_META[nextUp.kind] : undefined;
  const nextUpProgressPct = nextUp?.progress ? Math.min(1, nextUp.progress.current / nextUp.progress.target) * 100 : 0;

  if (visibleUnlocked.length === 0 && !nextUp) {
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={onViewAll}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Achievements"
        accessibilityHint="Opens the Trophy Case"
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Achievements</Text>
          <View style={styles.viewAllRow}>
            <Text style={[styles.viewAllText, { color: accentColor }]}>View All</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={accentColor} />
          </View>
        </View>
        <Text style={styles.emptyText}>No trophies yet -- keep it up!</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.headerRow}
        onPress={onViewAll}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="View Trophy Case"
        accessibilityHint="Opens the full Trophy Case"
      >
        <Text style={styles.title}>Achievements</Text>
        <View style={styles.viewAllRow}>
          <Text style={[styles.viewAllText, { color: accentColor }]}>View All</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={accentColor} />
        </View>
      </TouchableOpacity>

      {visibleUnlocked.length > 0 && (
        <View style={styles.cardRow}>
          {visibleUnlocked.map(status => (
            <AchievementBadgeCard
              key={status.kind}
              status={status}
              onPlay={queueCelebration}
              isMuted={mutedKinds.includes(status.kind)}
              mutedIconColor={colors.textSecondary}
              hideTaskAttribution={taskScoped}
            />
          ))}
        </View>
      )}

      {nextUp && nextUpMeta && (
        <View style={[styles.nextBlock, visibleUnlocked.length > 0 && styles.nextBlockSpaced]}>
          <View style={styles.nextLabelRow}>
            <MaterialCommunityIcons name={nextUpMeta.icon} size={13} color={nextUpMeta.color.base} />
            <Text style={styles.nextLabel} numberOfLines={1}>Next: {nextUpMeta.title}</Text>
            {nextUp.progress && (
              <Text style={styles.nextValue}>{nextUp.progress.current}/{nextUp.progress.target}</Text>
            )}
          </View>
          {nextUp.progress ? (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${nextUpProgressPct}%`, backgroundColor: nextUpMeta.color.base }]} />
            </View>
          ) : nextUp.opportunityAvailable ? (
            <Text style={styles.readyText}>Ready — revive a lapsed streak</Text>
          ) : null}
        </View>
      )}
    </View>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  // marginBottom matches the Stats screens' own section-level rhythm (statsDivider/chartSection
  // both use 20) rather than the tighter 12 used for stacking several cards within one section
  // (e.g. Trophy Case's own GRID_SPACING) -- this card sits between two whole sections (the
  // tertiary stat strip above, the Activity chart section below), not inside either one.
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 13,
    color: colors.textTertiary,
  },
  // Cards themselves are flex:1 (see AchievementCard's own cardWidth-omitted behavior), so
  // however many actually render (1-3, capped at MAX_VISIBLE_CARDS) evenly divide the full row
  // width instead of clumping to one side.
  cardRow: {
    flexDirection: 'row',
    gap: 8,
  },
  nextBlock: {
    gap: 4,
  },
  nextBlockSpaced: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  nextLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  nextLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  nextValue: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textTertiary,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  readyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFA726',
  },
});
