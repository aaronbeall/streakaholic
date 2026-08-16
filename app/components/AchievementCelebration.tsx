import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { format, parseISO } from 'date-fns';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  cancelAnimation,
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { RNSVGTSpan, Text as SvgText } from 'react-native-svg';
import { AchievementAlert } from '../components/AchievementAlert';
import { TrophyEmblem } from '../components/AchievementCard';
import { Confetti } from '../components/Confetti';
import { TROPHY_BADGE_INTRO_DURATION, TROPHY_BADGE_STACK_SIZE, TrophyBadge } from '../components/TrophyBadge';
import { useToast } from '../context/ToastContext';
import { useAchievementsStore } from '../stores/achievementsStore';
import { useSettingsStore } from '../stores/settingsStore';
import { MaterialCommunityIconName } from '../types';
import { formatAchievementCount, getAchievementCountUpDuration } from '../utils/achievementCountUp';
import { ACHIEVEMENT_META, Achievement, AchievementKind, getRibbonText } from '../utils/achievements';
import { getPendingAchievementPresentation, PendingAchievementPresentation as PendingAchievementPresentationModel } from '../utils/achievementCelebrations';
import {
  ACHIEVEMENT_REVEAL_TIMING,
  getAchievementRevealProgress,
  getAchievementRevealSchedule,
} from '../utils/achievementRevealTimeline';

// Sequential reveal timeline (all delays measured from the current focus's timeline start) -- widened considerably per explicit
// user direction ("much more spaced out... give a lot more emphasis to each") from an earlier,
// much snappier first pass. One linear Reanimated elapsed-time value now drives every reveal phase
// and the counter directly on the UI thread. JavaScript only swaps the focused achievement and
// starts that clock once; there are no mid-sequence timers, phase state changes, or React commits.
//
// No auto-dismiss timer -- this screen stays up until the user dismisses it.
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
// unambiguous actions instead: a stable next/close button in the top-right corner (see
// `CelebrationBatch`), and the Android hardware/gesture back button. Nothing in `content` needs to
// claim or swallow touches anymore, which is also what let UnlockHistoryList's own
// touch-negotiation workarounds be removed entirely (see that component's own comment).
const EMBLEM_DELAY = ACHIEVEMENT_REVEAL_TIMING.initialEmblemDelay;
const DISMISS_ANIM_DURATION = 220;
const BATCH_DOCK_REVEAL_DELAY = EMBLEM_DELAY + TROPHY_BADGE_INTRO_DURATION;
const BATCH_DOCK_ITEM_WIDTH = 88;
const BATCH_DOCK_ITEM_HEIGHT = 68;
const BATCH_DOCK_ITEM_SPACING = 70;
const BATCH_DOCK_TRAIL_SPACING = 48;
const BATCH_DOCK_CENTER_CLEARANCE = 50;
const BATCH_DOCK_TRACK_TOP = 142;
const BATCH_DOCK_TRACK_HEIGHT = 90;
const BATCH_DOCK_NAV_TOP = 232;
const BATCH_DOCK_SPRING = { damping: 18, stiffness: 175, mass: 0.72 };
const BATCH_DOCK_DROP_HEIGHT = 28;
const BATCH_DOCK_DROP_DURATION = 360;
const BATCH_DOCK_DROP_STAGGER = 115;

// A per-row height, deliberately generous enough to fit the two-line (task name + date) content
// with real breathing room -- used as an *explicit* `height` (not just a floor) on every element
// in the row, not an estimate left to content-driven sizing, per the redesign below. Drives the
// list's own height so it only ever takes up as much room as it actually needs -- one row for two
// unlocks, three rows for three, capped at HISTORY_MAX_VISIBLE_ROWS before it switches from
// "grows to fit" to "scrolls" (see the list's own `maxHeight` at its one call site). Bumped back
// up (32->36, 3->4 -- both had been tightened during an earlier layout-fit compaction pass, see
// this file's own bottom-safe-area follow-up in CLAUDE.md) per direct on-device feedback that the
// list read as too small; the mute link's own footprint (below) moving out of this screen's
// vertical stack entirely, into a fixed corner button instead, freed up the room to do this
// without reopening that same overflow risk.
const HISTORY_ROW_HEIGHT = 36;
const HISTORY_MAX_VISIBLE_ROWS = 4;
// A fixed pixel width, not a percentage -- see UnlockHistoryList's own comment for why. Comfortably
// fits within `content`'s own inner width (screen width minus 64px of horizontal padding) on any
// realistic Android phone (this app's actual target platform, generally >=360dp wide, giving
// >=296px of available space) without needing to resolve against an ancestor chain of
// shrink-to-fit, `alignItems: 'center'` containers.
const HISTORY_LIST_WIDTH = 260;

