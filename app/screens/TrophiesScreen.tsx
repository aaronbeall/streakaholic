import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import tinycolor from 'tinycolor2';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { useTaskStore } from '../stores/taskStore';
import { MaterialCommunityIconName } from '../types';
import {
  Achievement,
  ACHIEVEMENT_META,
  AchievementCardStatus,
  AchievementEarner,
  getGroupedAchievementCardStatuses,
  getRibbonText,
} from '../utils/achievements';
import { useAchievementsStore } from '../stores/achievementsStore';

// Same responsive breakpoints HomeScreen's own task grid uses (2/3/4 columns) -- kept identical
// rather than inventing a new set, so the app's grid density feels consistent screen to screen.
const getColumnCount = (width: number): number => {
  if (width >= 1200) return 4;
  if (width >= 900) return 3;
  return 2;
};

const GRID_SPACING = 12;
const SIDE_PADDING = 16;

const LOCKED_COLOR = '#8e8e93';

// ============================================================================================
// A static, size-fixed "dressed up" emblem for unlocked Trophy Case cards, per explicit user
// direction ("dress up the trophy screen emblem a bit per the color scheme, halo, banner, and
// shadow effect we use on the congratulation screen"). Reuses the same visual language as
// AchievementCelebration's own TrophyBadge (a halo glow, a white ring around a colored face with
// flat diagonal-shadow shading, a ribbon banner) but with none of its animation machinery -- up to
// ~14 of these can render simultaneously in this static grid, where TrophyBadge is built to be the
// sole, one-at-a-time centerpiece of its own full-screen moment. A fresh, self-contained
// implementation rather than importing pieces from TrophyBadge.tsx directly: that component's
// constants are all sized for its own fixed 120px badge and wired straight into its Reanimated
// loops, so reusing it here would mean either paying for many concurrent animation loops or
// unpicking animation from layout in an already deeply-tuned file -- duplicating the small,
// well-understood shadow-overlay math is the safer trade. Locked cards deliberately keep their
// original plain dimmed-circle-plus-lock look, not this treatment -- there's nothing to show off
// yet, and the contrast between "dressed up" (earned) and "plain grey" (not yet) is itself useful
// information at a glance.
const EMBLEM_SIZE = 56;
// Matches TrophyBadge's own SHADOW_ANGLE_DEGREES/SHADOW_DARKEN_AMOUNT exactly, for a consistent
// look between the two surfaces -- see that file's own comment for the full derivation of the
// shadow-overlay formula this reuses (generalized here to an arbitrary container size instead of
// one fixed constant).
const EMBLEM_SHADOW_ANGLE_DEGREES = -20;
const EMBLEM_SHADOW_ANGLE_RADIANS = (EMBLEM_SHADOW_ANGLE_DEGREES * Math.PI) / 180;
const EMBLEM_SHADOW_DARKEN_AMOUNT = 9;

const getEmblemShadowOverlayStyle = (containerSize: number) => {
  const overlaySize = containerSize * 2.2;
  return {
    position: 'absolute' as const,
    width: overlaySize,
    height: overlaySize,
    top: '50%' as const,
    left: '50%' as const,
    marginTop: (overlaySize / 2) * (Math.cos(EMBLEM_SHADOW_ANGLE_RADIANS) - 1),
    marginLeft: -(overlaySize / 2) * (Math.sin(EMBLEM_SHADOW_ANGLE_RADIANS) + 1),
    transform: [{ rotate: `${EMBLEM_SHADOW_ANGLE_DEGREES}deg` }],
  };
};

