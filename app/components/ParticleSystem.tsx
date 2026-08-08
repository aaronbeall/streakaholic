import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
import tinycolor from 'tinycolor2';

interface Particle {
  id: number;
  originX: number;
  originY: number;
  size: number;
  color: string;
  driftX: number;
  driftY: number;
  life: number;
}

interface ParticleConfig {
  color: string;
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
      easing: Easing.bezier(0.4, 0, 0.2, 1)
    });
    // Deliberately fires once per mount only -- `particle` is a stable object created once by
    // `createParticle`, and re-running this on every parent re-render (it used to depend on a
    // `life` value recomputed fresh in the parent's `.map()` each time) restarted the fade/drift
    // animation mid-flight instead of letting it play through.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Split from the animated style below -- these never change over the particle's life, so
  // there's no reason to rebuild them on the UI thread every frame `progress` ticks.
  const staticStyle = useMemo(() => ({
    position: 'absolute' as const,
    left: 0,
    top: 0,
    width: particle.size,
    height: particle.size,
    borderRadius: particle.size / 2,
    backgroundColor: particle.color
  }), [particle]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: particle.originX + particle.driftX * (1 - progress.value) },
      { translateY: particle.originY + particle.driftY * (1 - progress.value) },
      { scale: progress.value },
    ],
    opacity: progress.value
  }));

  return <Reanimated.View style={[staticStyle, animatedStyle]} />;
});

ParticleComponent.displayName = 'ParticleComponent';

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
  color: '#FF6B6B',
  colorVariance: 10,
  size: 12,
  sizeVariance: 8,
  distance: 15,
  distanceVariance: 10,
  life: 1000,
  lifeVariance: 500,
  driftAngle: -90, // Up
  driftAngleVariance: 0, // 30 degrees
  driftDistance: 50,
  driftDistanceVariance: 20
};

// Module-level so the default is a stable reference across renders -- an inline `= {}` default
// parameter creates a brand new object every render, which would defeat `config`'s `useMemo`
// below every single time a caller omits the `particles` prop (the common case).
const EMPTY_PARTICLE_CONFIG: Partial<ParticleConfig> = {};

export const ParticleSystem = React.memo(({
  count = 12,
  onComplete,
  particles = EMPTY_PARTICLE_CONFIG
}: ParticleSystemProps) => {
  const config = useMemo(() => ({ ...defaultParticles, ...particles }), [particles]);

  const createParticle = useCallback((): Particle => {
    const particleSize = getRandomValue(config.size, config.sizeVariance);
    const angle = Math.random() * Math.PI * 2;
    const particleDistance = getRandomValue(config.distance, config.distanceVariance);

    // Calculate drift direction and distance
    const driftAngle = degreesToRadians(getRandomValue(config.driftAngle, config.driftAngleVariance));
    const driftDistance = getRandomValue(config.driftDistance, config.driftDistanceVariance);

    return {
      id: Math.random(),
      originX: Math.cos(angle) * particleDistance,
      originY: Math.sin(angle) * particleDistance,
      size: particleSize,
      color: getRandomColor(config.color, config.colorVariance),
      driftX: Math.cos(driftAngle) * driftDistance,
      driftY: Math.sin(driftAngle) * driftDistance,
      life: getRandomValue(config.life, config.lifeVariance)
    };
  }, [config]);

  // Lazy initializer -- runs exactly once per mount. The previous render-time
  // `if (particleState.length === 0) setParticleState(...)` check forced a wasted extra render
  // pass on every mount, and (combined with `ParticleSystem` never actually calling `onComplete`,
  // fixed below) meant a still-mounted instance from an earlier celebration never regenerated
  // fresh particles for a later one.
  const [particleState] = useState<Particle[]>(() => Array.from({ length: count }, createParticle));

  // Reanimated's own animation-completion callbacks aren't reliable enough to drive real control
  // flow on Android (the same lesson `TaskCard`'s completion-pop animation learned the hard way --
  // see CLAUDE.md). So instead of waiting on each particle's own `withTiming` to report it's done,
  // fire `onComplete` once, deterministically, after the worst-case total particle lifetime has
  // elapsed -- long enough that every particle is guaranteed to have finished fading out.
  useEffect(() => {
    const maxLife = config.life + config.lifeVariance;
    const timeout = setTimeout(() => onComplete?.(), maxLife);
    return () => clearTimeout(timeout);
    // Deliberately mount-only: this timer represents this specific mounted instance's one
    // lifetime, not something that should reset if `config`/`onComplete` happen to change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {particleState.map(particle => (
        <ParticleComponent key={particle.id} particle={particle} />
      ))}
    </>
  );
});

ParticleSystem.displayName = 'ParticleSystem'; 