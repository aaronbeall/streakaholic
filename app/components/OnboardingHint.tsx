import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { MaterialCommunityIconName } from '../types';

// Un-themed accent, matching the app's primary blue elsewhere (Save button, active theme option).
// Also used as a solid bubble background below -- a surface-colored bubble blended into the
// background on both themes, so this is intentionally theme-independent.
const ACCENT = '#007AFF';
const RING_PADDING = 6;
const BUBBLE_WIDTH = 240;
const POINTER_SIZE = 10;

export interface TargetLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OnboardingHintProps {
  text: string;
  iconItems?: readonly { icon: MaterialCommunityIconName; text: string }[];
  footer?: string;
  targetLayout: TargetLayout;
  onDismiss: () => void;
}

export const OnboardingHint: React.FC<OnboardingHintProps> = ({
  text,
  iconItems,
  footer,
  targetLayout,
  onDismiss,
}) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const pulse = useSharedValue(0);
  const reveal = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })),
      -1,
      true
    );
    // A quick pop with a slight overshoot -- draws the eye when a new hint appears, rather
    // than silently snapping into place.
    reveal.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.back(1.6)) });
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + pulse.value * 0.5,
    transform: [{ scale: 1 + pulse.value * 0.03 }],
  }));

  const revealStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ scale: 0.85 + reveal.value * 0.15 }],
  }));

  const placeBelow = targetLayout.y < screenHeight * 0.6;
  const bubbleLeft = Math.max(16, Math.min(targetLayout.x, screenWidth - BUBBLE_WIDTH - 16));
  const targetCenterX = targetLayout.x + targetLayout.width / 2;
  const pointerLeft = Math.max(
    12,
    Math.min(targetCenterX - bubbleLeft - POINTER_SIZE / 2, BUBBLE_WIDTH - 12 - POINTER_SIZE)
  );

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="box-none">
      <Reanimated.View
        pointerEvents="none"
        style={[
          styles.ringContainer,
          {
            left: targetLayout.x - RING_PADDING,
            top: targetLayout.y - RING_PADDING,
            width: targetLayout.width + RING_PADDING * 2,
            height: targetLayout.height + RING_PADDING * 2,
          },
          revealStyle,
        ]}
      >
        <Reanimated.View style={[StyleSheet.absoluteFill, styles.ring, pulseStyle]} />
      </Reanimated.View>

      <Reanimated.View
        style={[
          styles.bubble,
          placeBelow
            ? { top: targetLayout.y + targetLayout.height + 16 }
            : { bottom: screenHeight - targetLayout.y + 16 },
          { left: bubbleLeft },
          revealStyle,
        ]}
      >
        <View
          style={[
            styles.pointer,
            placeBelow ? styles.pointerUp : styles.pointerDown,
            { left: pointerLeft },
          ]}
        />
        <View style={styles.bubbleRow}>
          <View style={styles.bubbleCopy}>
            <Text style={styles.bubbleText}>{text}</Text>
            {iconItems && iconItems.length > 0 && (
              <View style={styles.iconItems}>
                {iconItems.map(item => (
                  <View key={item.icon} style={styles.iconItem}>
                    <MaterialCommunityIcons name={item.icon} size={17} color="#fff" />
                    <Text style={styles.iconItemText}>{item.text}</Text>
                  </View>
                ))}
              </View>
            )}
            {footer && <Text style={styles.bubbleText}>{footer}</Text>}
          </View>
          <Pressable
            onPress={onDismiss}
            hitSlop={8}
            style={styles.dismissButton}
            accessibilityRole="button"
            accessibilityLabel="Dismiss hint"
          >
            <MaterialCommunityIcons name="close" size={16} color="rgba(255,255,255,0.85)" />
          </Pressable>
        </View>
      </Reanimated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    // Above native-stack screen content, below congratulations (1000) and toasts (2000).
    zIndex: 900,
    elevation: 900,
  },
  ringContainer: {
    position: 'absolute',
  },
  ring: {
    borderRadius: 24,
    borderWidth: 3,
    borderColor: ACCENT,
  },
  bubble: {
    position: 'absolute',
    width: BUBBLE_WIDTH,
    // Solid accent instead of colors.surface -- a surface-colored bubble read as just another
    // card and disappeared against the background on both themes.
    backgroundColor: ACCENT,
    borderRadius: 12,
    padding: 14,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bubbleCopy: {
    flex: 1,
    gap: 6,
  },
  bubbleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 20,
  },
  iconItems: {
    gap: 4,
  },
  iconItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  iconItemText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  dismissButton: {
    padding: 2,
  },
  pointer: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: POINTER_SIZE / 2,
    borderRightWidth: POINTER_SIZE / 2,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  pointerUp: {
    top: -POINTER_SIZE,
    borderBottomWidth: POINTER_SIZE,
    borderBottomColor: ACCENT,
  },
  pointerDown: {
    bottom: -POINTER_SIZE,
    borderTopWidth: POINTER_SIZE,
    borderTopColor: ACCENT,
  },
});
