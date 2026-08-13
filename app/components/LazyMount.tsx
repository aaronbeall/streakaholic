import React, { useEffect, useRef, useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

// Defers mounting `children` until this view has scrolled within `rootMargin` of the given scroll
// container's own visible viewport -- React Native's answer to a browser IntersectionObserver-
// based lazy-render. There's no RN-native IntersectionObserver equivalent, but the pieces already
// exist: `measureLayout` against a specific ancestor `View` (the same technique `useOnboardingTarget.ts`
// already uses elsewhere in this app, deliberately not `measureInWindow` for the identical reason
// documented there -- window coordinates don't reliably line up with a scrollable container's own
// content coordinates) plus the scroll container's own `onScroll`/`onLayout`.
//
// Once mounted, `children` stay mounted permanently -- scrolling back out never unmounts them. This
// is lazy *initial* render, not virtualization/windowing: re-rendering something (a chart, in
// particular -- see StatsCharts.tsx) every time it scrolls in and out would cost more than just
// rendering it once and leaving it, and would throw away any local state it holds.
//
// `contentRef` must be a plain `View` wrapping the *entire* scrollable content, starting at
// content-offset 0 -- not the `ScrollView` itself, whose own ref isn't a measurable host `View`
// without extra native-node unwrapping. `scrollY`/`viewportHeight` are read from the parent's own
// `onScroll`/`onLayout` rather than tracked internally here, so many `LazyMount`s sharing one
// scroll container don't each need their own scroll subscription.
interface LazyMountProps {
  contentRef: React.RefObject<View | null>;
  scrollY: number;
  viewportHeight: number;
  rootMargin?: number;
  placeholderHeight?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export const LazyMount: React.FC<LazyMountProps> = ({
  contentRef,
  scrollY,
  viewportHeight,
  rootMargin = 200,
  placeholderHeight = 240,
  style,
  children,
}) => {
  const wrapperRef = useRef<View>(null);
  const [measured, setMeasured] = useState<{ y: number; height: number } | null>(null);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);

  const measure = () => {
    if (hasBeenVisible) return;
    const container = contentRef.current;
    const wrapper = wrapperRef.current;
    if (!container || !wrapper) return;
    wrapper.measureLayout(
      container,
      (_x, y, _w, height) => setMeasured({ y, height }),
      () => undefined
    );
  };

  // Real layout can settle a frame after mount (same rationale as useOnboardingTarget's own rAF
  // kickoff) -- a chart card's own position only needs to be roughly right, not pixel-perfect, so
  // one rAF-scheduled retry is enough here rather than that hook's full stability-polling loop.
  useEffect(() => {
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hasBeenVisible || !measured) return;
    const viewportTop = scrollY - rootMargin;
    const viewportBottom = scrollY + viewportHeight + rootMargin;
    if (measured.y + measured.height >= viewportTop && measured.y <= viewportBottom) {
      setHasBeenVisible(true);
    }
  }, [scrollY, viewportHeight, measured, hasBeenVisible, rootMargin]);

  return (
    <View ref={wrapperRef} style={style} onLayout={measure}>
      {hasBeenVisible ? children : <View style={{ height: placeholderHeight }} />}
    </View>
  );
};
