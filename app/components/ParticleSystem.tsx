import React, { useCallback, useEffect, useMemo, useState } from "react";
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import tinycolor from "tinycolor2";

interface Particle {
  id: number;
  originX: number;
  originY: number;
  size: number;
  color: string;
  driftX: number;
  driftY: number;
  // Unit vector perpendicular to this particle's own drift direction -- the axis the swirl
  // oscillates along, so it curls around the particle's actual path rather than some fixed
  // world axis.
  perpX: number;
  perpY: number;
  life: number;
  swirlAmplitude: number;
  swirlFrequency: number;
  swirlPhase: number;
  // Randomized once at creation -- how long after mount this particle actually starts rendering,
  // so the whole burst spawns in staggered over `spawnWindow` instead of every particle
  // appearing on the very first frame.
  spawnDelay: number;
}

interface ParticleConfig {
  color: string;
  // Optional palette of base hues -- when provided, each particle picks one at random (then
  // still applies `colorVariance` lighten/darken on top) instead of every particle sharing the
  // same single `color`. Lets a flame-style burst span red/orange/gold rather than one hue.
  colors?: string[];
  colorVariance: number;
  size: number;
  sizeVariance: number;
  distance: number;
  distanceVariance: number;
  life: number;
  lifeVariance: number;
  driftAngle: number; // in degrees
  driftAngleVariance: number; // in degrees
  driftDistance: number;
  driftDistanceVariance: number;
  swirlAmplitude: number; // max sideways displacement from the swirl, in pixels
  swirlAmplitudeVariance: number;
  swirlFrequency: number; // oscillations across the particle's full life
  swirlFrequencyVariance: number;
  // Total duration (ms) over which the whole burst's particles begin appearing, each at its own
  // random point within the window -- a short generation burst rather than all at once.
  spawnWindow: number;
}

interface ParticleSystemProps {
  count?: number;
  onComplete?: () => void;
  particles?: Partial<ParticleConfig>;
}

