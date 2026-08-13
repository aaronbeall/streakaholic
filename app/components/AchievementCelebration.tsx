import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Confetti } from '../components/Confetti';
import { TROPHY_BADGE_STACK_SIZE, TrophyBadge } from '../components/TrophyBadge';
import { useAchievementsStore } from '../stores/achievementsStore';
import { useSettingsStore } from '../stores/settingsStore';
import { MaterialCommunityIconName } from '../types';
import { ACHIEVEMENT_META, Achievement, AchievementKind, getRibbonText } from '../utils/achievements';

// Sequential reveal timeline (all delays measured from mount) -- widened considerably per explicit
// user direction ("much more spaced out... give a lot more emphasis to each") from an earlier,
// much snappier first pass. JS setTimeouts still drive *when* each piece reveals (not Reanimated's
// own animation-finished callbacks -- see TaskCard's completion-pop history in CLAUDE.md for why
// those aren't trusted for real control flow on Android); only the *reveal itself* is animated.
//
// No auto-dismiss timer -- this screen stays up until the user dismisses it (see handleDismiss).
// A real "stinger" (a short sting that plays and vanishes on its own) is the wrong model for what
// this is: a moment worth letting the user actually sit with, on their own schedule, not something
// timed out from under them -- which is also why this component (and file) is named
// AchievementCelebration, not AchievementStinger.
//
// Dismissal used to be "tap anywhere on screen" (the whole thing was one big Pressable), until the
// unlock history list's own scrolling turned out to permanently conflict with that -- three
// separate attempts to fix the touch/scroll negotiation directly (a raw responder View wrapper, a
// react-native-gesture-handler ScrollView swap) never actually got scrolling working, per direct,
// repeated on-device reports. Per explicit user direction ("Maybe we need to ditch the press
// anywhere behavior and instead add an explicit close button"), dismissal is now two concrete,
// unambiguous actions instead: an explicit close (X) button in the top-right corner (see
// `closeButton` below), and the Android hardware/gesture back button (see the BackHandler effect
// below) -- both call the same `handleDismiss`. Nothing in `content` needs to claim or swallow
// touches anymore, which is also what let UnlockHistoryList's own touch-negotiation workarounds be
// removed entirely (see that component's own comment).
const EMBLEM_DELAY = 200;
const TITLE_DELAY = 1600;
// Used only for kinds with no counter (comeback, via plainTitle) -- unchanged from the original
// fixed pacing, since there's no count-up to wait on there.
const DESCRIPTION_DELAY_NO_COUNTER = 2900;
// A short settle beat after a counter-driven title's count-up actually finishes, before the
// description reveals -- see getCountUpDuration below for why "actually finishes" is now a
// per-achievement value rather than a fixed constant.
const DESCRIPTION_PAUSE_AFTER_COUNT = 300;
const HINT_PAUSE_AFTER_CONTENT = 800;
const DISMISS_ANIM_DURATION = 220;

// A per-row height, deliberately generous enough to fit the two-line (task name + date) content
// with real breathing room -- used as an *explicit* `height` (not just a floor) on every element
// in the row, not an estimate left to content-driven sizing, per the redesign below. Drives the
// list's own height so it only ever takes up as much room as it actually needs -- one row for two
// unlocks, three rows for three, capped at HISTORY_MAX_VISIBLE_ROWS before it switches from
// "grows to fit" to "scrolls" (see the list's own `maxHeight` at its one call site).
const HISTORY_ROW_HEIGHT = 40;
const HISTORY_MAX_VISIBLE_ROWS = 4;
// A fixed pixel width, not a percentage -- see UnlockHistoryList's own comment for why. Comfortably
// fits within `content`'s own inner width (screen width minus 64px of horizontal padding) on any
// realistic Android phone (this app's actual target platform, generally >=360dp wide, giving
// >=296px of available space) without needing to resolve against an ancestor chain of
// shrink-to-fit, `alignItems: 'center'` containers.
const HISTORY_LIST_WIDTH = 260;

