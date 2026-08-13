import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ToastAction, useToast } from '../context/ToastContext';

// Un-themed and theme-independent by design, same reasoning as OnboardingHint's bubble --
// a snackbar needs to read clearly regardless of the app's current light/dark palette.
const ACCENT = '#007AFF';
// Swiping past either threshold (distance OR a fast enough flick) dismisses -- matching how
// native Android/iOS snackbars/notifications are typically swiped away.
const SWIPE_DISMISS_DISTANCE = 80;
const SWIPE_DISMISS_VELOCITY = 800;

const ToastContent: React.FC<{ message: string; action?: ToastAction; onDismiss: () => void }> = ({
  message,
  action,
  onDismiss,
}) => {
  const reveal = useSharedValue(0);
  const translateX = useSharedValue(0);
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  useEffect(() => {
    reveal.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.cubic) });
  }, []);

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
    // Fades out as it's dragged, on top of (not instead of) the entrance fade-in -- so a fast
    // swipe during the entrance animation doesn't fight it.
    const dragFade = 1 - Math.min(1, Math.abs(translateX.value) / screenWidth);
    return {
      opacity: reveal.value * dragFade,
      transform: [
        { translateY: (1 - reveal.value) * 16 },
        { translateX: translateX.value },
      ],
    };
  });

  return (
    <GestureDetector gesture={panGesture}>
      <Reanimated.View
        style={[styles.banner, { bottom: 32 + insets.bottom }, revealStyle]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <Text style={styles.message} numberOfLines={2}>{message}</Text>
        {action && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              action.onPress();
              onDismiss();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Text style={styles.actionLabel}>{action.label.toUpperCase()}</Text>
          </Pressable>
        )}
      </Reanimated.View>
    </GestureDetector>
  );
};

export const ToastBanner: React.FC = () => {
  const { toast, hideToast } = useToast();

  if (!toast) return null;

  return (
    <View style={styles.host} pointerEvents="box-none">
      {/* Keying by id forces a fresh mount (and re-plays the pop-in) whenever a new toast
          replaces one already on screen, not just on first appearance. */}
      <ToastContent key={toast.id} message={toast.message} action={toast.action} onDismiss={hideToast} />
    </View>
  );
};

const styles = StyleSheet.create({
  // Bottom-right screens (Home) put a FAB right where a bottom-anchored toast's action sits --
  // an explicit high zIndex (elevation for Android) makes sure the toast wins hit-testing there
  // instead of taps bleeding through to whatever button happens to be underneath.
  //
  // Deliberately higher than AchievementCelebration's own host zIndex/elevation (1000, both
  // platforms), not just equal (2026-08-12) -- `<ToastBanner />` mounts before
  // `<AchievementCelebration />` in `_layout.tsx`, and at equal values two absolutely-positioned
  // siblings resolve ties by paint order, so the later-mounted celebration screen always won
  // regardless of which one the toast was actually triggered by. That's fine for the case this was
  // originally tuned for (a plain task-completion toast happening to be superseded by a
  // simultaneously-earned achievement's own full-screen takeover -- the celebration is the more
  // relevant thing to see there), but it also meant a toast fired *from inside* the celebration
  // itself (the mute toggle's own confirmation) rendered invisibly behind it, since the win was
  // purely structural, not based on which one is actually newer/more relevant right now. A toast
  // is inherently a transient acknowledgment layered on top of whatever's currently showing --
  // giving it a genuinely higher value settles both cases the same way a toast should always win.
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    elevation: 2000,
  },
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    // bottom is applied inline (32 + insets.bottom)
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    zIndex: 1000,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  message: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  actionLabel: {
    color: ACCENT,
    fontSize: 14,
    fontWeight: '700',
  },
});