const ParticleComponent = React.memo(({ particle }: { particle: Particle }) => {
  const progress = useSharedValue(1);

  React.useEffect(() => {
    progress.value = withTiming(0, {
      duration: particle.life,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
    // Deliberately fires once per mount only -- `particle` is a stable object created once by
    // `createParticle`, and re-running this on every parent re-render (it used to depend on a
    // `life` value recomputed fresh in the parent's `.map()` each time) restarted the fade/drift
    // animation mid-flight instead of letting it play through.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Split from the animated style below -- these never change over the particle's life, so
  // there's no reason to rebuild them on the UI thread every frame `progress` ticks.
  const staticStyle = useMemo(
    () => ({
      position: "absolute" as const,
      left: 0,
      top: 0,
      width: particle.size,
      height: particle.size,
      borderRadius: particle.size / 2,
      backgroundColor: particle.color,
    }),
    [particle],
  );

  const animatedStyle = useAnimatedStyle(() => {
    const t = 1 - progress.value;
    // Swirl builds rather than decays -- negligible near the start of life, growing toward the
    // end (a real ember tends to drift fairly straight at first, then curl more as it cools and
    // loses momentum) -- applied along the particle's own perpendicular axis so it curls around
    // its actual direction of travel, not a fixed world axis.
    const swirlEnvelope = t * t;
    const swirlOffset =
      swirlEnvelope *
      particle.swirlAmplitude *
      Math.sin(t * particle.swirlFrequency * Math.PI * 2 + particle.swirlPhase);
    // A fast, subtle shimmer layered on top of the main fade -- real embers flicker rather than
    // dimming perfectly smoothly. Bounded well short of 1 so it only ever modulates the fade
    // envelope, never brightens past it.
    const flicker = 0.85 + 0.15 * Math.sin(t * 22 + particle.swirlPhase * 3);

    return {
      transform: [
        {
          translateX:
            particle.originX +
            particle.driftX * t +
            particle.perpX * swirlOffset,
        },
        {
          translateY:
            particle.originY +
            particle.driftY * t +
            particle.perpY * swirlOffset,
        },
        { scale: progress.value },
      ],
      opacity: progress.value * flicker,
    };
  });

  return <Reanimated.View style={[staticStyle, animatedStyle]} />;
});

ParticleComponent.displayName = "ParticleComponent";

const getRandomColor = (color: string, variance: number) => {
  const baseColor = tinycolor(color);
  const isDark = Math.random() > 0.5;

  // Randomly adjust lightness and darkness within the variation range
  const adjustment = Math.random() * variance;
  const adjustedColor = isDark
    ? baseColor.darken(adjustment)
    : baseColor.lighten(adjustment);

  return adjustedColor.toHexString();
};

const getRandomValue = (base: number, variance: number) => {
  return base + (Math.random() * variance * 2 - variance);
};

const degreesToRadians = (degrees: number) => degrees * (Math.PI / 180);

const defaultParticles: ParticleConfig = {
  color: "#FF1E1E",
  // Skewed red rather than an even hue spread, and picked for saturation over the muted salmon
  // `#FF6B6B` used earlier -- `#FF1E1E`/`#FF3B1F` (each repeated for weight) are vivid, fully
  // saturated reds rather than a pastel tint, with `#FF6B00` as an occasional vivid-orange accent
  // rather than true yellow/gold.
  colors: ["#FF1E1E", "#FF1E1E", "#FF3B1F", "#FF3B1F", "#FF6B00"],
  // Lowered slightly from 12 -- `getRandomColor`'s 50/50 lighten/darken swing was washing an
  // already-fairly-light red like the old `#FF6B6B` out toward pastel about half the time; a
  // smaller swing keeps these more saturated bases reliably vivid instead.
  colorVariance: 8,
  size: 13,
  sizeVariance: 9,
  distance: 18,
  distanceVariance: 12,
  life: 1600,
  lifeVariance: 600,
  driftAngle: -90, // Up
  driftAngleVariance: 20,
  driftDistance: 75,
  driftDistanceVariance: 30,
  // Variance close to (or exceeding) the base amplitude/frequency themselves is deliberate --
  // it's what makes some particles swirl noticeably more than others rather than all curling by
  // roughly the same amount.
  swirlAmplitude: 8,
  swirlAmplitudeVariance: 8,
  swirlFrequency: 2,
  swirlFrequencyVariance: 1.4,
  spawnWindow: 250,
};

// Module-level so the default is a stable reference across renders -- an inline `= {}` default
// parameter creates a brand new object every render, which would defeat `config`'s `useMemo`
// below every single time a caller omits the `particles` prop (the common case).
const EMPTY_PARTICLE_CONFIG: Partial<ParticleConfig> = {};

export const ParticleSystem = React.memo(
  ({
    count = 18,
    onComplete,
    particles = EMPTY_PARTICLE_CONFIG,
  }: ParticleSystemProps) => {
    const config = useMemo(
      () => ({ ...defaultParticles, ...particles }),
      [particles],
    );

    const createParticle = useCallback((): Particle => {
      const particleSize = getRandomValue(config.size, config.sizeVariance);
      const angle = Math.random() * Math.PI * 2;
      const particleDistance = getRandomValue(
        config.distance,
        config.distanceVariance,
      );

      // Calculate drift direction and distance
      const driftAngle = degreesToRadians(
        getRandomValue(config.driftAngle, config.driftAngleVariance),
      );
      const driftDistance = getRandomValue(
        config.driftDistance,
        config.driftDistanceVariance,
      );
      const perpAngle = driftAngle + Math.PI / 2;

      const baseColor =
        config.colors && config.colors.length > 0
          ? config.colors[Math.floor(Math.random() * config.colors.length)]
          : config.color;

      return {
        id: Math.random(),
        originX: Math.cos(angle) * particleDistance,
        originY: Math.sin(angle) * particleDistance,
        size: particleSize,
        color: getRandomColor(baseColor, config.colorVariance),
        driftX: Math.cos(driftAngle) * driftDistance,
        driftY: Math.sin(driftAngle) * driftDistance,
        perpX: Math.cos(perpAngle),
        perpY: Math.sin(perpAngle),
        life: getRandomValue(config.life, config.lifeVariance),
        swirlAmplitude: getRandomValue(
          config.swirlAmplitude,
          config.swirlAmplitudeVariance,
        ),
        swirlFrequency: getRandomValue(
          config.swirlFrequency,
          config.swirlFrequencyVariance,
        ),
        swirlPhase: Math.random() * Math.PI * 2,
        spawnDelay: Math.random() * config.spawnWindow,
      };
    }, [config]);

    // Lazy initializer -- runs exactly once per mount. The previous render-time
    // `if (particleState.length === 0) setParticleState(...)` check forced a wasted extra render
    // pass on every mount, and (combined with `ParticleSystem` never actually calling `onComplete`,
    // fixed below) meant a still-mounted instance from an earlier celebration never regenerated
    // fresh particles for a later one. Sorted by `spawnDelay` once here so the staggering effect
    // below can just walk the array in order rather than re-sorting on every run.
    const [particleState] = useState<Particle[]>(() =>
      Array.from({ length: count }, createParticle).sort(
        (a, b) => a.spawnDelay - b.spawnDelay,
      ),
    );

    // Particles don't all render on the first frame -- each is revealed at its own `spawnDelay`,
    // giving a short generation burst instead of the whole shape popping in at once. `particleState`
    // is already sorted by `spawnDelay`, so revealing "the first N" as their timers fire is enough;
    // no per-particle visibility set needed.
    const [visibleCount, setVisibleCount] = useState(0);
    useEffect(() => {
      const timeouts = particleState.map((particle, index) =>
        setTimeout(
          () => setVisibleCount((v) => Math.max(v, index + 1)),
          particle.spawnDelay,
        ),
      );
      return () => timeouts.forEach(clearTimeout);
    }, [particleState]);

    // Reanimated's own animation-completion callbacks aren't reliable enough to drive real control
    // flow on Android (the same lesson `TaskCard`'s completion-pop animation learned the hard way --
    // see CLAUDE.md). So instead of waiting on each particle's own `withTiming` to report it's done,
    // fire `onComplete` once, deterministically, after the worst-case total lifetime has elapsed --
    // the latest a particle could still be spawning (`spawnWindow`) plus its own worst-case life --
    // long enough that every particle is guaranteed to have finished fading out.
    useEffect(() => {
      const maxLife = config.spawnWindow + config.life + config.lifeVariance;
      const timeout = setTimeout(() => onComplete?.(), maxLife);
      return () => clearTimeout(timeout);
      // Deliberately mount-only: this timer represents this specific mounted instance's one
      // lifetime, not something that should reset if `config`/`onComplete` happen to change.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <>
        {particleState.slice(0, visibleCount).map((particle) => (
          <ParticleComponent key={particle.id} particle={particle} />
        ))}
      </>
    );
  },
);

ParticleSystem.displayName = "ParticleSystem";
