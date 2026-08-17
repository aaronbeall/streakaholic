import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { format, parseISO } from 'date-fns';
import * as Haptics from 'expo-haptics';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import tinycolor from 'tinycolor2';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { MaterialCommunityIconName } from '../types';
import {
  Achievement,
  ACHIEVEMENT_META,
  AchievementCardStatus,
  AchievementEarner,
  getRibbonText,
} from '../utils/achievements';

// Shared "dressed up" achievement card + its emblem, extracted (2026-08-13) from TrophiesScreen so
// the Stats screens' own compact AchievementsPreviewCard can render kinds identically to their
// counterparts in the actual Trophy Case, rather than a separate, cheaper-looking treatment that
// would visually disagree with it. Everything here is self-contained (its own StyleSheet, no
// dependency on a parent screen's own `createStyles`) specifically so it can be dropped into either
// context unmodified.

const LOCKED_COLOR = '#8e8e93';

// ============================================================================================
// A static, size-fixed "dressed up" emblem for unlocked cards, per explicit user direction ("dress
// up the trophy screen emblem a bit per the color scheme, halo, banner, and shadow effect we use on
// the congratulation screen"). Reuses the same visual language as AchievementCelebration's own
// TrophyBadge (a halo glow, a white ring around a colored face with flat diagonal-shadow shading, a
// ribbon banner) but with none of its animation machinery -- several of these can render
// simultaneously in a static grid/row, where TrophyBadge is built to be the sole, one-at-a-time
// centerpiece of its own full-screen moment. A fresh, self-contained implementation rather than
// importing pieces from TrophyBadge.tsx directly: that component's constants are all sized for its
// own fixed 120px badge and wired straight into its Reanimated loops, so reusing it here would mean
// either paying for many concurrent animation loops or unpicking animation from layout in an
// already deeply-tuned file -- duplicating the small, well-understood shadow-overlay math is the
// safer trade. Locked cards deliberately keep their original plain dimmed-circle-plus-lock look,
// not this treatment -- there's nothing to show off yet, and the contrast between "dressed up"
// (earned) and "plain grey" (not yet) is itself useful information at a glance.
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