// The count-up's own duration scales with the achieved value, per explicit user direction (1s at
// the low end up to a capped ceiling at the high end -- originally 5s, brought down to 3s per
// direct follow-up), rather than one fixed duration for every kind. A *log* scale, not linear --
// achievement values span orders of magnitude (a streak-2's own value of 2 up to a
// streak-1000/milestone-1000's 1,000), and a linear map from that same [1, 1000] range would put
// everything below ~100 within a few hundred ms of the 1s floor, making the scaling invisible for
// most kinds. Log-scaling means the animation's *pace* roughly tracks the number's own order of
// magnitude instead: quick for tens, noticeably longer for hundreds, the full ceiling for the
// app's largest tier. Clamped so a value at or above COUNT_DURATION_REF_VALUE (1,000 -- the
// largest fixed tier in the app) hits the ceiling rather than exceeding it.
const COUNT_DURATION_MIN = 1000;
const COUNT_DURATION_MAX = 3000;
const COUNT_DURATION_REF_VALUE = 1000;
const getCountUpDuration = (value: number): number => {
  const t = Math.min(1, Math.log10(Math.max(1, value)) / Math.log10(COUNT_DURATION_REF_VALUE));
  return COUNT_DURATION_MIN + t * (COUNT_DURATION_MAX - COUNT_DURATION_MIN);
};

// Counts up 0 -> value in plain JS (requestAnimationFrame + setState), not a Reanimated worklet
// bridged back to JS -- there's no cheaper way to animate a *text* value than re-rendering it, so
// there's nothing to gain from the UI thread here. `active` gates when the count-up actually
// starts (the title's slot is always mounted for layout stability -- see RevealSlot below -- so
// without this gate the count would finish silently in the background long before it's visible).
//
// Ease-in-*out* (not ease-out alone) per explicit user direction ("start slow, speed up, then slow
// down" -- the previous ease-out-cubic curve started at full speed and only decelerated).
// Standard cubic ease-in-out: the first half mirrors ease-in-cubic (slow start), the second half
// mirrors ease-out-cubic (slow finish), meeting at the midpoint where the count is moving fastest.
const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const useCountUp = (value: number, active: boolean, duration: number): number => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!active) return;
    if (value <= 1) {
      setDisplay(value);
      return;
    }
    let frame: number;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / duration);
      setDisplay(Math.round(value * easeInOutCubic(t)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, value, duration]);

  return display;
};

// A fixed-space slot whose *content* fades/slides in once `revealed` flips true, without ever
// changing the slot's own footprint -- the fix for "layout shifts every time a new element
// appears": every slot in CelebrationContent is mounted from frame one (reserving its layout space
// immediately), so revealing content inside one never pushes or re-centers anything else. Content
// fades in with a small upward drift rather than popping instantly.
const RevealSlot: React.FC<{ revealed: boolean; minHeight: number; style?: object; children: React.ReactNode }> = ({
  revealed,
  minHeight,
  style,
  children,
}) => {
  const reveal = useSharedValue(0);

  useEffect(() => {
    if (revealed) {
      reveal.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) });
    }
  }, [revealed, reveal]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: (1 - reveal.value) * 14 }],
  }));

  // `style` (alignItems/gap for a multi-child slot like momentBlock/metaBlock) has to land on
  // *this* view, not the outer one below -- it's the one actually holding the revealed children
  // as flex siblings. A previous version put `style` on the outer View instead, which only ever
  // wraps this single Reanimated.View, so alignItems/gap there was a no-op: the outer View's
  // alignItems centered the *block* as a whole, but did nothing for the children *inside* it, and
  // its gap had no second sibling to apply between. That's what caused multi-child slots (the
  // flavor/trigger pair, the divider/date/hint row) to render with no real gap and, for children
  // with no explicit width/textAlign of their own, default flex `stretch` left-alignment instead
  // of centering -- reported directly as text "running together" and looking left-aligned.
  return (
    <View style={{ minHeight, alignItems: 'center', justifyContent: 'center' }}>
      <Reanimated.View style={[style, animatedStyle]}>{children}</Reanimated.View>
    </View>
  );
};

