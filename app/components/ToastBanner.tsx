import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ToastAction, useToast } from '../context/ToastContext';

// Un-themed and theme-independent by design, same reasoning as OnboardingHint's bubble --
// a snackbar needs to read clearly regardless of the app's current light/dark palette.
const ACCENT = '#007AFF';

const ToastContent: React.FC<{ message: string; action?: ToastAction; onDismiss: () => void }> = ({
  message,
  action,
  onDismiss,
}) => {
  const reveal = useSharedValue(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    reveal.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.cubic) });
  }, []);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: (1 - reveal.value) * 16 }],
  }));

  return (
    <Reanimated.View style={[styles.banner, { bottom: 32 + insets.bottom }, revealStyle]}>
      <Text style={styles.message} numberOfLines={2}>{message}</Text>
      {action && (
        <Pressable
          onPress={() => {
            action.onPress();
            onDismiss();
          }}
          hitSlop={8}
        >
          <Text style={styles.actionLabel}>{action.label.toUpperCase()}</Text>
        </Pressable>
      )}
    </Reanimated.View>
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
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
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