export const TrophyEmblem: React.FC<{
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
// achievements.ts's AchievementCardStatus.earners), most-recently-earned first. Renders nothing for
// a locked card (earners is always empty there) or a global kind (first-completion/perfect-day,
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

// Builds a fake, throwaway Achievement for a locked Trophy Case card. Ordinary taps use the
// purpose-built subdued preview; a dev-only long press can request the full congratulations view
// for visual testing. Neither mode is persisted -- queueCelebration only touches the ephemeral UI
// queue. The progress snapshot comes from the status already computed for this card.
const buildPreviewAchievement = (
  status: AchievementCardStatus,
  mode: 'locked-preview' | 'dev-preview' = 'locked-preview'
): Achievement => {
  const meta = ACHIEVEMENT_META[status.kind];
  return {
    id: `preview-${status.kind}-${Date.now()}`,
    kind: status.kind,
    taskName: status.progress?.taskName,
    taskColor: status.progress?.taskColor,
    value: meta.lockedPreviewValue ?? status.progress?.target,
    previewProgress: status.progress
      ? { current: status.progress.current, target: status.progress.target }
      : undefined,
    dedupScope: mode,
    earnedAt: new Date().toISOString(),
  };
};

interface AchievementBadgeCardProps {
  status: AchievementCardStatus;
  // Explicit pixel width (Trophy Case's own fixed-column grid) or omitted entirely, in which case
  // the card takes `flex: 1` instead -- lets a caller like AchievementsPreviewCard drop a handful
  // of these into a row and have them evenly divide whatever width is actually available, without
  // needing to measure it first.
  cardWidth?: number;
  onPlay: (achievement: Achievement) => void;
  isMuted: boolean;
  mutedIconColor: string;
  // Set once the surrounding grid/row is already scoped to a single task -- at that point every
  // card's own earner icon(s)/progress task-name would just repeat the one task already implied by
  // context, so both are suppressed rather than showing the same name/icon redundantly.
  hideTaskAttribution: boolean;
}

// One badge-style card per achievement *kind* (not per task+kind) -- a per-task grid would mean up
// to N x (active task count) cards, most of them locked/irrelevant to any one task. Showing one
// card per kind, unlocked the moment *any* task has earned it, keeps a grid of these a fixed,
// scannable size regardless of how many tasks exist.
//
// React.memo'd (2026-08-13, performance review) -- every prop here is already referentially stable
// across a re-render that doesn't actually concern this card (`status` objects are reused as-is by
// AchievementsPreviewCard/TrophiesScreen's own memoized `groups`; `onPlay` is a stable Zustand
// action; the rest are primitives) -- but without memoizing the component itself, React still
// re-executes its full body (including TrophyEmblem's own `tinycolor(...).darken(...)` calls) on
// every parent re-render regardless. This matters in practice: TaskStatsView's `onScroll` handler
// (driving LazyMount's own visibility tracking) re-renders the whole screen on every scroll tick,
// which previously re-rendered every visible achievement card along with it for no reason.
export const AchievementBadgeCard: React.FC<AchievementBadgeCardProps> = React.memo(({
  status,
  cardWidth,
  onPlay,
  isMuted,
  mutedIconColor,
  hideTaskAttribution,
}) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const meta = ACHIEVEMENT_META[status.kind];
  const { unlocked, latest, earners, progress, opportunityAvailable, timesEarned } = status;
  // Kind-level color, not task-level -- per explicit user direction, an achievement's identity no
  // longer varies by which task earned it (see AchievementMeta.color's own comment in
  // achievements.ts for the full reasoning). A task's own color/name only ever surfaces inside the
  // celebration screen's description text, never on this card.
  const progressFillColor = meta.color.base;
  const progressPct = progress ? Math.min(1, progress.current / progress.target) * 100 : 0;

  const handlePlay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPlay(unlocked && latest ? latest : buildPreviewAchievement(status));
  };

  const handleDevFullPreview = () => {
    if (!__DEV__ || unlocked) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPlay(buildPreviewAchievement(status, 'dev-preview'));
  };

  return (
    <View style={cardWidth === undefined ? styles.cardFlexWrap : undefined}>
      <TouchableOpacity
        style={[styles.card, cardWidth !== undefined && { width: cardWidth }]}
        onPress={handlePlay}
        onLongPress={__DEV__ && !unlocked ? handleDevFullPreview : undefined}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={
          unlocked ? `Replay ${meta.title} celebration`
            : `Preview locked achievement ${meta.title}`
        }
        accessibilityHint={__DEV__ && !unlocked ? 'Long press to test the full congratulations view' : undefined}
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

        {!hideTaskAttribution && <EarnerIconRow earners={earners} styles={styles} />}

        {unlocked ? (
          <View style={styles.captionRow}>
            <Text style={styles.cardCaption} numberOfLines={1}>
              {format(parseISO(latest!.earnedAt), 'MMM d, yyyy')}
            </Text>
            {/* A snoozed (muted, via the celebration screen's own bell toggle) kind still shows
                here exactly as unlocked as it always would -- this is purely an at-a-glance note
                that future unlocks of it will show a quick alert instead of the full
                celebration, not a status that changes anything else about the card.
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
              {progress.taskName && !hideTaskAttribution ? ` · ${progress.taskName}` : ''}
            </Text>
          </View>
        ) : opportunityAvailable ? (
          <Text style={[styles.cardCaption, styles.cardCaptionReady]} numberOfLines={2}>
            Ready — revive a lapsed streak
          </Text>
        ) : null}
      </TouchableOpacity>
    </View>
  );
});
AchievementBadgeCard.displayName = 'AchievementBadgeCard';

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  cardFlexWrap: {
    flex: 1,
  },
  // No card chrome -- the dressed-up emblem (its own halo/ring/shadow/ribbon) already reads as a
  // self-contained object; a bordered rectangle around it on top of that was redundant weight,
  // matching this app's own established "no card chrome" bias elsewhere (e.g. TaskStatsView's
  // stat blocks) rather than every screen defaulting to a stack of boxes. Grid/row spacing (Trophy
  // Case's own `row`/`listContent` gap, AchievementsPreviewCard's `cardRow` gap) carries the
  // separation between cards instead of an individual border per card.
  card: {
    paddingVertical: 8,
    alignItems: 'center',
    gap: 6,
    position: 'relative',
  },
  // No fixed width/height (unlike a plain flat badge, which would always be a fixed EMBLEM_SIZE
  // square) -- TrophyEmblem's own halo/ribbon extend past its nominal EMBLEM_SIZE footprint, so
  // this just centers whatever's inside it (the dressed-up emblem, or the plain locked circle) and
  // reserves enough height that a locked card's simpler badge still lines up reasonably with an
  // unlocked neighbor's taller one.
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
  // Small pill tag in the emblem's upper-right corner, shown when an unlocked kind has been earned
  // more than once (e.g. by two different tasks, or the same repeatable kind re-crossed). A
  // distinct little "how many times" indicator, separate from the (now always-shown) unlock date
  // caption below the card, rather than the two competing for the same line of text. Deliberately a
  // fixed, theme-independent near-black fill rather than the achievement's own `meta.color.base` --
  // the many kinds' base colors span everything from pale cream (Gold) to deep violet (Magic Fire),
  // so no single text color would stay legible against all of them; a solid dark chip with white
  // text guarantees the same reliable contrast over every emblem color theme, the same "always
  // solid/dark regardless of context" approach ToastBanner/OnboardingHint's own bubble already use
  // elsewhere in this app for exactly this reason.
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
