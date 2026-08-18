import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  Easing,
  SlideInLeft,
  SlideInRight,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import { useToast } from '../context/ToastContext';
import { MaterialCommunityIconName } from '../types';

export interface ShareVariantOption {
  key: string;
  label: string;
  icon: MaterialCommunityIconName;
}

interface SharePreviewModalProps {
  visible: boolean;
  title: string;
  filename: string;
  onClose: () => void;
  children: React.ReactNode;
  option?: {
    label: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
  };
  // A carousel-nav strip below the card -- lets the caller offer a few visually distinct card
  // layouts (e.g. a stat grid vs. a chart vs. a trophy highlight reel) for the same underlying
  // data, with the selected one live-rendered as `children` by the caller. Also enables swiping
  // the card itself left/right to step through the same list. Omit for a screen with only one
  // card design (e.g. the achievement celebration's own share card).
  variants?: ShareVariantOption[];
  selectedVariant?: string;
  onSelectVariant?: (key: string) => void;
}

const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1350;
// Rough combined height of the header + option row + share button chrome that isn't the card
// itself -- used to size the card so it never overflows the visible modal. The nav strip (when
// present) adds its own real height on top of this baseline.
const BASE_CHROME_HEIGHT = 210;
const NAV_ROW_HEIGHT = 58;

// Swiping past either threshold (distance OR a fast enough flick) cycles to the neighboring
// variant -- same dual distance-or-velocity rule ToastBanner's own swipe-to-dismiss uses.
const SWIPE_CYCLE_DISTANCE = 60;
const SWIPE_CYCLE_VELOCITY = 700;
// A swipe attempted past the first/last variant still tracks the finger, just heavily damped, so
// it reads as "there's nothing further this way" rather than either refusing to move at all or
// sliding away as if there were more content beyond it.
const OVERSCROLL_DAMPING = 0.3;
const CARD_EXIT_DURATION = 180;

interface CardCarouselProps {
  cardWidth: number;
  cardHeight: number;
  cardRef: React.RefObject<View | null>;
  children: React.ReactNode;
  isSharing: boolean;
  currentIndex: number;
  itemCount: number;
  onStep: (direction: 1 | -1) => void;
}

// Wraps the card in two independent animated layers: an outer one that carries the live drag (and,
// on a completed swipe, the outgoing card's own slide-off), and an inner one -- keyed by whichever
// variant is currently selected -- whose `entering` animation plays the incoming card's slide-in.
//
// The outer wrapper's reset back to rest (translateX -> 0) is deliberately NOT done inside the
// exit animation's own completion callback, even though that callback also kicks off the actual
// index change via runOnJS. That callback runs on the UI thread the instant the exit animation
// finishes; `runOnJS(onStep)` only *schedules* the JS-thread state update that swaps in the new
// card, which lands a beat later. Resetting translateX synchronously in that same UI-thread
// callback therefore snapped the wrapper back to center *before* React had actually swapped the
// child -- very briefly showing the still-mounted OLD card sitting back at rest in the middle
// (the exact "flash" reported on-device). Instead the reset lives in a `useLayoutEffect` keyed on
// `currentIndex`, which only fires once React has actually committed the new child -- and
// `useLayoutEffect` specifically (not `useEffect`) so it runs synchronously as part of that same
// commit, before anything is presented, rather than being deferred to a later frame.
const CardCarousel: React.FC<CardCarouselProps> = ({
  cardWidth,
  cardHeight,
  cardRef,
  children,
  isSharing,
  currentIndex,
  itemCount,
  onStep,
}) => {
  const translateX = useSharedValue(0);
  // Tracks the index this same slot last rendered, purely to work out which side the *next*
  // card should slide in from -- correct whether the change came from this drag gesture or from
  // tapping a nav slot directly, since both ultimately just change `currentIndex`. A setState call
  // guarded by an equality check, made directly in the render body, is React's own documented
  // pattern for "derive something from how a prop changed since the last render" (see "storing
  // information from previous renders" in the React docs) -- safer than mutating a plain ref
  // during render, which React explicitly warns can behave inconsistently under Strict Mode's
  // double-invocation.
  const [prevIndex, setPrevIndex] = useState(currentIndex);
  const [enteringDirection, setEnteringDirection] = useState<'next' | 'prev' | null>(null);
  if (currentIndex !== prevIndex) {
    setEnteringDirection(currentIndex > prevIndex ? 'next' : 'prev');
    setPrevIndex(currentIndex);
  }

  const canGoNext = currentIndex < itemCount - 1;
  const canGoPrev = currentIndex > 0;

  // See the block comment above CardCarousel for why this reset lives here, synchronized to the
  // actual card swap, rather than inside the exit animation's own completion callback.
  useLayoutEffect(() => {
    translateX.value = 0;
  }, [currentIndex, translateX]);

  const panGesture = useMemo(
    () => Gesture.Pan()
      .enabled(itemCount > 1 && !isSharing)
      .onUpdate((event) => {
        const draggingNext = event.translationX < 0;
        const blocked = (draggingNext && !canGoNext) || (!draggingNext && !canGoPrev);
        translateX.value = blocked ? event.translationX * OVERSCROLL_DAMPING : event.translationX;
      })
      .onEnd((event) => {
        const draggingNext = event.translationX < 0;
        const blocked = (draggingNext && !canGoNext) || (!draggingNext && !canGoPrev);
        const passedThreshold =
          Math.abs(event.translationX) > SWIPE_CYCLE_DISTANCE ||
          Math.abs(event.velocityX) > SWIPE_CYCLE_VELOCITY;

        if (!blocked && passedThreshold) {
          const exitTarget = (draggingNext ? -1 : 1) * cardWidth;
          translateX.value = withTiming(exitTarget, { duration: CARD_EXIT_DURATION }, (finished) => {
            // Deliberately doesn't reset translateX here -- see the block comment above
            // CardCarousel. The wrapper stays fully off-screen (clipped by the ref'd container's
            // own overflow:hidden) until the useLayoutEffect below resets it in lockstep with the
            // new card actually mounting.
            if (finished) {
              runOnJS(onStep)(draggingNext ? 1 : -1);
            }
          });
        } else {
          translateX.value = withTiming(0);
        }
      }),
    [itemCount, isSharing, canGoNext, canGoPrev, cardWidth, translateX, onStep]
  );

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      ref={cardRef}
      collapsable={false}
      style={{ width: cardWidth, height: cardHeight, overflow: 'hidden' }}
    >
      <GestureDetector gesture={panGesture}>
        <Reanimated.View style={[{ width: cardWidth, height: cardHeight }, dragStyle]}>
          <Reanimated.View
            key={currentIndex}
            style={{ width: cardWidth, height: cardHeight }}
            entering={enteringDirection === 'next' ? SlideInRight : enteringDirection === 'prev' ? SlideInLeft : undefined}
          >
            {children}
          </Reanimated.View>
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
};

