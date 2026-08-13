import React, { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import tinycolor from 'tinycolor2';

// A full-screen confetti burst for AchievementCelebration's cinematic screen -- deliberately its
// own component rather than a reuse/extension of ParticleSystem, which is bespoke-tuned for a
// completely different visual (small rising embers around a badge). Confetti instead falls from
// above the screen, tumbling and swaying, which needs a different motion model entirely (gravity
// fall + rotation vs. rise + swirl), so a fresh, simpler component was the better fit than trying
// to bend ParticleSystem's config shape to cover both.

interface ConfettiPiece {
  id: number;
  startX: number;
  size: number;
  color: string;
  isCircle: boolean;
  fallDelay: number;
  fallDuration: number;
  swayAmplitude: number;
  swayFrequency: number;
  rotationStart: number;
  rotationEnd: number;
}

// Colorized around the achievement's own kind colors rather than a fixed rainbow palette, so the
// burst reads as "this achievement's own colors" rather than a generic party-popper rainbow
// unrelated to what's being celebrated. When `glowColor`/`accentColor` are given (the achievement's
// own three-color theme, e.g. Rebirth's violet base + magenta glow + gold accent), the palette
// draws from all three plus a couple of tint/shade variants of the base -- a genuinely multi-hue
// burst that matches each kind's own theme, not just one hue lightened/darkened into a spread.
// Falls back to deriving everything from `baseColor` alone when the other two are omitted.
const buildPalette = (baseColor: string, glowColor?: string, accentColor?: string): string[] => {
  const base = tinycolor(baseColor);
  if (glowColor && accentColor) {
    return [
      base.toHexString(),
      base.clone().lighten(10).toHexString(),
      glowColor,
      accentColor,
      '#FFFFFF',
    ];
  }
  return [
    base.toHexString(),
    base.clone().lighten(15).toHexString(),
    base.clone().darken(12).toHexString(),
    base.clone().lighten(30).toHexString(),
    '#FFFFFF',
  ];
};

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

const ConfettiPieceView: React.FC<{ piece: ConfettiPiece; screenHeight: number }> = ({ piece, screenHeight }) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      piece.fallDelay,
      withTiming(1, { duration: piece.fallDuration, easing: Easing.in(Easing.quad) })
    );
    // Mount-only -- same reasoning as ParticleSystem's ParticleComponent: this timeline belongs
    // to this one mounted piece, not something to restart if a parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => {
    const fallDistance = screenHeight + 60;
    const translateY = -30 + progress.value * fallDistance;
    const sway = Math.sin(progress.value * piece.swayFrequency * Math.PI * 2) * piece.swayAmplitude;
    const rotation = piece.rotationStart + (piece.rotationEnd - piece.rotationStart) * progress.value;
    // Fades in quickly (avoids a hard pop-in right as the burst starts) and out over the final
    // stretch of the fall so pieces don't visibly vanish mid-air at a hard cutoff.
    const opacity = Math.min(1, progress.value * 8) * Math.min(1, (1 - progress.value) * 4);
    return {
      opacity,
      transform: [
        { translateX: piece.startX + sway },
        { translateY },
        { rotate: `${rotation}deg` },
      ],
    };
  });

  return (
    <Reanimated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          width: piece.size,
          height: piece.isCircle ? piece.size : piece.size * 0.4,
          backgroundColor: piece.color,
          borderRadius: piece.isCircle ? piece.size / 2 : 2,
        },
        style,
      ]}
    />
  );
};

interface ConfettiProps {
  count?: number;
  // The achievement's own kind color(s) -- the whole burst's palette is derived from these rather
  // than a fixed rainbow. `baseColor` alone still works (a single-hue tint/shade spread); passing
  // `glowColor`/`accentColor` too (the achievement's full three-color theme) produces a richer,
  // genuinely multi-hue burst instead. `baseColor` defaults to gold so an omitted prop still
  // renders something reasonable.
  baseColor?: string;
  glowColor?: string;
  accentColor?: string;
}

// Mounted fresh per celebration (the caller keys it by achievement id), full-screen, non-
// interactive -- pointerEvents is left to the caller's wrapping host since this component only
// ever renders the pieces themselves.
//
// Wrapped in React.memo (2026-08-13, a performance-review finding) -- same reasoning as
// TrophyBadge's own identical change: every prop here is a primitive, stable across re-renders
// unless the achievement itself changes, so this stops AchievementCelebration's count-up-driven
// re-renders from needlessly re-diffing all 60 (already mount-only-animated, so visually
// unaffected either way) confetti pieces on every tick.
export const Confetti: React.FC<ConfettiProps> = React.memo(({ count = 60, baseColor = '#FFD700', glowColor, accentColor }) => {
  const { width, height } = useWindowDimensions();

  const pieces = useMemo<ConfettiPiece[]>(() => {
    const palette = buildPalette(baseColor, glowColor, accentColor);
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      startX: randomBetween(0, width),
      size: randomBetween(6, 11),
      color: palette[Math.floor(Math.random() * palette.length)],
      isCircle: Math.random() > 0.5,
      // Staggered across a full second so the burst trickles rather than falling as one flat
      // sheet -- longer than ParticleSystem's 450ms spawnWindow since this covers a much taller
      // fall (the whole screen) rather than a small badge-sized burst.
      fallDelay: randomBetween(0, 1000),
      fallDuration: randomBetween(2200, 3600),
      swayAmplitude: randomBetween(15, 45),
      swayFrequency: randomBetween(1.5, 3),
      rotationStart: randomBetween(0, 360),
      rotationEnd: randomBetween(360, 1080),
    }));
    // Deliberately excludes width/height -- generated once per mount (per celebration), not
    // recomputed if the window happens to resize mid-burst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, baseColor, glowColor, accentColor]);

  const [screenHeight] = useState(height);

  return (
    <>
      {pieces.map(piece => (
        <ConfettiPieceView key={piece.id} piece={piece} screenHeight={screenHeight} />
      ))}
    </>
  );
});
Confetti.displayName = 'Confetti';
