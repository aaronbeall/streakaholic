import React, { useCallback, useEffect, useMemo, useState } from "react";
import Reanimated, {
  Easing,
  interpolateColor,
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
  // Each particle's own color shifts from a hot start to a deeper/cooler end over its life
  // (see `ParticleComponent`'s `interpolateColor` usage) rather than staying fixed -- so both
  // the core and glow need a start/end pair instead of one static color.
  colorStart: string;
  colorEnd: string;
  glowColorStart: string;
  glowColorEnd: string;
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
  // Hand-picked [hot, cooled] color pairs -- each particle picks one whole pair at random (then
  // still applies `colorVariance` lighten/darken jitter to each end) rather than a start color
  // being computed into an end color algorithmically. Curated pairs let the cooled end shift hue
  // (toward a deeper, almost-black red/maroon) rather than just getting darker at the same hue,
  // which reads as a much more dramatic hot-to-cool transition than a plain `darken()` produced.
  colorPairs: [string, string][];
  // Same idea for the glow layer -- its own [strong, weak] pairs, deliberately separate from
  // `colorPairs` so the glow doesn't have to match its own particle's core exactly.
  glowColorPairs: [string, string][];
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
  // When provided, particles spawn scattered across a capsule (a line segment thickened by
  // `radius`, like a pill/stadium shape) instead of the default radial ring -- a much closer
  // match to a rounded badge's own shape than a rectangle, whose corners would otherwise read as
  // blocky against a round source. `start`/`end`/coordinates are relative to `ParticleSystem`'s
  // own position, same coordinate space the radial `distance`/`driftAngle` spread already used.
  // Falls back to the radial spread if omitted, so a caller that doesn't supply one still gets a
  // sensible burst.
  spawnArea?: {
    start: { x: number; y: number };
    end: { x: number; y: number };
    radius: number;
  };
}

// React Native has no additive/`plus` blend mode for plain Views (that needs a GPU canvas lib
// like react-native-skia, a much bigger dependency/architecture change) -- this fakes a glow
// instead: a larger, dimmer, same-colored circle rendered behind each particle. Not a true blur
// (no blur filter is applied, just a bigger soft-edged circle at low opacity), but cheap and
// close enough at this size/scale to read as a warm halo.
const GLOW_SIZE_MULTIPLIER = 2.2;
const GLOW_OPACITY_CAP = 0.35;
// A particle now pops in at this size (fast) rather than appearing instantly at full size --
// see `growth` below. Short relative to `life` (1000ms+), so it reads as a quick "spawn" beat
// before the normal drift/shrink/fade takes over, not a separate visible phase of its own.
const GROWTH_DURATION = 70;
// How much faster the hot->cool color transition runs than the overall life/opacity fade --
// 1.6 means color finishes shifting to its cooled end at ~63% of life, while the particle's
// still fairly opaque, rather than the reddest color only ever landing right as it vanishes.
const COLOR_SHIFT_SPEED = 1.6;

