import { AudioPlayer, createAudioPlayer } from 'expo-audio';
import { useSettingsStore } from '../stores/settingsStore';

export type SimpleSoundEffect = 'completionPop' | 'streakSizzle' | 'achievementChime' | 'cardFlip';

// completionPop/streakSizzle/achievementChime are user-supplied cinematic audio, not
// redistributable library assets -- see TODO.md's "Sounds" entry for provenance notes before
// swapping or regenerating any of these. cardFlip is synthesized locally (filtered-noise swell,
// deliberately quiet -- see TODO.md).
const SIMPLE_SOURCES: Record<SimpleSoundEffect, number> = {
  completionPop: require('../../assets/sounds/completion-pop.wav'),
  streakSizzle: require('../../assets/sounds/streak-sizzle.wav'),
  achievementChime: require('../../assets/sounds/achievement-chime.wav'),
  cardFlip: require('../../assets/sounds/card-flip-swoosh.wav'),
};

// Created lazily (not at module load) so importing this file has zero side effects for anything
// that never actually plays a sound (e.g. tests). One long-lived player per source, reused for
// every play -- short UI sound effects are triggered far more often than they'd be worth
// creating/tearing down a player for.
const players = new Map<number, AudioPlayer>();

const getPlayer = (source: number): AudioPlayer => {
  let player = players.get(source);
  if (!player) {
    player = createAudioPlayer(source);
    players.set(source, player);
  }
  return player;
};

const playSource = (source: number): void => {
  if (!useSettingsStore.getState().soundEffectsEnabled) return;
  try {
    const player = getPlayer(source);
    // Rewind first so rapid re-triggers (e.g. completing several habits in a row) always play
    // from the start instead of overlapping a still-finishing previous playthrough silently.
    player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    // Swallow -- a missing/denied audio session should never crash or block whatever animation
    // triggered this.
  }
};

// Fire-and-forget by design, called from animation callbacks (press-and-hold completion, the
// streak fire celebration, the achievement alert's mount) that have nothing useful to do with a
// playback promise or failure. Reads the settings flag imperatively (not a hook) so this can be
// called from plain callbacks and Reanimated-adjacent `setTimeout`s, not just component bodies.
export const playSoundEffect = (effect: SimpleSoundEffect): void => {
  playSource(SIMPLE_SOURCES[effect]);
};

// Two cinematic variants for the full-celebration impact, alternating on each unlock rather than
// always playing the same one (2026-08-19, per direct request -- "for now, let's have it
// alternate between the two"). Each has its own `hitOffsetMs`: where its own internal
// build-into-hit actually lands, measured from the file's own start, since the two clips were
// generated independently and don't share a timing structure. AchievementCelebration.tsx uses
// this to line the hit up with TrophyBadge's own touchdown moment rather than just starting
// playback at a fixed offset, which would only work for one of the two.
const CELEBRATION_IMPACT_VARIANTS: { source: number; hitOffsetMs: number }[] = [
  { source: require('../../assets/sounds/celebration-impact.wav'), hitOffsetMs: 530 },
  { source: require('../../assets/sounds/celebration-impact-2.wav'), hitOffsetMs: 1056 },
];
let nextCelebrationImpactIndex = 0;

// Picks the next variant in rotation and returns how long the caller should wait before playing
// it so that variant's own internal hit lands at `targetHitTimeMs` (measured on the same clock
// the caller schedules its own timer from -- see AchievementCelebration.tsx). Clamped to 0 when a
// variant's build-up is longer than the time actually available before the visual touchdown --
// there's no way to start a sound in the past, so that variant's hit will land a bit late instead.
export const prepareCelebrationImpact = (targetHitTimeMs: number): { delayMs: number; play: () => void } => {
  const variant = CELEBRATION_IMPACT_VARIANTS[nextCelebrationImpactIndex];
  nextCelebrationImpactIndex = (nextCelebrationImpactIndex + 1) % CELEBRATION_IMPACT_VARIANTS.length;
  const delayMs = Math.max(0, targetHitTimeMs - variant.hitOffsetMs);
  return { delayMs, play: () => playSource(variant.source) };
};