const TrophyEmblem: React.FC<{
  icon: MaterialCommunityIconName;
  color: string;
  glowColor: string;
  accentColor: string;
  ribbonText: string;
}> = ({ icon, color, glowColor, accentColor, ribbonText }) => {
  const ringWidth = Math.max(2, Math.round(EMBLEM_SIZE * 0.06));
  const faceSize = EMBLEM_SIZE - ringWidth * 2;
  const haloSize = EMBLEM_SIZE * 1.6;
  // The ring is `accentColor`-filled (its own "circle border" role, see AchievementMeta.color's
  // own comment) and the icon glyph uses it too, per explicit follow-up direction -- matching
  // TrophyBadge's own identical treatment, so both surfaces agree on what `accent` means. Each
  // shape's own shadow tint is now darkened from its own real fill (accent for the ring, base for
  // the face) rather than always darkening a fixed white.
  const ringShadowColor = tinycolor(accentColor).darken(EMBLEM_SHADOW_DARKEN_AMOUNT).toHexString();
  const faceShadowColor = tinycolor(color).darken(EMBLEM_SHADOW_DARKEN_AMOUNT).toHexString();

  return (
    <View style={emblemStyles.wrap}>
      <View
        style={[
          emblemStyles.halo,
          { width: haloSize, height: haloSize, borderRadius: haloSize / 2, backgroundColor: glowColor },
        ]}
      />
      <View style={[emblemStyles.shadowWrap, { width: EMBLEM_SIZE, height: EMBLEM_SIZE, borderRadius: EMBLEM_SIZE / 2 }]}>
        <View style={[emblemStyles.ring, { width: EMBLEM_SIZE, height: EMBLEM_SIZE, borderRadius: EMBLEM_SIZE / 2, backgroundColor: accentColor }]}>
          <View style={[emblemStyles.shadowOverlay, getEmblemShadowOverlayStyle(EMBLEM_SIZE), { backgroundColor: ringShadowColor }]} />
          <View style={[emblemStyles.face, { width: faceSize, height: faceSize, borderRadius: faceSize / 2, backgroundColor: color }]}>
            <View style={[emblemStyles.shadowOverlay, getEmblemShadowOverlayStyle(faceSize), { backgroundColor: faceShadowColor }]} />
            <MaterialCommunityIcons name={icon} size={Math.round(faceSize * 0.5)} color={accentColor} />
          </View>
        </View>
      </View>

      <View style={emblemStyles.ribbonRow}>
        <View style={[emblemStyles.ribbonTailLeft, { borderRightColor: color }]} />
        <View style={[emblemStyles.ribbonClip, { backgroundColor: color }]}>
          <Text style={emblemStyles.ribbonText} numberOfLines={1}>{ribbonText}</Text>
        </View>
        <View style={[emblemStyles.ribbonTailRight, { borderLeftColor: color }]} />
      </View>
    </View>
  );
};

// Not theme-dependent -- every color here is explicitly passed in via TrophyEmblem's own props
// (matching TrophyBadge.tsx's own plain module-level StyleSheet.create, unaffected by app theme).
const emblemStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  halo: {
    position: 'absolute',
    top: -(EMBLEM_SIZE * 0.6) / 2,
    opacity: 0.3,
  },
  shadowWrap: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  face: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  shadowOverlay: {
    // width/height/top/left/margin/transform all come from getEmblemShadowOverlayStyle -- this
    // just needs to exist so the array-style merge below has something to spread onto.
  },
  ribbonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8,
  },
  ribbonClip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ribbonText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  ribbonTailLeft: {
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderRightWidth: 4,
    borderLeftWidth: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    marginRight: -1,
  },
  ribbonTailRight: {
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 4,
    borderRightWidth: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    marginLeft: -1,
  },
});

// "Put the task icons on the trophy tiles so at a glance you know which ones have them" -- a small
// row of task-colored icon chips, one per distinct task that's earned this kind (see
// achievements.ts's AchievementCardStatus.earners), most-recently-earned first. Renders nothing
// for a locked card (earners is always empty there) or a global kind (first-completion/perfect-day,
// which have no per-task earner to show). Capped at MAX_VISIBLE_EARNER_ICONS with a "+N" overflow
// chip, so a popular achievement across many tasks doesn't blow out the card's own compact size.
const MAX_VISIBLE_EARNER_ICONS = 4;

const EarnerIconRow: React.FC<{ earners: AchievementEarner[]; styles: ReturnType<typeof createStyles> }> = ({ earners, styles }) => {
  if (earners.length === 0) return null;
  const visible = earners.slice(0, MAX_VISIBLE_EARNER_ICONS);
  const overflow = earners.length - visible.length;

  return (
    <View style={styles.earnerRow}>
      {visible.map(earner => (
        <View key={earner.taskId} style={[styles.earnerIcon, { backgroundColor: earner.taskColor ?? LOCKED_COLOR }]}>
          {earner.taskIcon && <MaterialCommunityIcons name={earner.taskIcon} size={10} color="#fff" />}
        </View>
      ))}
      {overflow > 0 && (
        <View style={[styles.earnerIcon, styles.earnerOverflow]}>
          <Text style={styles.earnerOverflowText}>+{overflow}</Text>
        </View>
      )}
    </View>
  );
};
// ============================================================================================

// Builds a fake, throwaway Achievement so a *locked* card can preview its celebration on tap, the
// same way an unlocked card replays its real one. Restored (2026-08-12) after being removed and
// then explicitly asked back in as a permanent feature -- then, per direct user direction
// (2026-08-13), scoped to dev builds only (see `canPreviewLocked`/`__DEV__` at this component's
// own call site) rather than shipping to real users, alongside the same day's notification-debug
// screen. Never written to real history either way: queueCelebration only appends to the ephemeral
// `pendingCelebrations` queue, never to `achievements` -- so this is safe to tap freely without
// polluting the Trophy Case's actual record. Uses whatever task context the card's own live
// progress calculation already found (the closest-to-earning task, if any); `taskIcon` is left
// undefined since AchievementCardStatus's progress data doesn't carry one -- DescriptionText
// already renders fine without it, just without the inline icon.
const buildPreviewAchievement = (status: AchievementCardStatus): Achievement => ({
  id: `preview-${status.kind}-${Date.now()}`,
  kind: status.kind,
  taskName: status.progress?.taskName,
  taskColor: status.progress?.taskColor,
  value: status.progress?.target,
  dedupScope: 'preview',
  earnedAt: new Date().toISOString(),
});