const ParticleComponent = React.memo(({ particle }: { particle: Particle }) => {
  const progress = useSharedValue(1);
  // Independent of `progress` (which drives the whole drift/shrink/fade/color countdown) --
  // this only ramps the particle's *scale* in from 0, in parallel with `progress`'s own decay
  // starting immediately. Since `GROWTH_DURATION` is a small fraction of `life`, drift/swirl are
  // still negligible (`t` is still tiny) by the time growth finishes, so visually the particle
  // reads as "grow in, then drift off and die out" without needing to delay the main countdown.
  const growth = useSharedValue(0);

  React.useEffect(() => {
    growth.value = withTiming(1, {
      duration: GROWTH_DURATION,
      easing: Easing.out(Easing.cubic),
    });
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

  // The wrapper carries position+scale for the whole particle+glow group, sized to match the
  // particle itself (not the glow) so the shared transform-origin (center of this box) lines up
  // with where the solid particle's own center always was -- keeps the particle shrinking toward
  // its own center exactly as before, with the glow (offset to share that same center, see below)
  // riding along with it rather than introducing its own drift.
  const wrapperStaticStyle = useMemo(
    () => ({
      position: "absolute" as const,
      left: 0,
      top: 0,
      width: particle.size,
      height: particle.size,
    }),
    [particle],
  );

  // Split from the animated styles below -- size/position/shape never change over the particle's
  // life, so there's no reason to rebuild them on the UI thread every frame `progress` ticks.
  // `backgroundColor` isn't here -- it shifts hot-to-cool over life, so it lives in the animated
  // styles below instead.
  const staticStyle = useMemo(
    () => ({
      position: "absolute" as const,
      left: 0,
      top: 0,
      width: particle.size,
      height: particle.size,
      borderRadius: particle.size / 2,
    }),
    [particle],
  );

  const glowStaticStyle = useMemo(() => {
    const glowSize = particle.size * GLOW_SIZE_MULTIPLIER;
    const glowOffset = (glowSize - particle.size) / 2;
    return {
      position: "absolute" as const,
      // Centered on the same point as the particle itself despite being bigger.
      left: -glowOffset,
      top: -glowOffset,
      width: glowSize,
      height: glowSize,
      borderRadius: glowSize / 2,
    };
  }, [particle]);

  const wrapperAnimatedStyle = useAnimatedStyle(() => {
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
        { scale: growth.value * progress.value },
      ],
    };
  });

  // A fast, subtle shimmer layered on top of the main fade -- real embers flicker rather than
  // dimming perfectly smoothly. Bounded well short of 1 so it only ever modulates the fade
  // envelope, never brightens past it. Computed independently for the particle and its glow
  // (rather than once in the shared wrapper style above) since each needs its own opacity cap.
  // Also carries the hot-to-cool color shift -- `interpolateColor` runs on the UI thread as part
  // of this same worklet, right alongside the swirl/flicker math already happening here every
  // frame, so it's not adding a meaningfully new category of work.
  //
  // Uses `cos` and varies *frequency* (not phase offset) per particle via `swirlPhase` -- that
  // guarantees `flicker` is exactly 1 at `t = 0` for every particle regardless of its random
  // phase, so opacity always starts at a true 100% (matching growth being size-only, not an
  // opacity fade-in too) while still flickering at a per-particle-unique rate after that.
  const particleAnimatedStyle = useAnimatedStyle(() => {
    const t = 1 - progress.value;
    const flicker = 0.85 + 0.15 * Math.cos(t * (18 + particle.swirlPhase * 2));
    // Reaches its cooled end color well before `t` hits 1 (i.e. before life is fully over and
    // opacity has faded to nothing) -- otherwise the reddest part of the transition only ever
    // lands right as the particle is already vanishing, and barely reads as red at all.
    const colorT = Math.min(t * COLOR_SHIFT_SPEED, 1);
    return {
      opacity: progress.value * flicker,
      backgroundColor: interpolateColor(
        colorT,
        [0, 1],
        [particle.colorStart, particle.colorEnd],
      ),
    };
  });

  const glowAnimatedStyle = useAnimatedStyle(() => {
    const t = 1 - progress.value;
    const flicker = 0.85 + 0.15 * Math.cos(t * (18 + particle.swirlPhase * 2));
    const colorT = Math.min(t * COLOR_SHIFT_SPEED, 1);
    return {
      opacity: progress.value * flicker * GLOW_OPACITY_CAP,
      backgroundColor: interpolateColor(
        colorT,
        [0, 1],
        [particle.glowColorStart, particle.glowColorEnd],
      ),
    };
  });

  return (
    <Reanimated.View style={[wrapperStaticStyle, wrapperAnimatedStyle]}>
      <Reanimated.View style={[glowStaticStyle, glowAnimatedStyle]} />
      <Reanimated.View style={[staticStyle, particleAnimatedStyle]} />
    </Reanimated.View>
  );
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
  // Hand-picked rather than computed. Per explicit user direction, the hot/birth end skews
  // bright yellow (a deliberate reversal of the earlier "no yellow" call -- that was about a
  // flat yellow-heavy palette across every particle at all times, not a birth-only flash), with
  // a few pairs starting more orange/red-orange instead for reddish variation right at birth.
  // The cooled/death end skews deep red -- a real hue shift, not just a darker version of the
  // same hot color -- but a *vivid, readable* red (not near-black): the previous near-black ends
  // (`#8B0000`/`#4A0404`/etc.) coincided with the particle already being nearly transparent by
  // the time it fully cooled, so the red barely read as red at all. See `COLOR_SHIFT_SPEED`
  // above too -- these ends are also now reached earlier in life, while still fairly opaque.
  colorPairs: [
    ["#FFEB3B", "#D32F2F"], // bright yellow -> vivid red
    ["#FFD700", "#C62828"], // gold -> deep red
    ["#FFC107", "#B71C1C"], // amber -> dark red
    ["#FFA500", "#E53935"], // orange -> vivid red (reddish birth)
    ["#FF6B00", "#C62828"], // vivid orange -> deep red (reddish birth)
    ["#FF4500", "#B71C1C"], // orange-red -> dark red (most reddish birth)
  ],
  // The glow stays a mix of oranges and reds -- complementing whatever yellow-to-red shade its
  // own particle is showing, rather than matching it exactly. Its cooled ends used to go
  // near-black (`#4A0404`/`#3B0000`/etc.) -- per explicit user direction, opacity alone should
  // handle the fade-out, so these now land on the same *deep-red, still-readable* territory
  // `colorPairs` above already settled on, not darker.
  glowColorPairs: [
    ["#FF8C00", "#C62828"], // orange -> deep red
    ["#FF6B00", "#B71C1C"], // vivid orange -> dark red
    ["#FF4500", "#D32F2F"], // orange-red -> vivid red
    ["#FF3B1F", "#C62828"], // red-orange -> deep red
    ["#D50000", "#B71C1C"], // vivid red -> dark red
    ["#B22222", "#B71C1C"], // firebrick -> dark red
  ],
  // Bumped from 8 -- with the wider hue spread across `colorPairs` now doing most of the visual
  // work, a bit more per-particle jitter reads as "healthy variance" rather than washing anything
  // out. Still applied on top of each end of a chosen pair above, not the source of the hot/cool
  // shift itself.
  colorVariance: 10,
  // Down from the pre-glow 13/9, but not as far down as the first pass (7/5, which read as too
  // small) -- with the glow layer added, the solid "core" reads better a bit smaller than before,
  // just not shrunk this much.
  size: 9,
  sizeVariance: 6,
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
  // Widened from 250 per explicit user direction ("spread out a bit more") -- particles now
  // trickle in over a longer window instead of arriving in a tighter burst.
  spawnWindow: 450,
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
    spawnArea,
  }: ParticleSystemProps) => {
    const config = useMemo(
      () => ({ ...defaultParticles, ...particles }),
      [particles],
    );

    const hasSpawnArea = !!spawnArea && spawnArea.radius > 0;

    const createParticle = useCallback((): Particle => {
      const particleSize = getRandomValue(config.size, config.sizeVariance);

      // Origin is either a point scattered across the `spawnArea` capsule (a parent's own
      // rounded shape, e.g. `TaskCard`'s streak badge) or, absent that, the original radial
      // spread -- a random angle/distance around this component's own position. Both are a fixed,
      // one-time computation per particle at creation, not a per-frame cost either way.
      let originX: number;
      let originY: number;
      if (hasSpawnArea) {
        // Pick a random point along the capsule's line segment, then a random point within a
        // disk of `radius` around it -- `sqrt` on the radius fraction is the standard trick for
        // sampling a disk *uniformly by area* (without it, points would bunch up near the center
        // instead of spreading evenly all the way to the edge).
        const t = Math.random();
        const baseX = spawnArea!.start.x + (spawnArea!.end.x - spawnArea!.start.x) * t;
        const baseY = spawnArea!.start.y + (spawnArea!.end.y - spawnArea!.start.y) * t;
        const offsetAngle = Math.random() * Math.PI * 2;
        const offsetRadius = spawnArea!.radius * Math.sqrt(Math.random());
        originX = baseX + Math.cos(offsetAngle) * offsetRadius;
        originY = baseY + Math.sin(offsetAngle) * offsetRadius;
      } else {
        const angle = Math.random() * Math.PI * 2;
        const particleDistance = getRandomValue(
          config.distance,
          config.distanceVariance,
        );
        originX = Math.cos(angle) * particleDistance;
        originY = Math.sin(angle) * particleDistance;
      }

      // Calculate drift direction and distance
      const driftAngle = degreesToRadians(
        getRandomValue(config.driftAngle, config.driftAngleVariance),
      );
      const driftDistance = getRandomValue(
        config.driftDistance,
        config.driftDistanceVariance,
      );
      const perpAngle = driftAngle + Math.PI / 2;

      const pickColorPair = (pairs: [string, string][]) =>
        pairs[Math.floor(Math.random() * pairs.length)];

      const [coreHot, coreCool] = pickColorPair(config.colorPairs);
      const [glowHot, glowCool] = pickColorPair(config.glowColorPairs);

      // `colorVariance` still adds a little per-particle jitter on top of each authored hue --
      // the hot-to-cool *shift* itself, though, comes entirely from the picked pair, not a
      // computed lighten/darken.
      const colorStart = getRandomColor(coreHot, config.colorVariance);
      const colorEnd = getRandomColor(coreCool, config.colorVariance);
      const glowColorStart = getRandomColor(glowHot, config.colorVariance);
      const glowColorEnd = getRandomColor(glowCool, config.colorVariance);

      return {
        id: Math.random(),
        originX,
        originY,
        size: particleSize,
        colorStart,
        colorEnd,
        glowColorStart,
        glowColorEnd,
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
    }, [config, hasSpawnArea, spawnArea]);

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