type NativeSvgTextAnimatedProps = { content?: string };
const AnimatedSvgTSpan = Reanimated.createAnimatedComponent(RNSVGTSpan);

// Reanimated updates an SVG text span's native `content` prop directly on the UI thread. The
// displayed value is derived from the celebration's one elapsed-time clock, so it neither
// rerenders CelebrationContent nor installs a second independently-started timing animation. This
// deliberately uses a display-only SVG node rather than an
// Android EditText: native input controls maintain selection, scrolling, and editable line-box
// state even when marked non-editable, which made rapidly replaced centered text drift or clip.
// SVG recomputes and center-anchors each new glyph run inside the same fixed viewport instead.
const AchievementCount: React.FC<{
  value: number;
  duration: number;
  color: string;
  timeline: SharedValue<number>;
  startTime: number;
}> = React.memo(({ value, duration, color, timeline, startTime }) => {
  const animatedProps = useAnimatedProps<NativeSvgTextAnimatedProps>(() => {
    const linearProgress = getAchievementRevealProgress(timeline.value, startTime, duration);
    const progress = Easing.inOut(Easing.cubic)(linearProgress);
    const count = value <= 1
      ? (timeline.value >= startTime ? Math.max(0, value) : 0)
      : value * progress;
    return { content: formatAchievementCount(count) };
  });

  return (
    <Svg
      width={260}
      height={76}
      viewBox="0 0 260 76"
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no"
    >
      <SvgText x={130} y={59} textAnchor="middle" fill={color} fontSize={58} fontWeight="900">
        <AnimatedSvgTSpan animatedProps={animatedProps} content="0" />
      </SvgText>
    </Svg>
  );
});

AchievementCount.displayName = 'AchievementCount';

// A fixed-space slot whose *content* fades/slides in once `revealed` flips true, without ever
// changing the slot's own footprint -- the fix for "layout shifts every time a new element
// appears": every slot in CelebrationContent is mounted from frame one (reserving its layout space
// immediately), so revealing content inside one never pushes or re-centers anything else. Content
// fades in with a small upward drift rather than popping instantly.
const RevealSlot: React.FC<{
  timeline: SharedValue<number>;
  startTime: number;
  minHeight: number;
  style?: object;
  children: React.ReactNode;
}> = ({
  timeline,
  startTime,
  minHeight,
  style,
  children,
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    const linearProgress = getAchievementRevealProgress(
      timeline.value,
      startTime,
      ACHIEVEMENT_REVEAL_TIMING.revealDuration
    );
    const reveal = Easing.out(Easing.cubic)(linearProgress);
    return {
      opacity: reveal,
      transform: [{ translateY: (1 - reveal) * 14 }],
    };
  });

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
// Wrapped in React.memo (2026-08-13, a performance-review finding) -- `achievement` is a stable
// reference here (passed down unchanged from CelebrationContent's own props, which only change
// when the pending achievement itself does) and `taskColor` is a primitive string, so this stops
// needless work during CelebrationContent's staged reveal-state updates. The count-up itself now
// stays on the UI thread and no longer rerenders this parent.
const DescriptionText: React.FC<{ achievement: Achievement; taskColor: string }> = React.memo(({ achievement, taskColor }) => {
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
});
DescriptionText.displayName = 'DescriptionText';

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
// Wrapped in React.memo (2026-08-13, a performance-review finding) -- `allAchievements` is a
// stable store reference here (only changes when an achievement is actually earned, unrelated to
// CelebrationContent's staged reveal updates) and every other prop is a primitive, so this avoids
// needlessly re-filtering/re-sorting/re-rendering the list as the presentation unfolds.
const UnlockHistoryList: React.FC<{
  instances: Achievement[];
  kindIcon: MaterialCommunityIconName;
  kindColor: string;
  maxHeight: number;
}> = React.memo(({ instances, kindIcon, kindColor, maxHeight }) => {
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
            {/* A global (taskless) instance has no task name to show -- previously fell back to a
                generic "Overall" label, which said nothing an achievement's own icon/title didn't
                already convey. Per explicit user direction, shows that instance's own count stat
                instead when the kind actually has one (a "count"-ribbon kind, e.g. "7 DAYS"/"1,000
                DONE" via getRibbonText -- the exact same formatting TrophyBadge's own ribbon banner
                uses, so this line and that banner never disagree), or nothing at all for a
                "fixed"-ribbon kind (first-completion, perfect-day, early-bird, night-owl) whose
                ribbon text is a fixed word, not a real count -- just the date remains, centered
                within the row on its own. */}
            {a.taskName ? (
              <Text style={[styles.historyTaskName, { color: a.taskColor ?? kindColor }]} numberOfLines={1}>
                {a.taskName}
              </Text>
            ) : ACHIEVEMENT_META[a.kind].ribbon.kind === 'count' ? (
              <Text style={[styles.historyTaskName, { color: kindColor }]} numberOfLines={1}>
                {getRibbonText(a)}
              </Text>
            ) : null}
            <Text style={styles.historyDate}>{format(parseISO(a.earnedAt), 'MMM d, yyyy')}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
});
UnlockHistoryList.displayName = 'UnlockHistoryList';

