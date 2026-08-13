import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACHIEVEMENT_META, Achievement } from '../utils/achievements';

// A muted kind's live unlock (see mutedKinds' own comment in achievementsStore.ts) still deserves
// its own achievement-flavored notice -- icon + kind color, a real notification-style card --
// rather than blending into the app's plain everyday toasts (task completed, settings changed,
// etc, all via ToastContext/ToastBanner). Deliberately its own small standalone component/host
// rather than routed through the shared toast system: this is the *only* thing in the app that
// needs a top-anchored notice, and threading a `position`/rich-content option through the shared
// (bottom-anchored, plain-text) toast just to cover one caller wasn't worth complicating that
// system for every other toast that will never use it. AchievementCelebration.tsx renders this in
// place of the full-screen takeover whenever the pending achievement's kind is muted.
//
// Top-anchored specifically because it's mutually exclusive with the (bottom-anchored) completion
// toast that so often fires at the very same moment (a task completion both logs the completion
// toast *and* can earn this same achievement) -- the two now coexist without competing for the
// same space or hit-testing region, matching this feature's own original pre-full-screen design
// intent (see this file's own history in CLAUDE.md).
const AUTO_DISMISS_DURATION = 4500;
const SWIPE_DISMISS_DISTANCE = 80;
const SWIPE_DISMISS_VELOCITY = 800;

export const AchievementAlert: React.FC<{ achievement: Achievement; onDismiss: () => void }> = ({
  achievement,
  onDismiss,
}) => {
  const meta = ACHIEVEMENT_META[achievement.kind];
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const reveal = useSharedValue(0);
  const translateX = useSharedValue(0);

  useEffect(() => {
    reveal.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
    const timer = setTimeout(onDismiss, AUTO_DISMISS_DURATION);
    return () => clearTimeout(timer);
    // Deliberately mount-only -- this card belongs to this one achievement instance (the parent
    // remounts a fresh AchievementAlert per achievement via `key`), not something to restart if
    // `onDismiss`'s own identity happens to change for unrelated reasons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same swipe-to-dismiss shape as ToastBanner's own ToastContent (horizontal, same thresholds) --
  // this card is close enough kin to a toast that reusing the established interaction felt right,
  // even though it's a separate component rendering at the opposite edge of the screen.
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      const shouldDismiss =
        Math.abs(event.translationX) > SWIPE_DISMISS_DISTANCE ||
        Math.abs(event.velocityX) > SWIPE_DISMISS_VELOCITY;
      if (shouldDismiss) {
        const direction = event.translationX < 0 ? -1 : 1;
        translateX.value = withTiming(direction * screenWidth, { duration: 200 }, (finished) => {
          if (finished) runOnJS(onDismiss)();
        });
      } else {
        translateX.value = withTiming(0);
      }
    });

  const revealStyle = useAnimatedStyle(() => {
    const dragFade = 1 - Math.min(1, Math.abs(translateX.value) / screenWidth);
    return {
      opacity: reveal.value * dragFade,
      transform: [
        // Drops in from above (negative translateY -> 0), the mirror of ToastBanner's own
        // rises-from-below entrance, matching this card's own top anchor.
        { translateY: (1 - reveal.value) * -16 },
        { translateX: translateX.value },
      ],
    };
  });

  return (
    <View style={styles.host} pointerEvents="box-none">
      <GestureDetector gesture={panGesture}>
        <Reanimated.View
          style={[styles.card, { top: insets.top + 12 }, revealStyle]}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          accessibilityLabel={`${meta.title}. ${meta.describe(achievement)}`}
        >
          <View style={[styles.iconBadge, { backgroundColor: meta.color.base }]}>
            <MaterialCommunityIcons name={meta.icon} size={18} color="#fff" />
          </View>
          <View style={styles.textBlock}>
            <Text style={styles.title} numberOfLines={1}>{meta.title}</Text>
            {/* Same inline icon + task-colored bold name technique as CelebrationContent's own
                DescriptionText (AchievementCelebration.tsx) -- a task's own brand is meant to
                surface wherever it's actually named, not just on the full-screen takeover, and
                MaterialCommunityIcons is itself Text-based, so nesting it inside a parent Text
                works exactly like nesting a styled Text span. `triggerSuffix` (not `describe`,
                which bakes the task name into a plain quoted string with no room to color it)
                is what's built for exactly this "task is the subject, this is just the tail"
                split; a taskless kind or one with no triggerSuffix falls back to its own
                standalone phrasing (or, failing that, the plain describe() text). */}
            <Text style={styles.description} numberOfLines={2}>
              {achievement.taskName && meta.triggerSuffix ? (
                <>
                  {achievement.taskIcon && (
                    <MaterialCommunityIcons
                      name={achievement.taskIcon}
                      size={12}
                      color={achievement.taskColor ?? meta.color.base}
                    />
                  )}
                  <Text style={[styles.descriptionTaskName, { color: achievement.taskColor ?? meta.color.base }]}>
                    {' '}{achievement.taskName}
                  </Text>
                  {meta.triggerSuffix(achievement.value ?? 0)}
                </>
              ) : (
                meta.triggerStandalone?.(achievement.value) ?? meta.describe(achievement)
              )}
            </Text>
          </View>
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  // Comfortably below ToastBanner's own host (2000) -- the two never actually overlap (this one's
  // top-anchored, ToastBanner's bottom-anchored), but keeping this below it is the more defensive
  // default if that ever changes. Well above ordinary screen content and AchievementCelebration's
  // own full-screen host (1000) -- the two are mutually exclusive for a given pending achievement
  // (muted kinds render this, everything else renders the full takeover), but a stale one animating
  // out shouldn't get buried under whatever renders next regardless.
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1500,
    elevation: 1500,
  },
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#1c1c1e',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  description: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  descriptionTaskName: {
    fontWeight: '800',
  },
});