// One badge-style card per achievement *kind* (not per task+kind) -- a per-task grid would mean
// up to 12 x (active task count) cards, most of them locked/irrelevant to any one task. Showing
// one card per kind, unlocked the moment *any* task has earned it, keeps the Trophy Case a fixed,
// scannable size regardless of how many tasks exist.
const AchievementBadgeCard: React.FC<{
  status: AchievementCardStatus;
  cardWidth: number;
  styles: ReturnType<typeof createStyles>;
  onPlay: (achievement: Achievement) => void;
  isMuted: boolean;
  mutedIconColor: string;
}> = ({ status, cardWidth, styles, onPlay, isMuted, mutedIconColor }) => {
  const meta = ACHIEVEMENT_META[status.kind];
  const { unlocked, latest, earners, progress, opportunityAvailable, timesEarned } = status;
  // Kind-level color, not task-level -- per explicit user direction, an achievement's identity no
  // longer varies by which task earned it (see AchievementMeta.color's own comment in
  // achievements.ts for the full reasoning). A task's own color/name now only ever surfaces inside
  // the celebration screen's description text, never on this card.
  const progressFillColor = meta.color.base;
  const progressPct = progress ? Math.min(1, progress.current / progress.target) * 100 : 0;

  // Unlocked cards replay their real celebration; locked cards preview a synthetic one instead of
  // being a no-op -- but only in dev builds (`__DEV__`, a real RN/Metro global, false in a release
  // build). A real user tapping a locked card in production just gets nothing, matching this
  // screen's own original locked-card behavior before the preview feature existed.
  const canPreviewLocked = __DEV__;
  const isDisabled = !unlocked && !canPreviewLocked;

  const handlePlay = () => {
    if (isDisabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPlay(unlocked && latest ? latest : buildPreviewAchievement(status));
  };

  return (
    <TouchableOpacity
      style={[styles.card, { width: cardWidth }]}
      onPress={handlePlay}
      disabled={isDisabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      accessibilityLabel={
        unlocked ? `Replay ${meta.title} celebration`
          : canPreviewLocked ? `Preview ${meta.title} celebration`
            : `${meta.title}, locked`
      }
    >
      <View style={styles.badgeWrap}>
        {unlocked ? (
          <TrophyEmblem
            icon={meta.icon}
            color={meta.color.base}
            glowColor={meta.color.glow}
            accentColor={meta.color.accent}
            ribbonText={getRibbonText(latest!)}
          />
        ) : (
          <View style={[styles.badgeCircle, { backgroundColor: LOCKED_COLOR, opacity: 0.35 }]}>
            <MaterialCommunityIcons name={meta.icon} size={30} color="#fff" />
          </View>
        )}
        {!unlocked && (
          <View style={styles.lockBadge}>
            <MaterialCommunityIcons name="lock" size={12} color="#fff" />
          </View>
        )}
        {unlocked && timesEarned > 1 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{timesEarned}×</Text>
          </View>
        )}
      </View>

      <Text style={[styles.cardTitle, !unlocked && styles.cardTitleLocked]} numberOfLines={2}>
        {meta.title}
      </Text>

      <EarnerIconRow earners={earners} styles={styles} />

      {unlocked ? (
        <View style={styles.captionRow}>
          <Text style={styles.cardCaption} numberOfLines={1}>
            {format(parseISO(latest!.earnedAt), 'MMM d, yyyy')}
          </Text>
          {/* A snoozed (muted, via the celebration screen's own bell toggle) kind still shows
              here exactly as unlocked as it always would -- this is purely an at-a-glance note
              that future unlocks of it will show a quick alert instead of the full
              congratulations, not a status that changes anything else about the card.
              Deliberately not interactive (no TouchableOpacity, no onPress of its own -- the
              whole card's own tap still replays/previews normally) and placed right beside the
              date it's a footnote to, rather than as a separate corner badge competing with
              `countBadge`/`lockBadge` for attention. */}
          {isMuted && (
            <MaterialCommunityIcons
              name="bell-off-outline"
              size={11}
              color={mutedIconColor}
              importantForAccessibility="no"
            />
          )}
        </View>
      ) : progress ? (
        <View style={styles.progressBlock}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: progressFillColor }]} />
          </View>
          <Text style={styles.cardCaption} numberOfLines={1}>
            {progress.current}/{progress.target}
            {progress.taskName ? ` · ${progress.taskName}` : ''}
          </Text>
        </View>
      ) : opportunityAvailable ? (
        <Text style={[styles.cardCaption, styles.cardCaptionReady]} numberOfLines={2}>
          Ready — revive a lapsed streak
        </Text>
      ) : null}
    </TouchableOpacity>
  );
};

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
// never-persisted achievement via buildPreviewAchievement above.
export const TrophiesScreen: React.FC = () => {
  const router = useRouter();
  const achievements = useAchievementsStore(state => state.achievements);
  const queueCelebration = useAchievementsStore(state => state.queueCelebration);
  const mutedKinds = useAchievementsStore(state => state.mutedKinds);
  const tasks = useTaskStore(state => state.tasks);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const activeTasks = useMemo(() => tasks.filter(t => !t.archived), [tasks]);
  const groups = useMemo(
    () => getGroupedAchievementCardStatuses(achievements, activeTasks),
    [achievements, activeTasks]
  );

  const columnCount = getColumnCount(width);
  const availableWidth = width - SIDE_PADDING * 2 - GRID_SPACING * (columnCount - 1);
  const cardWidth = Math.floor(availableWidth / columnCount);

  const totalCount = groups.reduce((sum, g) => sum + g.statuses.length, 0);
  const unlockedCount = groups.find(g => g.group === 'unlocked')?.statuses.length ?? 0;
  const listItems = useMemo(() => buildListItems(groups, columnCount), [groups, columnCount]);

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
        <View style={styles.headerButton} />
      </View>

      <FlatList
        data={listItems}
        key={columnCount}
        keyExtractor={item => item.key}
        contentContainerStyle={[styles.listContent, { paddingBottom: 16 + insets.bottom }]}
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <View style={styles.sectionHeaderRow}>
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
                  styles={styles}
                  onPlay={queueCelebration}
                  isMuted={mutedKinds.includes(status.kind)}
                  mutedIconColor={colors.textSecondary}
                />
              ))}
            </View>
          )
        }
      />
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
  listContent: {
    padding: SIDE_PADDING,
    gap: GRID_SPACING,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
    gap: GRID_SPACING,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    position: 'relative',
  },
  // No fixed width/height (unlike the old flat badge, which was always a plain EMBLEM_SIZE
  // square) -- TrophyEmblem's own halo/ribbon extend past its nominal EMBLEM_SIZE footprint, so
  // this just centers whatever's inside it (the dressed-up emblem, or the plain locked circle)
  // and reserves enough height that a locked card's simpler badge still lines up reasonably with
  // an unlocked neighbor's taller one.
  badgeWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: EMBLEM_SIZE,
    position: 'relative',
  },
  badgeCircle: {
    width: EMBLEM_SIZE,
    height: EMBLEM_SIZE,
    borderRadius: EMBLEM_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  lockBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: LOCKED_COLOR,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Small pill tag in the emblem's upper-right corner, shown when an unlocked kind has been
  // earned more than once (e.g. by two different tasks, or the same repeatable kind re-crossed).
  // A distinct little "how many times" indicator, separate from the (now always-shown) unlock
  // date caption below the card, rather than the two competing for the same line of text.
  // Deliberately a fixed, theme-independent near-black fill rather than the achievement's own
  // `meta.color.base` -- the 15 kinds' base colors span everything from pale cream (Gold) to deep
  // violet (Magic Fire), so no single text color would stay legible against all of them; a solid
  // dark chip with white text guarantees the same reliable contrast over every emblem color theme,
  // the same "always solid/dark regardless of context" approach ToastBanner/OnboardingHint's own
  // bubble already use elsewhere in this app for exactly this reason.
  countBadge: {
    position: 'absolute',
    top: -2,
    right: -6,
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: '#1C1C1E',
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginTop: 4,
  },
  cardTitleLocked: {
    color: colors.textSecondary,
  },
  cardCaption: {
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  // Holds the unlock date plus, when applicable, the small snoozed (muted) indicator right beside
  // it -- centered as one unit so a card without the indicator doesn't leave a lopsided gap.
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  cardCaptionReady: {
    color: '#FFA726',
    fontWeight: '600',
  },
  progressBlock: {
    width: '100%',
    alignItems: 'center',
    gap: 4,
  },
  progressTrack: {
    width: '100%',
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  earnerRow: {
    flexDirection: 'row',
    gap: 4,
  },
  earnerIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earnerOverflow: {
    backgroundColor: colors.surfaceSecondary,
  },
  earnerOverflowText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textSecondary,
  },
});