interface CelebrationContentProps {
  achievement: Achievement;
  kindHistory: Achievement[];
  emblemDelay: number;
  timeline: SharedValue<number>;
}

const CelebrationContent: React.FC<CelebrationContentProps> = ({
  achievement,
  kindHistory,
  emblemDelay,
  timeline,
}) => {
  const insets = useSafeAreaInsets();
  const muteKind = useAchievementsStore(state => state.muteKind);
  const unmuteKind = useAchievementsStore(state => state.unmuteKind);
  const isMuted = useAchievementsStore(state => state.mutedKinds.includes(achievement.kind));
  const { showToast } = useToast();
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
  const kindInstanceCount = kindHistory.length;
  const showHistoryList = kindInstanceCount > 1;
  const historyListHeight = showHistoryList
    ? Math.min(kindInstanceCount, HISTORY_MAX_VISIBLE_ROWS) * HISTORY_ROW_HEIGHT
    : 0;

  // See handleToggleMute's own comment for why this covers repeatable kinds AND task-scoped
  // one-time kinds, excluding only global one-time kinds (which can never recur at all) and
  // preview instances (nothing real to mute yet).
  const showMuteToggle = (meta.repeatable || meta.scope === 'task') && achievement.dedupScope !== 'preview';

  const countDuration = showsNumber ? getAchievementCountUpDuration(achievement.value ?? 0) : 0;
  const schedule = useMemo(
    () => getAchievementRevealSchedule({ showsNumber, countDuration, emblemDelay }),
    [countDuration, emblemDelay, showsNumber]
  );

  // The title slot's own minHeight used to be one fixed value shared by both variants -- tuned
  // against the taller numberBlock (eyebrow + huge number + unit caption), it left a comeback's
  // much shorter plainTitle (a single 30px line) sitting in a lot of unused reserved space, which
  // is what actually read as "too much space" per earlier feedback; shrinking that one shared
  // value to fix it then left numberBlock-based achievements visibly cramped instead. Sizing per
  // variant fixes both at once -- safe to do since the variant itself never changes mid-playback
  // (it's a constant for this achievement's whole lifetime, only the reveal *opacity* animates).
  const titleMinHeight = showsNumber ? 116 : 48;

  // Offered whenever this kind can genuinely fire again for *something* -- either because it's
  // marked repeatable (the same task can re-earn it, e.g. after a streak resets and climbs back
  // up), or because it's task-scoped (per-task one-time kinds like milestone-N/anniversary can
  // still be earned independently by every *other* qualifying task, even though any single task
  // only gets its own copy once). Only a kind that's both non-repeatable *and* global (e.g.
  // first-completion, a single user-wide "you got started" moment) can truly never happen again
  // for anything -- that's the one case with nothing left for this to suppress. Toggles mute for
  // the whole *kind* (every task, until toggled back off here or via Settings' own "restore full
  // celebrations") rather than just this one instance -- see mutedKinds' own comment in
  // achievementsStore.ts for why that's the right scope.
  //
  // A real toggle (2026-08-12), not a one-shot "mute and dismiss" action -- an earlier version was
  // a text link that muted and immediately closed the screen, replaced per direct user direction
  // with an icon button that reflects and flips the current state without leaving the celebration,
  // since a persistent on/off setting reads more naturally as something you can flip back
  // immediately than as an action bundled into dismissal. Each direction gets its own toast,
  // stating the resulting behavior plainly rather than just confirming "done."
  const handleToggleMute = useCallback(() => {
    if (isMuted) {
      unmuteKind(achievement.kind);
      showToast({ message: `Future unlocks of "${meta.title}" will show the full celebration again.` });
    } else {
      muteKind(achievement.kind);
      showToast({ message: `Future unlocks of "${meta.title}" won't show the full celebration — just a quick alert.` });
    }
  }, [isMuted, muteKind, unmuteKind, achievement.kind, showToast, meta.title]);

  useEffect(() => {
    // This is the sequence's only JS-side start signal. Every intermediate phase derives directly
    // from this elapsed-time value on the UI thread; no timers, phase state, or React commits fire
    // while the reveal is playing. The navigation handler resets to zero before swapping content,
    // preventing the newly focused page from flashing at the previous page's completed time.
    cancelAnimation(timeline);
    timeline.value = 0;
    timeline.value = withTiming(schedule.end, {
      duration: schedule.end,
      easing: Easing.linear,
    });
    return () => cancelAnimation(timeline);
  }, [achievement.id, schedule.end, timeline]);

  return (
    <View style={styles.host}>
      <View
        style={StyleSheet.absoluteFillObject}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${meta.title}. ${meta.describe(achievement)}`}
      >
        {/* Mute toggle, stacked directly under the close button (2026-08-12) -- replaces an
            earlier in-flow text link ("show a quick alert next time instead"), per direct user
            direction for a smaller icon button reflecting current state rather than a one-shot
            link. Only for repeatable kinds, never on a locked card's own preview -- see
            handleToggleMute's own comment. */}
        {showMuteToggle && (
          <Pressable
            onPress={handleToggleMute}
            style={[styles.muteToggleButton, { top: insets.top + 60 }]}
            accessibilityRole="switch"
            accessibilityState={{ checked: isMuted }}
            accessibilityLabel={isMuted ? `Full celebrations off for ${meta.title}` : `Full celebrations on for ${meta.title}`}
            accessibilityHint={isMuted ? 'Turns full celebrations back on for this achievement' : 'Switches this achievement to a quick alert instead of the full celebration'}
          >
            <MaterialCommunityIcons name={isMuted ? 'bell-off-outline' : 'bell-outline'} size={16} color="#fff" />
          </Pressable>
        )}

        {/* Top-anchored, not centered -- every slot below is always mounted (fixed minHeight)
            from the very first frame, so the *total* content height never changes as later
            slots reveal their content. A centered/justify-content:center layout would have
            re-centered (and visibly shifted) every already-revealed element each time a new one
            was added -- this is what that bug fix relies on.

            Deliberately still a plain View, not a ScrollView (2026-08-12) -- a ScrollView was
            tried first for the same "no safe margin above Android's nav buttons" report this
            entry addresses, but per direct follow-up that wasn't the right fix: the actual ask is
            for the whole layout to just fit within the screen, not to make it scrollable. Reverted
            that in full (including the now-unneeded `nestedScrollEnabled` on UnlockHistoryList's
            own inner ScrollView), and instead tightened every fixed size in this screen's own
            layout -- reveal-slot minHeights, inter-section gaps, the top/bottom padding beyond the
            safe-area insets themselves, and the unlock-history list's own row height/max visible
            rows -- to meaningfully shrink the worst-case total height (every reveal fully played
            out, a 3+ instance history list, and the new mute link all showing at once). This is a
            "much less likely to overflow" fix, not a mathematically guaranteed one -- RN has no
            built-in way to force arbitrary content to shrink to fit an exact available height
            without either scrolling or measuring-and-scaling at runtime, and this screen was
            asked to avoid the former; if overflow still shows up on a real device (e.g. a very
            long task name wrapping to two lines, or an unusually short screen), the next lever
            would be shrinking the emblem's own `TROPHY_BADGE_STACK_SIZE` (currently untouched, and
            the single largest fixed dimension on this screen) or genuinely measuring/scaling. */}
        <View style={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.emblemSlot}>
            <TrophyBadge
              icon={meta.icon}
              color={kindColor}
              glowColor={kindGlowColor}
              accentColor={kindAccentColor}
              ribbonText={getRibbonText(achievement)}
              timeline={timeline}
              introStart={schedule.emblemStart}
            />
          </View>

          {/* Eyebrow / huge animated number / unit caption, stacked -- rather than one hyphenated
              sentence like the Trophy Case tiles use, this screen has room to let the number be
              the clear hero element (per explicit user direction). The number itself is
              kind-colored so it visually ties back to the badge/rings above it. */}
          <RevealSlot timeline={timeline} startTime={schedule.titleStart} minHeight={titleMinHeight}>
            {showsNumber ? (
              <View style={styles.numberBlock}>
                <Text style={styles.eyebrow}>{numberBlock!.eyebrow}</Text>
                {/* Base by default, matching the coin/ribbon it sits under -- most themes'
                    base color was actually preferred here (see meta.color.useAccentText's own
                    comment in achievements.ts). Only the handful of genuinely dark-based themes
                    (Gilded, Obsidian) opt into accent instead, since base would read as nearly
                    invisible against this screen's own dark backdrop for those specifically. */}
                <AchievementCount
                  value={achievement.value ?? 0}
                  duration={countDuration}
                  color={meta.color.useAccentText ? kindAccentColor : kindColor}
                  timeline={timeline}
                  startTime={schedule.titleStart}
                />
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
          <RevealSlot
            timeline={timeline}
            startTime={schedule.descriptionStart}
            minHeight={80}
            style={styles.descriptionBlock}
          >
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
              only dismiss affordance, and it doesn't need a hint pointing at it. The mute toggle
              used to live here too, as an in-flow text link -- moved out to its own fixed corner
              button (see the close-button JSX above), so it no longer contributes to this slot's
              own height. */}
          <RevealSlot
            timeline={timeline}
            startTime={schedule.historyStart}
            minHeight={48 + historyListHeight}
            style={styles.metaBlock}
          >
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
                instances={kindHistory}
                kindIcon={meta.icon}
                kindColor={kindColor}
                maxHeight={historyListHeight}
              />
            )}
          </RevealSlot>
        </View>

      </View>
    </View>
  );
};

interface BatchDockItemProps {
  achievement: Achievement;
  index: number;
  isFocused: boolean;
  focus: SharedValue<number>;
  onSelect: (index: number) => void;
}

const BatchDockItem: React.FC<BatchDockItemProps> = React.memo(({
  achievement,
  index,
  isFocused,
  focus,
  onSelect,
}) => {
  const meta = ACHIEVEMENT_META[achievement.kind];
  const dropProgress = useSharedValue(0);

  useEffect(() => {
    // Closest trailing emblem lands first, then the rest follow outward. Easing.in is deliberate:
    // the requested physical read is slow release -> accelerating fall -> an abrupt stop at the
    // surface, with no rebound. Everything stays on the UI thread and each item runs only once.
    const sequenceIndex = Math.max(0, index - 1);
    dropProgress.value = withDelay(
      BATCH_DOCK_REVEAL_DELAY + sequenceIndex * BATCH_DOCK_DROP_STAGGER,
      withTiming(1, { duration: BATCH_DOCK_DROP_DURATION, easing: Easing.in(Easing.cubic) })
    );
    return () => cancelAnimation(dropProgress);
  }, [dropProgress, index]);

  const animatedStyle = useAnimatedStyle(() => {
    const relativeIndex = index - focus.value;
    const distance = Math.abs(relativeIndex);
    // The focused lightweight emblem disappears into the full TrophyBadge occupying the center
    // stage. Its immediate neighbors remain large; farther items compress/fade progressively,
    // producing the magnified-center shape of a macOS Dock without running TrophyBadge's loops.
    const focusFade = Math.min(1, distance * 1.8);
    const trailFade = Math.max(0, 1 - Math.max(0, distance - 1) * 0.2);
    const scale = Math.max(0.48, 1 - Math.min(distance, 3.25) * 0.15);
    // Reserve a much wider center berth than ordinary item-to-item spacing. The extra clearance
    // ramps from zero to full strength over the innermost half-slot, so an emblem can glide into
    // focus continuously instead of snapping across a fixed gap at relativeIndex === 0.
    const centerClearance = BATCH_DOCK_CENTER_CLEARANCE * Math.min(1, distance * 2);
    const direction = relativeIndex === 0 ? 0 : Math.sign(relativeIndex);
    const spacedDistance = Math.min(distance, 1) * BATCH_DOCK_ITEM_SPACING
      + Math.max(0, distance - 1) * BATCH_DOCK_TRAIL_SPACING;
    const translateX = direction * (spacedDistance + centerClearance);
    return {
      opacity: dropProgress.value * focusFade * trailFade,
      zIndex: Math.max(1, 20 - Math.round(distance * 4)),
      transform: [
        { translateX },
        {
          translateY: Math.min(distance, 2) * 3
            - (1 - dropProgress.value) * BATCH_DOCK_DROP_HEIGHT,
        },
        { scale },
      ],
    };
  });

  return (
    <Reanimated.View style={[styles.batchDockItem, animatedStyle]}>
      <Pressable
        style={styles.batchDockItemButton}
        onPress={() => onSelect(index)}
        disabled={isFocused}
        accessibilityRole="button"
        accessibilityLabel={`${meta.title}, achievement ${index + 1}`}
        accessibilityHint="Shows this achievement"
        accessibilityState={{ selected: isFocused, disabled: isFocused }}
      >
        <TrophyEmblem
          icon={meta.icon}
          color={meta.color.base}
          glowColor={meta.color.glow}
          accentColor={meta.color.accent}
          ribbonText={getRibbonText(achievement)}
        />
      </Pressable>
    </Reanimated.View>
  );
});
BatchDockItem.displayName = 'BatchDockItem';

const CelebrationBatch: React.FC<{ achievements: Achievement[]; onDismiss: () => void }> = ({ achievements, onDismiss }) => {
  const insets = useSafeAreaInsets();
  const allAchievements = useAchievementsStore(state => state.achievements);
  const [pageIndex, setPageIndex] = useState(0);
  const [viewedCount, setViewedCount] = useState(1);
  const viewedIndices = useRef(new Set([0]));
  const hasNavigated = useRef(false);
  const achievement = achievements[Math.min(pageIndex, achievements.length - 1)];
  const firstAchievementMeta = ACHIEVEMENT_META[achievements[0].kind];
  const batchVisibility = useSharedValue(0);
  const sceneTimeline = useSharedValue(0);
  const confettiTimeline = useSharedValue(0);
  const dockFocus = useSharedValue(0);
  const dockReveal = useSharedValue(0);
  const historiesByKind = useMemo(() => {
    const result = new Map<AchievementKind, Achievement[]>();
    for (const item of allAchievements) {
      const instances = result.get(item.kind);
      if (instances) instances.push(item);
      else result.set(item.kind, [item]);
    }
    for (const instances of result.values()) {
      instances.sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
    }
    return result;
  }, [allAchievements]);

  useEffect(() => {
    batchVisibility.value = withTiming(1, { duration: 250 });
    // Confetti is a one-shot entrance for the congratulations window itself, not for an
    // individual achievement page. Its independent clock starts once with the batch and keeps
    // running if the user navigates; no focus change can restart it.
    const confettiEnd = EMBLEM_DELAY + ACHIEVEMENT_REVEAL_TIMING.confettiDuration;
    confettiTimeline.value = withTiming(confettiEnd, {
      duration: confettiEnd,
      easing: Easing.linear,
    });
    // A singleton has no dock. Avoid even scheduling its invisible delayed animation so the
    // overwhelmingly common one-achievement path stays as close to the original cost as possible.
    if (achievements.length > 1) {
      dockReveal.value = withDelay(
        BATCH_DOCK_REVEAL_DELAY,
        withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) })
      );
    }
    return () => {
      cancelAnimation(batchVisibility);
      cancelAnimation(confettiTimeline);
      cancelAnimation(dockReveal);
    };
  }, [achievements.length, batchVisibility, confettiTimeline, dockReveal]);

  const dismissWithAnimation = useCallback(() => {
    batchVisibility.value = withTiming(
      0,
      { duration: DISMISS_ANIM_DURATION, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onDismiss)();
      }
    );
  }, [batchVisibility, onDismiss]);

  // Back always means "leave the congratulations screen," even while the upper-right control is
  // still advancing through an unread batch. Call through immediately instead of borrowing that
  // control's next-or-close behavior or waiting for its visual exit animation.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => subscription.remove();
  }, [onDismiss]);

  const selectPage = useCallback((index: number) => {
    const nextIndex = Math.max(0, Math.min(achievements.length - 1, index));
    // Update the shared focus clock from the same input event that changes React content. Every
    // dock item derives from this one spring, so none of the neighbors can drift out of phase.
    hasNavigated.current = true;
    cancelAnimation(sceneTimeline);
    sceneTimeline.value = 0;
    if (!viewedIndices.current.has(nextIndex)) {
      viewedIndices.current.add(nextIndex);
      setViewedCount(viewedIndices.current.size);
    }
    dockFocus.value = withSpring(nextIndex, BATCH_DOCK_SPRING);
    setPageIndex(nextIndex);
  }, [achievements.length, dockFocus, sceneTimeline]);

  const showPrevious = useCallback(() => selectPage(pageIndex - 1), [pageIndex, selectPage]);
  const showNext = useCallback(() => selectPage(pageIndex + 1), [pageIndex, selectPage]);

  const showNextUnviewed = useCallback(() => {
    for (let offset = 1; offset <= achievements.length; offset += 1) {
      const candidate = (pageIndex + offset) % achievements.length;
      if (!viewedIndices.current.has(candidate)) {
        selectPage(candidate);
        return;
      }
    }
  }, [achievements.length, pageIndex, selectPage]);

  const hasViewedAll = viewedCount >= achievements.length;

  const batchVisibilityStyle = useAnimatedStyle(() => ({
    opacity: batchVisibility.value,
    transform: [{ scale: 0.92 + batchVisibility.value * 0.08 }],
  }));

  const dockRevealStyle = useAnimatedStyle(() => ({
    opacity: dockReveal.value,
    transform: [{ translateY: (1 - dockReveal.value) * 8 }],
  }));

  return (
    <Reanimated.View style={[styles.host, batchVisibilityStyle]}>
      {/* The backdrop, content scene, and pager all belong to the stable batch. Focus changes now
          update the existing native scene and reset one UI-thread timeline instead of remounting
          the badge, confetti pool, and reveal tree. */}
      <View style={styles.batchBackdrop} pointerEvents="none" />
      {/* This control belongs to the stable batch shell, not the keyed achievement page, so it
          animates in once with the screen. It advances to every still-unviewed achievement before
          becoming the ordinary close affordance; direct dock navigation is accounted for too. */}
      <Pressable
        onPress={hasViewedAll ? dismissWithAnimation : showNextUnviewed}
        style={[styles.closeButton, { top: insets.top + 12 }]}
        accessibilityRole="button"
        accessibilityLabel={hasViewedAll ? 'Close' : 'Next achievement'}
        accessibilityHint={hasViewedAll ? undefined : `${achievements.length - viewedCount} achievements remaining`}
      >
        <MaterialCommunityIcons name={hasViewedAll ? 'close' : 'chevron-right'} size={22} color="#fff" />
      </Pressable>
      <CelebrationContent
        achievement={achievement}
        kindHistory={historiesByKind.get(achievement.kind) ?? []}
        emblemDelay={hasNavigated.current ? 0 : EMBLEM_DELAY}
        timeline={sceneTimeline}
      />
      <View style={styles.confettiHost} pointerEvents="none">
        <Confetti
          baseColor={firstAchievementMeta.color.base}
          glowColor={firstAchievementMeta.color.glow}
          accentColor={firstAchievementMeta.color.accent}
          timeline={confettiTimeline}
          startTime={EMBLEM_DELAY}
        />
      </View>
      {achievements.length > 1 && (
        <>
          <View style={[styles.batchDockTrack, { top: insets.top + 8 + BATCH_DOCK_TRACK_TOP }]}>
            {achievements.map((dockAchievement, index) => (
              <BatchDockItem
                key={dockAchievement.id}
                achievement={dockAchievement}
                index={index}
                isFocused={index === pageIndex}
                focus={dockFocus}
                onSelect={selectPage}
              />
            ))}
          </View>
          <Reanimated.View
            style={[
              styles.batchDockNavigator,
              { top: insets.top + 8 + BATCH_DOCK_NAV_TOP },
              dockRevealStyle,
            ]}
          >
            <Pressable
              onPress={showPrevious}
              disabled={pageIndex === 0}
              hitSlop={8}
              style={[styles.batchDockNavButton, pageIndex === 0 && styles.batchDockNavButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Previous achievement"
              accessibilityState={{ disabled: pageIndex === 0 }}
            >
              <MaterialCommunityIcons name="chevron-left" size={20} color="#fff" />
            </Pressable>
            <Text style={styles.batchDockNavLabel}>{pageIndex + 1} of {achievements.length}</Text>
            <Pressable
              onPress={showNext}
              disabled={pageIndex === achievements.length - 1}
              hitSlop={8}
              style={[styles.batchDockNavButton, pageIndex === achievements.length - 1 && styles.batchDockNavButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Next achievement"
              accessibilityState={{ disabled: pageIndex === achievements.length - 1 }}
            >
              <MaterialCommunityIcons name="chevron-right" size={20} color="#fff" />
            </Pressable>
          </Reanimated.View>
        </>
      )}
    </Reanimated.View>
  );
};

interface PendingAchievementPresentationProps {
  initialPresentation: PendingAchievementPresentationModel;
  dismissCurrentAlert: () => void;
  promoteCurrentAlertToCelebration: () => void;
  dismissCelebrations: (achievementIds: string[]) => void;
}

// Snapshots the selected presentation under its priority key. A full-screen batch remains stable
// while it is navigated; unlocks appended afterward remain queued for the next screen. An alert
// snapshot can be preempted by full-screen work because the parent changes this component's key.
const PendingAchievementPresentation: React.FC<PendingAchievementPresentationProps> = ({
  initialPresentation,
  dismissCurrentAlert,
  promoteCurrentAlertToCelebration,
  dismissCelebrations,
}) => {
  const [presentation] = useState(initialPresentation);

  const dismissBatch = useCallback(() => {
    if (presentation?.type === 'celebration') {
      dismissCelebrations(presentation.achievements.map(achievement => achievement.id));
    }
  }, [dismissCelebrations, presentation]);

  if (presentation.type === 'alert') {
    return (
      <AchievementAlert
        achievement={presentation.achievement}
        onDismiss={dismissCurrentAlert}
        onPress={promoteCurrentAlertToCelebration}
      />
    );
  }

  return <CelebrationBatch achievements={presentation.achievements} onDismiss={dismissBatch} />;
};

// Mounted once at the app root (see _layout.tsx), a sibling of ToastBanner -- a full-screen
// cinematic takeover, so it naturally supersedes the bottom completion toast while it's showing
// (rather than needing to coordinate space with it, as the earlier compact banner version did).
export const AchievementCelebration: React.FC = () => {
  const pendingCelebrations = useAchievementsStore(state => state.pendingCelebrations);
  const pendingAlerts = useAchievementsStore(state => state.pendingAlerts);
  const dismissCurrentCelebration = useAchievementsStore(state => state.dismissCurrentCelebration);
  const dismissCurrentAlert = useAchievementsStore(state => state.dismissCurrentAlert);
  const promoteCurrentAlertToCelebration = useAchievementsStore(
    state => state.promoteCurrentAlertToCelebration
  );
  const dismissCelebrations = useAchievementsStore(state => state.dismissCelebrations);
  const celebrationsEnabled = useSettingsStore(state => state.achievementCelebrationsEnabled);
  const presentation = getPendingAchievementPresentation(pendingCelebrations, pendingAlerts);

  // Achievements are always recorded into history regardless of this setting (see
  // achievementsStore.ts) -- it only ever gates whether anything shows here at all. When it's off,
  // silently drain the queue instead of ever rendering, rather than backlogging popups for if it
  // gets re-enabled.
  useEffect(() => {
    if (celebrationsEnabled) return;
    if (pendingCelebrations.length > 0) dismissCurrentCelebration();
    if (pendingAlerts.length > 0) dismissCurrentAlert();
  }, [pendingCelebrations.length, pendingAlerts.length, celebrationsEnabled, dismissCurrentCelebration, dismissCurrentAlert]);

  if (!presentation || !celebrationsEnabled) return null;

  // The key changes immediately when full-screen work appears while an alert is showing. That
  // preempts (without dismissing) the alert; after the full batch closes, the same alert queue
  // resumes from its original first entry with a fresh auto-dismiss timer.
  const presentationKey = presentation.type === 'celebration'
    ? `celebration-${presentation.achievements[0].id}`
    : `alert-${presentation.achievement.id}`;

  return (
    <PendingAchievementPresentation
      key={presentationKey}
      initialPresentation={presentation}
      dismissCurrentAlert={dismissCurrentAlert}
      promoteCurrentAlertToCelebration={promoteCurrentAlertToCelebration}
      dismissCelebrations={dismissCelebrations}
    />
  );
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
  batchBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 8, 16, 0.92)',
    zIndex: 999,
    elevation: 999,
  },
  // Explicit dismiss affordance, top-right -- replaces the removed tap-anywhere Pressable (see
  // the top-of-file comment). `top` is set inline per-instance (insets.top + 12), since this
  // style object is static and can't read safe-area insets itself. A translucent circular
  // backdrop (not just a bare icon) so it stays legible regardless of what's directly behind it
  // (the badge/rings/confetti all pass through this same top-right region at various points).
  closeButton: {
    position: 'absolute',
    right: 16,
    zIndex: 1003,
    elevation: 1003,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Stacked directly under closeButton -- horizontally centered under it (closeButton is 40 wide
  // at right:16, this is 32 wide, so right:20 keeps the two visually aligned on the same center
  // line) and smaller, per explicit user direction, reflecting supporting-action-not-primary-
  // dismissal status. Top offset is set inline at the call site (insets.top + 60 -- 12 + 40 + 8,
  // clearing closeButton's own height plus a small gap), same reasoning as closeButton's own
  // inline `top`.
  muteToggleButton: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confettiHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1001,
    elevation: 1001,
  },
  batchDockTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: BATCH_DOCK_TRACK_HEIGHT,
    zIndex: 1001,
    elevation: 1001,
    overflow: 'hidden',
  },
  batchDockItem: {
    position: 'absolute',
    left: '50%',
    top: 16,
    width: BATCH_DOCK_ITEM_WIDTH,
    height: BATCH_DOCK_ITEM_HEIGHT,
    marginLeft: -(BATCH_DOCK_ITEM_WIDTH / 2),
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  batchDockItemButton: {
    width: BATCH_DOCK_ITEM_WIDTH,
    height: BATCH_DOCK_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  batchDockNavigator: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 1002,
    elevation: 1002,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 30,
  },
  batchDockNavButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  batchDockNavButtonDisabled: {
    opacity: 0.25,
  },
  batchDockNavLabel: {
    minWidth: 44,
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  // Plain View, not a ScrollView -- this screen is top-anchored and sized to fit the visible
  // viewport without scrolling (see the comment at this style's own call site for the full
  // reasoning/history). `flex: 1` lets it fill whatever space its own parent (the full-screen
  // Reanimated.View) gives it.
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
    // Still wider than the individual gaps within each block (e.g. momentBlock's own 22) -- the
    // major sections (emblem, hero number, moment, record) need clearer air between them than
    // elements within the same idea do. Tightened from an earlier 18 (itself brought down from an
    // even earlier 28) specifically to help the whole screen fit without scrolling on a shorter
    // device -- every RevealSlot's own minHeight below was tightened for the same reason.
    gap: 12,
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
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  unitCaption: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  plainTitle: {
    color: '#fff',
    fontSize: 26,
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
  // Deliberately quiet -- small, muted, underlined like a plain text link rather than a button,
  // so it reads as a minor, easy-to-ignore option rather than competing with the close button or
  // the celebration itself for attention.
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