// A single flowing paragraph combining both halves of the copy -- the technical trigger sentence
// (what condition was actually met, task woven in inline) followed by the whimsical flavor line
// -- per explicit user direction to merge what used to be two separately-spaced elements into one
// inline-wrapping, center-aligned block, technical first. Dispatches purely on whether *this
// achievement instance* has a taskName, not on its kind -- a per-task kind (meta.triggerSuffix
// set) leads with the task as the sentence's subject, rendered inline (icon + bold, task-colored
// name) via a nested Text (workable because MaterialCommunityIcons is itself a Text-based
// component under the hood -- a single glyph from an icon font -- so nesting it inside a parent
// Text behaves like any other inline styled span); a global kind with no task (meta.triggerStandalone
// set instead) gets its own complete, task-less sentence. This means a future taskless kind works
// correctly here with zero changes, as long as its metadata sets triggerStandalone.
//
// `taskColor` is the *task's own* color (falling back to the kind's own color for a global
// achievement with no task at all), deliberately distinct from the kind-driven color everything
// else on this screen (badge/rings/confetti/hero number) now uses -- per explicit user direction,
// a task's own brand is meant to surface only here, inside the inline task name/icon, not as the
// achievement's overall identity.
const DescriptionText: React.FC<{ achievement: Achievement; taskColor: string }> = ({ achievement, taskColor }) => {
  const meta = ACHIEVEMENT_META[achievement.kind];
  const flavor = meta.flavorText;

  if (achievement.taskName && meta.triggerSuffix) {
    const suffix = meta.triggerSuffix(achievement.value ?? 0);
    return (
      <Text style={styles.descriptionText}>
        {achievement.taskIcon && <MaterialCommunityIcons name={achievement.taskIcon} size={15} color={taskColor} />}
        <Text style={[styles.descriptionTaskName, { color: taskColor }]}> {achievement.taskName}</Text>
        {suffix} {flavor}
      </Text>
    );
  }

  const standalone = meta.triggerStandalone?.(achievement.value) ?? '';
  return (
    <Text style={styles.descriptionText}>
      {standalone} {flavor}
    </Text>
  );
};

