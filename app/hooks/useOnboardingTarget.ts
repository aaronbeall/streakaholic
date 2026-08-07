import { RefObject, useEffect, useState } from 'react';
import { View } from 'react-native';
import { TargetLayout } from '../components/OnboardingHint';

// Measures `targetRef`'s layout relative to `containerRef` (not `measureInWindow` -- window
// coordinates only line up with an absoluteFill overlay's `top`/`left` if the container's origin
// exactly coincides with the window's, an assumption Android's edge-to-edge status-bar handling
// breaks). `containerRef` should be the same View OnboardingHint's absoluteFill is scoped inside.
//
// `onLayout` (react-native-web's ResizeObserver-backed polyfill) doesn't reliably fire on initial
// mount, so a rAF-scheduled measurement is the primary trigger. On native Android a single rAF
// isn't enough either -- unlike web, the native layout pass (and any late reflow from a screen's
// own slide-in transition) can still be in flight when that first frame fires -- so this polls on
// a short interval and stops once two consecutive reads agree layout has settled, capping the
// total wait so a target that never stabilizes doesn't poll forever.
export function useOnboardingTarget(
  containerRef: RefObject<View | null>,
  targetRef: RefObject<View | null>,
  enabled: boolean
): TargetLayout | null {
  const [layout, setLayout] = useState<TargetLayout | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const POLL_INTERVAL_MS = 100;
    const MAX_POLLS = 15; // ~1.5s ceiling
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastMeasured: TargetLayout | null = null;
    let stableCount = 0;
    let pollCount = 0;

    const isSameLayout = (a: TargetLayout, b: TargetLayout) =>
      a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

    const poll = () => {
      if (cancelled || !containerRef.current) return;
      targetRef.current?.measureLayout(
        containerRef.current,
        (x, y, measuredWidth, measuredHeight) => {
          if (cancelled) return;
          const next: TargetLayout = { x, y, width: measuredWidth, height: measuredHeight };
          setLayout(next);
          stableCount = lastMeasured && isSameLayout(lastMeasured, next) ? stableCount + 1 : 0;
          lastMeasured = next;
          pollCount += 1;
          if (stableCount < 2 && pollCount < MAX_POLLS) {
            timer = setTimeout(poll, POLL_INTERVAL_MS);
          }
        },
        () => {
          pollCount += 1;
          if (pollCount < MAX_POLLS) {
            timer = setTimeout(poll, POLL_INTERVAL_MS);
          }
        }
      );
    };

    const frame = requestAnimationFrame(poll);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
    };
    // containerRef/targetRef are useRef objects from the caller -- stable identities that never
    // need to retrigger this effect; only `enabled` (re-arming when a hint becomes eligible again)
    // should.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return layout;
}