const NAV_PADDING = 4;
const NAV_INDICATOR_DURATION = 220;

interface CarouselNavProps {
  variants: ShareVariantOption[];
  selectedVariant?: string;
  currentIndex: number;
  isSharing: boolean;
  onSelect: (key: string) => void;
}

// A single-row segmented control with one sliding accent-filled indicator gliding beneath whichever
// slot is current, rather than each slot toggling its own background -- both a closer match to a
// real carousel/pager nav (an indicator that visibly travels between stops) and a dodge of a real
// Android RN quirk this app has hit before: toggling `backgroundColor` on an already-rounded View
// post-mount can regenerate the native rounded-corner drawable incorrectly on only one side. The
// indicator only reacts to the *settled* `currentIndex` (via a plain withTiming glide), not to the
// card's own live drag position -- deliberately simpler than a fully drag-synced indicator, since
// that would need coordinating two independently-updating values with no margin for a visible seam
// at the handoff moment; this version has no such seam to get wrong.
const CarouselNav: React.FC<CarouselNavProps> = ({ variants, selectedVariant, currentIndex, isSharing, onSelect }) => {
  const [rowWidth, setRowWidth] = useState(0);
  const innerWidth = Math.max(0, rowWidth - NAV_PADDING * 2);
  const slotWidth = variants.length > 0 ? innerWidth / variants.length : 0;
  const indicatorX = useSharedValue(0);

  useEffect(() => {
    if (slotWidth > 0) {
      indicatorX.value = withTiming(currentIndex * slotWidth, {
        duration: NAV_INDICATOR_DURATION,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [currentIndex, slotWidth, indicatorX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setRowWidth(event.nativeEvent.layout.width);
  }, []);

  return (
    <View style={styles.navRow} onLayout={handleLayout}>
      {slotWidth > 0 && (
        <Reanimated.View style={[styles.navIndicator, { width: slotWidth, left: NAV_PADDING }, indicatorStyle]} />
      )}
      {variants.map(variant => {
        const isSelected = variant.key === selectedVariant;
        return (
          <Pressable
            key={variant.key}
            style={styles.navSlot}
            onPress={() => onSelect(variant.key)}
            disabled={isSharing}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={`${variant.label} style`}
          >
            <MaterialCommunityIcons
              name={variant.icon}
              size={16}
              color={isSelected ? '#fff' : '#9AA1B0'}
            />
            <Text style={[styles.navSlotText, isSelected && styles.navSlotTextSelected]}>
              {variant.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

/**
 * Shows the exact locally-rendered card that will be shared, then captures only that card—not the
 * surrounding app screen or controls. The temporary PNG goes straight to the native share sheet,
 * so sharing does not need photo-library permission and nothing leaves the device until the user
 * chooses a destination.
 */
export const SharePreviewModal: React.FC<SharePreviewModalProps> = ({
  visible,
  title,
  filename,
  onClose,
  children,
  option,
  variants,
  selectedVariant,
  onSelectVariant,
}) => {
  const cardRef = useRef<View>(null);
  const [isSharing, setIsSharing] = useState(false);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const hasVariants = !!variants && variants.length > 0;
  const reservedChromeHeight = BASE_CHROME_HEIGHT + (hasVariants ? NAV_ROW_HEIGHT : 0);
  const cardWidth = Math.min(360, width - 32, Math.max(240, (height - insets.top - insets.bottom - reservedChromeHeight) * 0.8));
  const cardHeight = cardWidth * 1.25;

  const currentIndex = hasVariants ? Math.max(0, variants!.findIndex(v => v.key === selectedVariant)) : 0;

  const handleStep = useCallback((direction: 1 | -1) => {
    if (!variants) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= variants.length) return;
    onSelectVariant?.(variants[nextIndex].key);
  }, [variants, currentIndex, onSelectVariant]);

  const handleShare = useCallback(async () => {
    if (!cardRef.current || isSharing) return;
    if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) {
      showToast({ message: 'Image sharing is not available on this device.' });
      return;
    }

    setIsSharing(true);
    try {
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT,
        fileName: filename,
      });
      await Sharing.shareAsync(uri, {
        dialogTitle: title,
        mimeType: 'image/png',
        UTI: 'public.png',
      });
    } catch (error) {
      console.warn('Failed to share image', error);
      showToast({ message: 'Could not create the share image.' });
    } finally {
      setIsSharing(false);
    }
  }, [filename, isSharing, showToast, title]);

  // Keep the generated card completely out of the React/native trees during ordinary app use.
  // In particular, achievement celebrations shouldn't pay to render a second static emblem and
  // text layout merely because sharing is available in principle.
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={isSharing ? undefined : onClose}
    >
      {/* react-native-gesture-handler's touch dispatch only reaches native views underneath the
          app root's own GestureHandlerRootView (see _layout.tsx) -- but RN's Modal renders its
          children into a *separate* native surface/window, outside that tree entirely. Without a
          second, nested GestureHandlerRootView scoped to the modal's own content, the swipe
          gesture below is wired up correctly in React but silently never receives a single touch
          event on-device. This is a documented react-native-gesture-handler + Modal interaction,
          not something specific to this screen. */}
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={[styles.backdrop, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable
              style={styles.iconButton}
              onPress={onClose}
              disabled={isSharing}
              accessibilityRole="button"
              accessibilityLabel="Close share preview"
            >
              <MaterialCommunityIcons name="close" size={22} color="#fff" />
            </Pressable>
          </View>

          <CardCarousel
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            cardRef={cardRef}
            isSharing={isSharing}
            currentIndex={currentIndex}
            itemCount={hasVariants ? variants!.length : 1}
            onStep={handleStep}
          >
            {children}
          </CardCarousel>

          {hasVariants && (
            <CarouselNav
              variants={variants!}
              selectedVariant={selectedVariant}
              currentIndex={currentIndex}
              isSharing={isSharing}
              onSelect={key => onSelectVariant?.(key)}
            />
          )}

          {option && (
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>{option.label}</Text>
              <Switch
                value={option.value}
                onValueChange={option.onValueChange}
                disabled={isSharing}
                trackColor={{ false: '#3A3D46', true: '#007AFF' }}
                thumbColor="#fff"
                accessibilityLabel={option.label}
              />
            </View>
          )}

          <Pressable
            style={[styles.shareButton, isSharing && styles.shareButtonDisabled]}
            onPress={handleShare}
            disabled={isSharing}
            accessibilityRole="button"
            accessibilityLabel="Open share sheet"
            accessibilityState={{ disabled: isSharing, busy: isSharing }}
          >
            {isSharing
              ? <ActivityIndicator color="#fff" />
              : <MaterialCommunityIcons name="share-variant" size={20} color="#fff" />}
            <Text style={styles.shareButtonText}>{isSharing ? 'Preparing…' : 'Share'}</Text>
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 5, 11, 0.96)',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  header: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navRow: {
    width: '100%',
    maxWidth: 420,
    flexDirection: 'row',
    position: 'relative',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    padding: NAV_PADDING,
  },
  navIndicator: {
    position: 'absolute',
    top: NAV_PADDING,
    bottom: NAV_PADDING,
    borderRadius: 16,
    backgroundColor: '#007AFF',
  },
  navSlot: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  navSlotText: {
    color: '#9AA1B0',
    fontSize: 12,
    fontWeight: '700',
  },
  navSlotTextSelected: {
    color: '#fff',
  },
  optionRow: {
    width: '100%',
    maxWidth: 360,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionLabel: {
    color: '#D6D9E0',
    fontSize: 15,
    fontWeight: '600',
  },
  shareButton: {
    width: '100%',
    maxWidth: 360,
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  shareButtonDisabled: {
    opacity: 0.65,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