// "A little scrollable list that shows the actual date and task of each unlock" -- per explicit
// user direction, supplements (not replaces -- see the always-shown "Unlocked {date}" label at
// this component's one call site) the celebrated instance's own date with the *full* history of
// every instance of this kind, across every task, most recent at top -- but only when there's
// more than one to show (the caller gates this entirely; see `showHistoryList` below). This is
// also the full answer to "which tasks have this trophy" -- reuses the celebration screen that
// already exists (both for a fresh unlock and for a Trophy Case replay tap) rather than a new
// browsing surface. A row for a taskless global instance (first-completion, or a perfect-day earn)
// falls back to the kind's own icon/color instead of a task's, since there's no task to attribute
// it to. `maxHeight` is sized by the caller to fit up to HISTORY_MAX_VISIBLE_ROWS rows exactly --
// letting the list shrink to fewer rows' worth of content rather than always reserving room for
// the full cap, only actually scrolling once there are more instances than that.
//
// Styled as a vertical timeline (per explicit user direction, "make it look a bit more like a
// timeline than a regular list") rather than plain divided rows: each entry is a small colored
// dot with a thin connecting line threading down to the next one (no line above the first dot or
// below the last), and the task name/date stack vertically beside it instead of sharing one row.
//
// **Rewritten from scratch (2026-08-12)** after two prior fixes both failed to resolve a real,
// reported-broken render ("its skinny, the first icon appears near the bottom and I can see no
// text... nor scrollable" -- and still broken after the first fix). Rather than keep guessing at
// a single cause, every dimension in this component is now *explicit* -- a fixed pixel `width`
// (`HISTORY_LIST_WIDTH`, not a `'100%'` percentage) and a fixed `height` on every element in a
// row (`HISTORY_ROW_HEIGHT`, not a `minHeight` left to content-driven sizing or cross-axis
// `stretch` inference). Two independent, previously-unconfirmed assumptions are eliminated by
// this, not just one: (a) whether a `width: '100%'` several levels deep in a chain of
// shrink-to-fit `alignItems: 'center'` containers (RevealSlot -> metaBlock -> this list) actually
// resolves against real screen width rather than something indeterminate, and (b) whether
// `historyTrack`'s two `flex: 1` connector segments reliably split a *stretched* (not explicitly
// sized) parent's height evenly. Neither is left to inference now -- every box in the row tree
// (the row itself, the track column, the content column) shares the exact same explicit
// `HISTORY_ROW_HEIGHT`, so the connector math has a known, fixed quantity to divide regardless of
// how Yoga would have resolved stretch/percentage sizing on its own.
//
// **Follow-up, same day: the rewrite above fixed rendering and tap-swallowing (confirmed directly
// -- "It looks great. It even doesn't close the view when tapping on the list") but scrolling
// itself still didn't work.** Two more rounds tried to fix the touch/scroll negotiation directly
// -- `onResponderTerminationRequest={() => true}` on a raw responder `View` wrapper, then
// switching `ScrollView` to `react-native-gesture-handler`'s own implementation for its more
// robust gesture arena -- and scrolling *still* didn't work either time. Per explicit user
// direction ("Maybe we need to ditch the press anywhere behavior and instead add an explicit
// close button"), the actual fix was to stop fighting the conflict and remove its source instead:
// the whole celebration screen no longer dismisses on an arbitrary tap (see CelebrationContent's
// own comment for the explicit close button/back-button handling that replaced it), so nothing
// upstream of this list is competing for its touches anymore. `ScrollView` is back to plain core
// `'react-native'` (the RNGH swap was solving a problem that no longer exists once there's no
// ancestor Pressable to negotiate against), and the raw responder `View` wrapper is gone
// entirely -- `historyList`'s own styling moved directly onto the `ScrollView` again, now with
// nothing else needed around it.
const UnlockHistoryList: React.FC<{
  kind: AchievementKind;
  allAchievements: Achievement[];
  kindIcon: MaterialCommunityIconName;
  kindColor: string;
  maxHeight: number;
}> = ({ kind, allAchievements, kindIcon, kindColor, maxHeight }) => {
  const instances = allAchievements
    .filter(a => a.kind === kind)
    .sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));

  if (instances.length <= 1) return null;

  return (
    <ScrollView style={[styles.historyList, { maxHeight }]} showsVerticalScrollIndicator={false}>
      {instances.map((a, index) => (
        <View key={a.id} style={styles.historyRow}>
          <View style={styles.historyTrack}>
            <View style={[styles.historyConnector, index === 0 && styles.historyConnectorHidden]} />
            <View style={[styles.historyDot, { backgroundColor: a.taskColor ?? kindColor }]}>
              <MaterialCommunityIcons name={a.taskIcon ?? kindIcon} size={9} color="#fff" />
            </View>
            <View style={[styles.historyConnector, index === instances.length - 1 && styles.historyConnectorHidden]} />
          </View>
          <View style={styles.historyContent}>
            <Text style={[styles.historyTaskName, { color: a.taskColor ?? kindColor }]} numberOfLines={1}>
              {a.taskName ?? 'Overall'}
            </Text>
            <Text style={styles.historyDate}>{format(parseISO(a.earnedAt), 'MMM d, yyyy')}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
};

const CelebrationContent: React.FC<{ achievement: Achievement; onDismiss: () => void }> = ({ achievement, onDismiss }) => {
  const insets = useSafeAreaInsets();
  const allAchievements = useAchievementsStore(state => state.achievements);
  const meta = ACHIEVEMENT_META[achievement.kind];
  // The achievement's own kind-level identity (badge/rings/confetti/hero number) -- no longer
  // task-driven, see AchievementMeta.color's own comment for the full reasoning. The task's own
  // color still surfaces, just narrowly, inside DescriptionText's inline task name/icon span.
  // `kindColor` (the base) drives the coin itself and the hero number/confetti; `kindGlowColor`
  // drives TrophyBadge's surrounding aura (halo/outer rings); `kindAccentColor` drives its small
  // sparkle-scale highlight detail (twinkles, innermost ring).
  const kindColor = meta.color.base;
  const kindGlowColor = meta.color.glow;
  const kindAccentColor = meta.color.accent;
  const numberBlock = meta.numberBlock;
  const showsNumber = !!numberBlock && achievement.value !== undefined;

  // The history list only ever renders when this kind has genuinely been earned more than once --
  // a single unlock has nothing to list beyond the "Unlocked {date}" label above it (see the
  // metaBlock RevealSlot below), matching the label's own original, pre-history-list wording.
  // `historyListHeight` grows to fit however many rows there are, capped at
  // HISTORY_MAX_VISIBLE_ROWS (see that constant's own comment) -- computed once here (stable for
  // this achievement's whole lifetime, same as `titleMinHeight` above) so RevealSlot's minHeight
  // never needs to change after mount.
  const kindInstanceCount = allAchievements.filter(a => a.kind === achievement.kind).length;
  const showHistoryList = kindInstanceCount > 1;
  const historyListHeight = showHistoryList
    ? Math.min(kindInstanceCount, HISTORY_MAX_VISIBLE_ROWS) * HISTORY_ROW_HEIGHT
    : 0;

  // Doubles as both the entrance fade-in (0 -> 1 on mount) and the tap-to-dismiss fade-out
  // (1 -> 0), rather than two separate shared values -- there's no state where both would need
  // to animate independently.
  const visibility = useSharedValue(0);

  const [showEmblem, setShowEmblem] = useState(false);
  const [showTitle, setShowTitle] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const countDuration = showsNumber ? getCountUpDuration(achievement.value ?? 0) : 0;
  const count = useCountUp(achievement.value ?? 0, showTitle && showsNumber, countDuration);

  // The title slot's own minHeight used to be one fixed value shared by both variants -- tuned
  // against the taller numberBlock (eyebrow + huge number + unit caption), it left a comeback's
  // much shorter plainTitle (a single 30px line) sitting in a lot of unused reserved space, which
  // is what actually read as "too much space" per earlier feedback; shrinking that one shared
  // value to fix it then left numberBlock-based achievements visibly cramped instead. Sizing per
  // variant fixes both at once -- safe to do since the variant itself never changes mid-playback
  // (it's a constant for this achievement's whole lifetime, only the reveal *opacity* animates).
  const titleMinHeight = showsNumber ? 140 : 64;

  const handleDismiss = useCallback(() => {
    visibility.value = withTiming(0, { duration: DISMISS_ANIM_DURATION, easing: Easing.in(Easing.cubic) });
    setTimeout(onDismiss, DISMISS_ANIM_DURATION);
  }, [onDismiss, visibility]);

  // Android hardware/gesture back button dismisses the celebration instead of navigating
  // backward in the router stack -- per explicit user direction. `hardwareBackPress` handlers
  // return `true` to mark the event as handled (preventing the default back navigation) or
  // `false` to let it fall through to whatever would normally handle it; returning `true`
  // unconditionally here is correct since this screen, while showing, should always intercept
  // back rather than ever letting it navigate underneath itself. A no-op on iOS/web (no hardware
  // back button there), so no platform guard is needed.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleDismiss();
      return true;
    });
    return () => subscription.remove();
  }, [handleDismiss]);

  useEffect(() => {
    visibility.value = withTiming(1, { duration: 250 });

    // For a counter-driven title, wait for the count-up to actually finish (its duration now
    // varies per achievement, up to 5s -- see getCountUpDuration) before revealing the
    // description, so it can't pop in while a big number is still visibly climbing above it.
    // Kinds with no counter (comeback) keep the original fixed pacing -- there's nothing to wait
    // on there.
    const descriptionDelay = showsNumber
      ? TITLE_DELAY + countDuration + DESCRIPTION_PAUSE_AFTER_COUNT
      : DESCRIPTION_DELAY_NO_COUNTER;
    const hintDelay = descriptionDelay + HINT_PAUSE_AFTER_CONTENT;

    // No auto-dismiss timer here -- see the top-of-file note. The user dismisses via the close
    // button or the device back button (see handleDismiss's own call sites).
    const timers = [
      setTimeout(() => setShowEmblem(true), EMBLEM_DELAY),
      setTimeout(() => setShowTitle(true), TITLE_DELAY),
      setTimeout(() => setShowDescription(true), descriptionDelay),
      setTimeout(() => setShowHint(true), hintDelay),
    ];
    return () => timers.forEach(clearTimeout);
    // Deliberately mount-only -- this timeline belongs to this one achievement instance (the
    // parent remounts a fresh CelebrationContent per achievement via `key`), not something to
    // restart if props happen to change identity for unrelated reasons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: visibility.value,
    transform: [{ scale: 0.92 + visibility.value * 0.08 }],
  }));

  return (
    <Reanimated.View style={[styles.host, contentStyle]}>
      <View
        style={StyleSheet.absoluteFillObject}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${meta.title}. ${meta.describe(achievement)}`}
      >
        <View style={styles.tint} />

        {/* Explicit dismissal, replacing the earlier tap-anywhere Pressable -- see the top-of-file
            comment for why. Rendered early/unconditionally (not gated behind any reveal timer) so
            there's always a visible way out, even before the rest of the sequence has played. */}
        <Pressable
          onPress={handleDismiss}
          style={[styles.closeButton, { top: insets.top + 12 }]}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <MaterialCommunityIcons name="close" size={22} color="#fff" />
        </Pressable>

        {/* Top-anchored, not centered -- every slot below is always mounted (fixed minHeight)
            from the very first frame, so the *total* content height never changes as later
            slots reveal their content. A centered/justify-content:center layout would have
            re-centered (and visibly shifted) every already-revealed element each time a new one
            was added -- this is what that bug fix relies on. */}
        <View style={[styles.content, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.emblemSlot}>
            {showEmblem && (
              <TrophyBadge
                icon={meta.icon}
                color={kindColor}
                glowColor={kindGlowColor}
                accentColor={kindAccentColor}
                ribbonText={getRibbonText(achievement)}
              />
            )}
          </View>

          {/* Eyebrow / huge animated number / unit caption, stacked -- rather than one hyphenated
              sentence like the Trophy Case tiles use, this screen has room to let the number be
              the clear hero element (per explicit user direction). The number itself is
              kind-colored so it visually ties back to the badge/rings above it. */}
          <RevealSlot revealed={showTitle} minHeight={titleMinHeight}>
            {showsNumber ? (
              <View style={styles.numberBlock}>
                <Text style={styles.eyebrow}>{numberBlock!.eyebrow}</Text>
                {/* Base by default, matching the coin/ribbon it sits under -- most themes'
                    base color was actually preferred here (see meta.color.useAccentText's own
                    comment in achievements.ts). Only the handful of genuinely dark-based themes
                    (Gilded, Obsidian) opt into accent instead, since base would read as nearly
                    invisible against this screen's own dark backdrop for those specifically. */}
                <Text style={[styles.bigNumber, { color: meta.color.useAccentText ? kindAccentColor : kindColor }]}>
                  {count.toLocaleString()}
                </Text>
                <Text style={styles.unitCaption}>{numberBlock!.unit}</Text>
              </View>
            ) : (
              <Text style={styles.plainTitle}>{meta.title}</Text>
            )}
          </RevealSlot>

          {/* "The moment" -- one flowing paragraph: the plain fact of what actually triggered
              this (task woven in inline), followed by a lighthearted reaction (FLAVOR_TEXT) --
              merged into a single inline-wrapping element per explicit user direction, rather
              than two separately-spaced lines. */}
          <RevealSlot revealed={showDescription} minHeight={100} style={styles.descriptionBlock}>
            <DescriptionText achievement={achievement} taskColor={achievement.taskColor ?? kindColor} />
          </RevealSlot>

          {/* "The record" -- a thin rule marks the shift from the celebratory moment above to
              plain metadata below. For a single unlock, the original "Unlocked {date}" label for
              *this* specific celebrated instance (restored per explicit user direction -- an
              earlier pass had replaced it outright with a generic "Unlock History" caption once
              the scrollable list below was added, but the per-instance date is worth keeping when
              there's nothing further to show). Once this kind has genuinely been earned more than
              once (showHistoryList above), the label switches to "Unlock History" with an inline
              times-counter bubble instead -- a single date would be misleading once there's a
              whole list of them below, and the bubble gives an at-a-glance count without needing
              to actually scroll the list. This used to be followed by a "Tap anywhere to continue"
              hint anchored to the bottom of the screen -- removed along with the tap-anywhere
              dismiss behavior itself (see the top-of-file comment); the close button is now the
              only dismiss affordance, and it doesn't need a hint pointing at it. */}
          <RevealSlot revealed={showHint} minHeight={64 + historyListHeight} style={styles.metaBlock}>
            <View style={styles.metaDivider} />
            {showHistoryList ? (
              <View style={styles.unlockedHistoryHeader}>
                <Text style={styles.unlockedLabel}>Unlock History</Text>
                <View style={styles.unlockCountBadge}>
                  <Text style={styles.unlockCountBadgeText}>{kindInstanceCount}×</Text>
                </View>
              </View>
            ) : (
              // A locked card's preview replay (see TrophiesScreen.tsx's own
              // buildPreviewAchievement) has no real earnedAt to show -- it's a synthetic,
              // never-persisted Achievement built purely to demo the celebration, flagged by its
              // own dedupScope: 'preview'.
              <Text style={styles.unlockedLabel}>
                {achievement.dedupScope === 'preview' ? 'Locked' : `Unlocked ${format(parseISO(achievement.earnedAt), 'MMM d, yyyy')}`}
              </Text>
            )}
            {showHistoryList && (
              <UnlockHistoryList
                kind={achievement.kind}
                allAchievements={allAchievements}
                kindIcon={meta.icon}
                kindColor={kindColor}
                maxHeight={historyListHeight}
              />
            )}
          </RevealSlot>
        </View>

        {showEmblem && (
          <Confetti key={achievement.id} baseColor={kindColor} glowColor={kindGlowColor} accentColor={kindAccentColor} />
        )}
      </View>
    </Reanimated.View>
  );
};

// Mounted once at the app root (see _layout.tsx), a sibling of ToastBanner -- a full-screen
// cinematic takeover, so it naturally supersedes the bottom completion toast while it's showing
// (rather than needing to coordinate space with it, as the earlier compact banner version did).
export const AchievementCelebration: React.FC = () => {
  const pending = useAchievementsStore(state => state.pendingCelebrations[0]);
  const dismissCurrentCelebration = useAchievementsStore(state => state.dismissCurrentCelebration);
  const celebrationsEnabled = useSettingsStore(state => state.achievementCelebrationsEnabled);

  // Achievements are always recorded into history regardless of this setting (see
  // achievementsStore.ts) -- it only ever gates whether this screen appears. When it's off,
  // silently drain the queue instead of ever rendering, rather than backlogging popups for if it
  // gets re-enabled.
  useEffect(() => {
    if (pending && !celebrationsEnabled) {
      dismissCurrentCelebration();
    }
  }, [pending, celebrationsEnabled, dismissCurrentCelebration]);

  if (!pending || !celebrationsEnabled) return null;

  // Keying by id forces a fresh mount per achievement, replaying the whole reveal sequence for
  // each one rather than reusing a stale instance whose timers have already fired.
  return <CelebrationContent key={pending.id} achievement={pending} onDismiss={dismissCurrentCelebration} />;
};

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  // The screen's sole backdrop -- `BlurView` (expo-blur) was tried here too, but removed per
  // explicit user direction on performance grounds: it only genuinely blurs on iOS (not this
  // app's target platform); on Android it silently falls back to a flat translucent tint anyway
  // (confirmed directly in expo-blur's own source -- the real Android blur path exists but sits
  // behind an experimental, admittedly-perf-risky `experimentalBlurMethod` flag we never enabled),
  // so it was paying for a native view + composited layer to produce a result no better than this
  // plain color already gives on the one platform that matters.
  //
  // Near-black rather than true black, on purpose: a per-achievement accent color (`accentColor`
  // -- the badge/rings/hero number/confetti) is task-color-driven and therefore arbitrary, so a
  // more saturated backdrop color (an earlier navy pass) risked going muddy against a task whose
  // own color happened to be similar -- pure black sidesteps that entirely as a neutral canvas.
  // This value keeps that same safety (barely distinguishable from true black at this opacity)
  // while keeping a faint cool undertone, splitting the difference between "safe neutral" and
  // "some personality" per direct user request.
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 8, 16, 0.92)',
  },
  // Explicit dismiss affordance, top-right -- replaces the removed tap-anywhere Pressable (see
  // the top-of-file comment). `top` is set inline per-instance (insets.top + 12), since this
  // style object is static and can't read safe-area insets itself. A translucent circular
  // backdrop (not just a bare icon) so it stays legible regardless of what's directly behind it
  // (the badge/rings/confetti all pass through this same top-right region at various points).
  closeButton: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
    // Still wider than the individual gaps within each block (e.g. momentBlock's own 22) -- the
    // major sections (emblem, hero number, moment, record) need clearer air between them than
    // elements within the same idea do. Brought down from an earlier 28 per direct feedback that
    // the overall top-to-bottom rhythm read as too spaced out once every slot's minHeight was
    // also tightened to match its actual content (see each RevealSlot's own minHeight below).
    gap: 18,
  },
  emblemSlot: {
    width: TROPHY_BADGE_STACK_SIZE,
    height: TROPHY_BADGE_STACK_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberBlock: {
    alignItems: 'center',
    gap: 2,
  },
  eyebrow: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  bigNumber: {
    fontSize: 68,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  unitCaption: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  plainTitle: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
  },
  // Single-child now (DescriptionText renders one paragraph, not two separate elements) -- just
  // centers that paragraph within the slot. No gap needed since there's nothing left to space.
  descriptionBlock: {
    alignItems: 'center',
  },
  // One consistent weight for the whole merged paragraph (technical trigger sentence + flavor
  // line) -- previously these were two differently-weighted styles (a bolder flavor line, a
  // dimmer trigger line) since they were visually separate elements; merged into one inline flow
  // per explicit user direction, they read better as a single uniform voice. Sits between the old
  // two sizes (17/15) rather than favoring either.
  descriptionText: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 320,
  },
  descriptionTaskName: {
    fontWeight: '800',
  },
  // Now just the divider + unlock date -- the dismiss hint moved out to its own bottom-anchored
  // slot (see the `spacer` style and its call site) rather than trailing directly below this.
  metaBlock: {
    alignItems: 'center',
    gap: 10,
  },
  // A short, quiet rule -- not spanning the block's own text width, just a small deliberate mark
  // that the celebratory content above has ended and plain metadata starts here.
  metaDivider: {
    width: 40,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  // Same small-caps label language as `eyebrow`/`unitCaption` above (uppercase, letter-spaced) --
  // deliberately, so the date reads as a designed detail worth noticing rather than a throwaway
  // caption. Meaningfully more visible than the description's own body-text opacity would suggest
  // at this font size alone; the caps + letter-spacing are doing real legibility work here, not
  // just decoration.
  unlockedLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  // Wraps unlockedLabel + the times-counter bubble on one row, only used once showHistoryList is
  // true (a single unlock's label stays a bare, unwrapped Text -- see the JSX above).
  unlockedHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  // Same solid-dark/white-text language TrophiesScreen's own countBadge uses (deliberately
  // theme-independent, matching ToastBanner/OnboardingHint's bubble elsewhere in this app) -- an
  // ordinary inline pill here, not absolutely positioned, since it sits in a normal text row
  // rather than overlaying a card's corner.
  // A visible border, not just a dark fill -- the flat #1C1C1E background (matching
  // TrophiesScreen's own countBadge) has no separation from this screen's own near-black backdrop
  // without one, reading as nearly invisible ("black on black", per direct report). The border
  // gives it definition regardless of backdrop shade, without needing to reason about contrast
  // against any specific kind's own accent color (which spans everything from near-white to
  // near-black across the catalog, so tinting the fill itself isn't a reliably safe fix).
  unlockCountBadge: {
    minWidth: 22,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 6,
    backgroundColor: '#1C1C1E',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unlockCountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  // Fixed pixel `width` (HISTORY_LIST_WIDTH, not a percentage) -- see UnlockHistoryList's own
  // comment for why. Applied directly to the ScrollView itself (its `style` prop targets the
  // outer scroll container, `contentContainerStyle` the inner scrollable content -- this is the
  // former). `maxHeight` is merged in per-instance at the call site, not baked in here.
  // `overflow: 'hidden'` is a deliberate belt-and-suspenders safety net: `maxHeight` is what
  // should actually bound/clip the content, but this guarantees nothing can visibly spill past
  // this box's own edges even if that math is ever off.
  historyList: {
    width: HISTORY_LIST_WIDTH,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  // No more per-row divider border -- the timeline's own connecting line (historyConnector) is
  // what visually separates/threads consecutive entries together now. An explicit `height` (not a
  // `minHeight` left to content-driven sizing) -- see this file's own top-of-component comment for
  // why every element in this row now shares this exact same fixed number rather than relying on
  // Yoga's cross-axis `stretch` inference to propagate a content-derived height down to
  // historyTrack.
  historyRow: {
    flexDirection: 'row',
    height: HISTORY_ROW_HEIGHT,
  },
  // The dot-and-line column, to the left of each entry's content. Explicit `height` (matching the
  // row's own, not inferred via stretch) is what makes the two `flex: 1` connector segments below
  // split a *known* quantity evenly, rather than however Yoga happened to resolve an unstyled
  // cross-axis size. `alignItems: 'center'` centers both the connector segments and the dot on the
  // track's own horizontal center, so the line passes straight through the dot.
  historyTrack: {
    width: 24,
    height: HISTORY_ROW_HEIGHT,
    alignItems: 'center',
  },
  // Each row contributes one line segment above its own dot and one below -- `flex: 1` splits
  // historyTrack's now-explicit height evenly around the dot, so consecutive rows' segments meet
  // exactly at the shared boundary between them and read as one continuous thread rather than
  // separate dashes. Hidden (via historyConnectorHidden) for the very first row's top segment and
  // the very last row's bottom segment, since the timeline has nothing to connect to past either
  // end.
  historyConnector: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  historyConnectorHidden: {
    backgroundColor: 'transparent',
  },
  // Sized down slightly from the old historyIconWrap (20 -> 16) -- a timeline node reads better as
  // a compact marker than a full icon badge; the icon inside shrank to match (12 -> 9).
  historyDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Task name and date stack vertically beside the dot -- reads as a timeline "entry" (a title
  // with a timestamp under it) rather than a table row. Explicit `height` (matching the row's own)
  // for the same determinism reasoning as historyTrack above; `justifyContent: 'center'` then
  // centers the two-line stack within that known height.
  historyContent: {
    flex: 1,
    height: HISTORY_ROW_HEIGHT,
    justifyContent: 'center',
    paddingLeft: 8,
  },
  historyTaskName: {
    fontSize: 12,
    fontWeight: '700',
  },
  historyDate: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
});
