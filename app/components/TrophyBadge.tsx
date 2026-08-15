import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import tinycolor from 'tinycolor2';
import { MaterialCommunityIconName } from '../types';
import { ParticleSystem } from './ParticleSystem';

// A dressed-up, continuously-alive medallion for AchievementCelebration's screen -- replaces the
// earlier static rotating-ray emblem with something with more going on: a concentric frame,
// outward-pulsing sonar rings, a sweeping glass sheen, a gentle bob, and periodic sparkle bursts.
// Deliberately its own component (not inlined in AchievementCelebration) since it's a fully
// self-contained animated unit -- everything here starts on mount and loops for as long as it
// stays mounted, with no props controlling *when* things happen beyond the icon/color it's given.

const BADGE_SIZE = 120;
// Exported so callers (AchievementCelebration's fixed emblem slot) can reserve exactly this much
// layout space without duplicating the number.
export const TROPHY_BADGE_STACK_SIZE = 260;
const STACK_SIZE = TROPHY_BADGE_STACK_SIZE;
const GLOW_SIZE = 200;

// The white rim used to be a plain RN `borderWidth`/`borderColor` on the face circle itself -- but
// a border is drawn by the native layer as a single uniform color with no paintable child region of
// its own, so there's no way to independently shade *half* of it. Per explicit user direction ("a
// pseudo flat shadow style... emblem circle, emblem border ring, banner base... each, use it as a
// mask for a shadow"), the ring became a genuine second shape instead: an outer white circle
// (`badgeRing`, BADGE_SIZE) with the face (`badgeFace`, inset by RING_WIDTH on each side) nested
// centered inside it -- the same visual result as the old border (a BADGE_SIZE white circle with a
// smaller colored circle centered on top, leaving a RING_WIDTH-wide white band showing around the
// edge), just as two independently paintable shapes instead of one shape plus a border property.
const RING_WIDTH = 4;
const BADGE_FACE_SIZE = BADGE_SIZE - RING_WIDTH * 2;

// The "pseudo flat shadow" overlay used on all three shaded shapes (badgeRing, badgeFace,
// ribbonBarClip): a plain solid-color square, oversized relative to whatever shape it's clipped
// within, rotated by SHADOW_ANGLE_DEGREES and offset so that (after rotation) one of its own edges
// passes exactly through the parent's center -- the parent's own `overflow: 'hidden'` + shape then
// does all the actual clipping, so the same one style works for a circle, a ring, or a rectangle
// without any shape-specific path math (no SVG needed for this, despite react-native-svg being
// available elsewhere in this app -- a plain rotated View is simpler and this codebase already uses
// the exact same "oversized rotated rectangle, let overflow:hidden clip it" technique for the sheen
// bars above).
//
// The offset derivation, generalized to an arbitrary angle (an earlier version only handled the
// fixed 45° case): a square of side L, rotated by angle θ about its own center C, has its "top"
// edge (the one whose un-rotated outward normal points straight up) passing through target point T
// exactly when C = T + (L/2)·(-sinθ, cosθ) -- derived by writing that edge's line equation after
// rotation and solving for where it crosses T. Converting that center offset into the
// `marginTop`/`marginLeft` this style actually needs (offset of the square's own *corner*, since
// `top/left: '50%'` positions the corner, not the center, and rotation happens *after* that
// positioning, about the element's own center): corner = C - (L/2, L/2), giving
// `marginTop = (L/2)·(cosθ - 1)` and `marginLeft = -(L/2)·(sinθ + 1)`. `SHADOW_ANGLE_DEGREES` is
// negative -- confirmed numerically (a throwaway script checking which cardinal points land inside
// the resulting shape) that a *negative* angle here is what leans the shadow toward the lower-right
// (matching "light from the upper-left", the direction already established and approved at the
// original fixed 45°) rather than the lower-left; the sign is not obvious from the formula alone,
// so this was verified rather than assumed -- flipping it is the easy mistake to make here, same as
// the original 45°-only derivation's own center-offset sign (also caught only by verifying).
const SHADOW_ANGLE_DEGREES = -20; // brought down from an initial 45°, per direct follow-up ("more
// horizontally flat... still angled, just not a full 45 degrees")
const SHADOW_ANGLE_RADIANS = (SHADOW_ANGLE_DEGREES * Math.PI) / 180;
const SHADOW_OVERLAY_SIZE = 260;
const SHADOW_OVERLAY_MARGIN_TOP = (SHADOW_OVERLAY_SIZE / 2) * (Math.cos(SHADOW_ANGLE_RADIANS) - 1);
const SHADOW_OVERLAY_MARGIN_LEFT = -(SHADOW_OVERLAY_SIZE / 2) * (Math.sin(SHADOW_ANGLE_RADIANS) + 1);
// Since `top/left: '50%'` on `diagonalShadowOverlay` centers the boundary line on whatever parent
// it's placed in, the ribbon banner (a short rectangle) gets its line through its own vertical
// middle same as the much taller badge shapes do -- reading as "about half the banner shadowed."
// Per direct follow-up ("the banner shadow should be lower"), this pushes the ribbon's own boundary
// line down by this many px (added to SHADOW_OVERLAY_MARGIN_TOP just for that one instance, not the
// shared style itself) -- a pure vertical translation before rotation shifts the resulting line down
// by exactly this amount regardless of the rotation angle, so it's a simple additive offset rather
// than needing its own re-derivation. Left the badge's ring/face shadows at the shared style's
// default (vertically centered) -- this was specifically about the banner.
const RIBBON_SHADOW_VERTICAL_OFFSET = 6;
// How much darker than the base color each shadowed half reads -- one shared amount for all three
// shapes (the ring's white, the face/banner's own passed-in `color`) so the "flat shading" reads as
// one consistent light source across the whole medallion rather than each shape inventing its own.
// Brought down from an initial 18 (then 12) per two rounds of direct follow-up asking for it more
// subtle still.
const SHADOW_DARKEN_AMOUNT = 9;

// Static concentric rings framing the badge -- each a bit larger and fainter than the last so the
// badge reads as centered inside a medallion rather than floating alone. Not animated in the sense
// of looping, but they do burst into being at IMPACT_DELAY (see BurstRing below) rather than
// simply appearing on mount.
const FRAME_RINGS = [
  { sizeOffset: 14, borderWidth: 2, opacity: 0.45 },
  { sizeOffset: 30, borderWidth: 1.5, opacity: 0.28 },
  { sizeOffset: 48, borderWidth: 1, opacity: 0.16 },
];

// Sonar-style pulse rings: three staggered instances of the same loop, offset ~1.5s apart, so a
// fresh ring appears to spawn every second and a half even though each individual ring's own
// grow-and-fade takes considerably longer than that to finish (duration kept at 3x the stagger,
// same ratio as before, so there are always ~3 rings visible at once regardless of the pace).
const PULSE_POOL = [0, 1, 2];
const PULSE_STAGGER = 1500;
const PULSE_DURATION = PULSE_STAGGER * 3;
const PULSE_MIN_SIZE = BADGE_SIZE;
const PULSE_MAX_SIZE = BADGE_SIZE * 3;
const PULSE_MAX_BORDER = 8;
const PULSE_MIN_BORDER = 1;
const PULSE_MAX_OPACITY = 0.65;

// A single explosive shockwave ring, distinct from the ambient looping PulseRing pool above --
// fires exactly once at impact rather than repeating, starts thick and close to the badge's own
// size, then expands dramatically past even the halo's own GLOW_SIZE before thinning to a hairline
// and fading out. Per explicit user direction: "starts VERY thick, scales to much larger than the
// emblem, even larger than the glow, with aggressive eases out (start fast, ends slow) and fade to
// 1px line... a sort of shock wave."
const SHOCKWAVE_MIN_SIZE = BADGE_SIZE;
// Trimmed down twice now -- an initial BADGE_SIZE * 4 (480), then BADGE_SIZE * 3.5 (420) per one
// round of "a little less large," then this, BADGE_SIZE * 3 (360), per a second direct follow-up
// ("make the final size even smaller"). Still clears GLOW_SIZE (200) by a healthy margin -- the
// one explicit "even larger than the glow" requirement from the original ask -- and lands exactly
// at the ambient PulseRing pool's own PULSE_MAX_SIZE (360) rather than past it.
const SHOCKWAVE_MAX_SIZE = BADGE_SIZE * 3;
// "Essentially a full circle" at the very start, per direct follow-up -- a ring's inner opening
// (its own "hole") has diameter `size - 2*borderWidth`, so a border of exactly `size / 2` closes
// that hole to nothing, reading as a solid filled disc rather than a ring. Derived from
// SHOCKWAVE_MIN_SIZE (not a hardcoded number) so the two stay geometrically consistent if either
// ever changes -- this replaces the two prior fixed values (26, then 32) entirely, since neither
// was ever meant to be "solid," just "thick."
const SHOCKWAVE_START_BORDER = SHOCKWAVE_MIN_SIZE / 2;
const SHOCKWAVE_END_BORDER = 1; // "fade to 1px line"
// Bumped from an initial 0.8 to full opacity, per direct follow-up ("start out full opacity") --
// still fades to 0 by the end (opacity = SHOCKWAVE_MAX_OPACITY * (1 - progress)), just starts at a
// true 1 instead of already partway faded at frame one.
const SHOCKWAVE_MAX_OPACITY = 1;
// Lengthened twice now -- an initial 800, then 1050 per one round of "lasts a bit longer," then
// this, 1400, per a second direct follow-up ("the duration even longer").
const SHOCKWAVE_DURATION = 1400;
// "Aggressive eases out (start fast, ends slow)" -- a plain `Easing.out(Easing.cubic)` already has
// that shape; `Easing.poly(n)` (Reanimated's generic power easing) pushes it further the higher `n`
// goes, per this file's own established "higher poly power = more dramatic" convention (see
// SHEEN_EASING's own comment above for the poly(n) confirmation against Easing.ts's source). Bumped
// from an initial poly(4) (quartic) to poly(5) (quintic) per direct follow-up ("a little more
// aggressive ease out"), one step further up the same quad->cubic->quart->quint progression.
const SHOCKWAVE_EASING = Easing.out(Easing.poly(5));

const ShockwaveRing: React.FC<{ color: string }> = ({ color }) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: SHOCKWAVE_DURATION, easing: SHOCKWAVE_EASING });
    // Fires once on mount (this component is only ever mounted once, at IMPACT_DELAY -- see
    // TrophyBadge's own showShockwave state) -- no repeat, no delay of its own to configure here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => {
    const size = SHOCKWAVE_MIN_SIZE + (SHOCKWAVE_MAX_SIZE - SHOCKWAVE_MIN_SIZE) * progress.value;
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      borderWidth: SHOCKWAVE_START_BORDER - (SHOCKWAVE_START_BORDER - SHOCKWAVE_END_BORDER) * progress.value,
      opacity: SHOCKWAVE_MAX_OPACITY * (1 - progress.value),
    };
  });

  return <Reanimated.View style={[styles.pulseRingBase, { borderColor: color }, style]} />;
};

const BOB_RANGE = 7;
const BOB_DURATION = 1500;

// The shimmer is two independently-timed loops -- one sweeping the badge's own full face, one
// sweeping (in the opposite/"reversed" direction) just the ribbon banner's rectangle -- rather
// than one shared "phase" value driving both in sequence, which an earlier version used. That
// sequential design meant the ribbon sweep only ever started once the badge sweep had fully
// finished; per direct follow-up ("the shimmer over the banner is delayed too long, it should
// start sooner even if that means there's overlap with the stage 1 shimmer"), the two are now
// separate `withTiming` loops sharing the *same* sweep duration and pause (so their relative
// timing offset stays fixed forever, cycle after cycle, rather than drifting), but the ribbon's own
// starts RIBBON_START_OFFSET after the badge's -- comfortably less than SHEEN_SWEEP_DURATION, so
// the two genuinely overlap rather than one waiting for the other. Both still target their own
// element (the badge's full face vs. the ribbon's clipped rectangle, `ribbonBarClip` -- not its two
// triangular tail tips), so it still reads as a two-part shimmer, just no longer strictly
// sequential. The badge's own loop starts at IMPACT_DELAY (defined further below) into the drop-in
// sequence -- the moment the badge first touches down, the same trigger the frame rings/halo burst
// already use, rather than either the full DROP_DURATION settle (an earlier version's requirement,
// since relaxed) or an arbitrary intermediate delay. Per two rounds of direct follow-up asking for
// it to start progressively sooner ("shouldn't start until the emblem has come to a rest" ->
// "should start sooner in the overall dropin animation sequence" -> "start sooner in the intro
// animation" still), tying it to the same impact instant everything else already keys off is both
// the earliest *meaningful* moment available and keeps the shimmer synchronized with the rings/halo
// burst rather than needing its own separately-tuned delay constant.
const SHEEN_SWEEP_DURATION = 2600;
const SHEEN_PAUSE = 2400;
// Based on BADGE_FACE_SIZE (the actual clipped circle the sheen sweeps within), not the outer
// BADGE_SIZE -- the face shrank slightly once the ring became its own separate shape (see
// BADGE_FACE_SIZE's own comment above). Brought way down from an earlier 1.6x per direct follow-up
// ("it starts and ends far outside the circle... a significant portion of the animation is
// completely unseen") -- 1.6x sent the bar to nearly double the face's own radius away from center
// on each side, so most of the sweep's (now quite long, 2600ms) duration played out entirely
// off-clip, invisible. 0.75x keeps the bar's own nearest edge only a small buffer past the circle's
// actual radius at full extension (roughly radius + half the sheen's own 28px width + a little
// slack for its 20° rotation), so the sweep starts/ends just outside the visible edge instead of far
// beyond it.
const SHEEN_TRAVEL = BADGE_FACE_SIZE * 0.75;
// A stronger, more dramatic ease than the original `Easing.inOut(Easing.quad)` (then briefly
// `Easing.inOut(Easing.cubic)`) -- per direct follow-up asking for it to read even more dramatic
// still ("a long slow start and tail and quick pass over"). `Easing.poly(n)` is Reanimated's
// generic power easing (`t^n`); there's no built-in named "quart"/"quint" the way `quad`/`cubic`
// are named, but `poly(5)` is exactly quintic (confirmed directly against Easing.ts's own doc
// comment: "N = 4: easeInQuart, N = 5: easeInQuint"). Wrapped in `Easing.inOut`, a higher power
// spends proportionally *more* of the duration near both endpoints (the "slow start and tail") and
// less near the midpoint (the "quick pass over") than a lower one like cubic does -- exactly the
// shape being asked for, just taken further up the same quad->cubic->quart->quint progression.
const SHEEN_EASING = Easing.inOut(Easing.poly(5));
// How much later (from the badge sweep's own start) the ribbon sweep begins -- well under
// SHEEN_SWEEP_DURATION (1800ms) so the two loops genuinely overlap rather than the ribbon only
// ever starting once the badge sweep has already finished.
const RIBBON_START_OFFSET = 500;
// The ribbon sheen's own geometry -- much smaller than the badge's, since ribbonBarClip is a
// short/wide rectangle, not a 120px circle. Deliberately generous (taller/wider than any realistic
// ribbon text) since ribbonBarClip's own overflow:hidden clips away whatever doesn't fit -- there's
// no cost to over-covering, only to under-covering and leaving a gap at the ribbon's own edges.
const RIBBON_SHEEN_WIDTH = 16;
const RIBBON_SHEEN_HEIGHT = 70;
const RIBBON_SHEEN_TRAVEL = 80;
// Roughly ribbonBarClip's own real content height (paddingVertical * 2 + the text's line height) --
// used only to vertically center the much-taller sheen bar over it; doesn't need to be exact, since
// the bar is already far taller than the ribbon itself.
const RIBBON_ESTIMATED_HEIGHT = 24;

// The badge+ribbon "drops in from the camera" -- starts high up, large, and rotated (as if close
// to the viewer, tumbling), then falls to its resting position, shrinking toward its normal scale
// as it "gets farther from the camera," and bounces against that resting position a couple of
// decaying times before coming to rest, rather than landing in one smooth motion.
//
// The key fix that makes this actually read as a physical bounce (an earlier version applied the
// bounce curve to *scale* alone, which just wobbled the badge's size and looked wonky, with no
// sense of "hitting a surface"): the bounce curve has to drive *position* (translateY), since a
// bounce is fundamentally a vertical motion -- an object approaching a floor, rebounding off it,
// approaching again with less energy, etc. Scale and rotation are then derived from that same
// `drop` progress (both settle toward their resting value as `drop` -> 1), so the badge
// convincingly shrinks/untumbles *while* falling and gets a touch bigger again on each small
// rebound (further from the "surface" = momentarily closer to camera again) -- one shared value
// driving a physically coherent motion, rather than three independently-timed animations.
//
// Also worth getting right: `Easing.bounce` (bare) is already Penner's "bounceOut" shape -- a
// smooth rise for the initial fall, then three decreasing-amplitude dip-and-recover bounces
// clustered near t=1 as it settles. Wrapping it in `Easing.out(...)` (`1 - easing(1-t)`) flips
// that, putting the bounce texture at the *start* instead and a smooth landing at the end -- the
// opposite of what "bounces against the surface until it comes to rest" needs. Use `Easing.bounce`
// directly, not `Easing.out(Easing.bounce)`.
const DROP_DURATION = 1200;
const DROP_START_OFFSET_Y = -120; // how far above its resting spot the badge starts, in px
const DROP_START_SCALE = 2.4;
const DROP_START_ROTATION = 28; // degrees

// The frame rings/glow/pulse rings are all inert while the badge is still falling -- they burst
// outward the moment it first touches down, rather than sitting there statically from the very
// first frame (which read as disconnected from the fall/impact). `IMPACT_DELAY` is when the bounce
// curve first reaches its resting value, i.e. the very first touchdown, before the rebounds --
// Penner's bounceOut spends the first 1/2.75 of its duration on a smooth, bounce-free rise, so
// that's the moment the badge actually "hits."
const IMPACT_DELAY = Math.round(DROP_DURATION / 2.75);
// Both the frame rings and the halo burst via genuine spring physics, not an eased withTiming,
// specifically because they need to "continue to bounce back and forth... like a rubber band"
// (explicit user direction) rather than a single overshoot-and-settle -- and, per a direct
// follow-up ("the rings don't seem to wobble as long as the halo... it should wobble just as
// long"), they now share this *exact* config rather than the rings using a gentler, shorter-lived
// one. `stiffness` sets how fast each oscillation cycle runs; `damping` *relative to* `stiffness`
// sets the damping ratio `ζ = damping / (2·√(stiffness·mass))`, which is what actually governs how
// many cycles stay visible before the motion dies out -- the same damping/stiffness relationship
// already tuned and documented elsewhere in this codebase for a punchier, faster effect
// (TaskProgressIcon's completion pop, `damping: 23, stiffness: 1000`, ζ≈0.38); this config goes
// much further in the opposite direction (ζ≈0.15) for a genuinely long, wobbly multi-swing effect.
//
// An earlier version of this config (ζ≈0.37, close to TaskProgressIcon's own ratio) only produced
// one visible overshoot-and-undershoot before settling -- reported directly ("about 1 overshoot,
// 1 undershoot, then it's resting... I want at least 3 or 4"). The number of visible cycles before
// a spring decays to some fraction of its initial amplitude is `ln(1/fraction) / (2π·ζ)` --
// independent of stiffness, so more visible wobbles genuinely requires a *lower* damping ratio, not
// just a slower stiffness. But percent overshoot for a step response is `exp(-ζ·π/√(1-ζ²)) × 100%`
// -- and that formula means a low-enough ζ to get several visible cycles (≈3+) also necessarily
// produces a *large* first-peak overshoot (well past 50%) -- these two aren't independently
// tunable the way "several gentle wobbles" might suggest; a spring physically can't decay slowly
// (many cycles) without also swinging far on its very first cycle (same reason a real rubber band's
// first snap-back is its biggest). Accepted here as physically honest rather than fought against,
// since it's also literally the effect being asked for ("like a rubber band you release").
const BURST_SPRING_CONFIG = { damping: 2.1, stiffness: 50, mass: 1, energyThreshold: 0.0004 };
// Percent overshoot is a fraction of however far the spring has to *travel* (its step size), not
// an absolute cap -- so a low-enough damping ratio to get several visible wobbles (ζ≈0.15, per the
// comment above) reads as "ridiculous... balloony" when the step is the full 0 -> 1 range (reported
// directly: overshoots to ~200%, then dips small enough to hide behind the badge), but reads as a
// tight, fast "wiggle near the size it will rest at" -- a real rubber band's actual character, per
// explicit user direction -- once the step itself is small. So neither the halo nor the frame rings
// animate from scale 0 and grow into view; per the user's own suggestion ("you do not need to have
// the halo circle start small... perhaps it starts near final size but the elasticity gives it a
// lot of bounciness"), both start already close to their resting size (`BURST_START_SCALE`) and the
// *same* wobbly spring only has this short remaining distance to travel and overshoot/undershoot
// around -- same wobble count and speed either way, but a swing of roughly +-10% of final size
// instead of +-65%. Visibility is handled by mounting each element at its own trigger moment (see
// TrophyBadge's showHalo/visibleRingCount state) rather than by animating from scale 0, since 0.8
// isn't a small enough scale to read as "invisible" on its own.
const BURST_START_SCALE = 0.8;
// A spring has no fixed duration (it runs until its own physics settle), but the pulsate phase
// still needs *some* wall-clock estimate of when the burst is "done" so it knows when to start --
// see useBurstThenPulsate. This doesn't drive the actual spring in any way, it's purely scheduling;
// being off by a few hundred ms just shifts exactly when pulsation visibly begins, not whether
// anything snaps or glitches, so it doesn't need to be exact. ~3 cycles to decay to 5% at this
// config's period (~0.89s/cycle) puts real settle time around 2.7-3s -- shared by the rings too,
// now that they use the same spring config and are expected to wobble for the same length of time.
const BURST_SETTLE_ESTIMATE = 3000;
// Each frame ring bursts a beat after the one inside it, so they read as a ripple expanding
// outward from the point of impact rather than all three popping in at once.
const BURST_RING_STAGGER = 90;

// Once a burst settles at scale 1, it doesn't just sit still -- it eases into a slow, subtle,
// continuous breathing loop (scale oscillating a few percent above and below rest) rather than
// going completely static, per explicit user direction. Shared by the halo and the frame rings
// (see useBurstThenPulsate below) so both "come to the resting pulsating state" the same way.
const PULSATE_AMPLITUDE = 0.045; // +/-4.5% scale
const PULSATE_HALF_CYCLE_DURATION = 2300; // one direction of the breathe; a full cycle is 2x this
// The pulsation phase used to start in near-lockstep across the halo and all three rings (their
// burst-phase stagger is only tens of ms, negligible next to the breathe cycle) -- reported
// directly as "all in sync... I want them to be staggered, creating more of a ripple effect".
// This offsets each element's *pulsate* phase separately from its burst-phase stagger, in the same
// halo-then-ring-0-1-2 order the burst ripple itself already uses, so the ripple motif continues
// into the idle state instead of stopping once everything's landed.
const PULSATE_STAGGER = 800;

const SPARKLE_COUNT = 6;
const SPARKLE_PAUSE = 1300;
// Deliberately sparse and understated relative to ParticleSystem's own fire-themed defaults --
// small, short-lived, barely-drifting flecks that read as a twinkle rather than a burst. No
// swirl -- these should feel like they're glinting in place, not flying off anywhere. Colors are
// now a function of the badge's own `accentColor` (a kind-specific highlight tone, e.g. a warm
// gold spark for the Fire family, an icy cyan spark for Diamond) rather than a fixed white/gold
// pair -- ties the twinkle into each kind's own theme instead of one look for every kind.
const getSparkleConfig = (accentColor: string) => ({
  colorPairs: [['#FFFFFF', accentColor], [accentColor, '#FFFFFF']] as [string, string][],
  glowColorPairs: [['#FFFFFF', accentColor], [accentColor, '#FFFFFF']] as [string, string][],
  colorVariance: 6,
  size: 4,
  sizeVariance: 2,
  // Widened per direct follow-up ("bigger spawn radius") from an initial BADGE_SIZE/2 + 14 (a
  // tight ring just past the coin's own edge) -- now spans roughly the halo/outer-frame-ring
  // territory (GLOW_SIZE's own radius is 100, the outermost frame ring's is ~108) instead of
  // hugging the coin, so the twinkle reads as scattered across the whole medallion's aura.
  distance: BADGE_SIZE / 2 + 50,
  distanceVariance: 30,
  life: 700,
  lifeVariance: 300,
  driftAngleVariance: 180,
  driftDistance: 12,
  driftDistanceVariance: 10,
  swirlAmplitude: 0,
  swirlAmplitudeVariance: 0,
  swirlFrequency: 0,
  swirlFrequencyVariance: 0,
  spawnWindow: 500,
});

// Two *independent* shared values combined into one final scale, rather than one value with the
// burst and the pulsate chained onto it via withSequence -- an earlier version did that and it
// visibly snapped at the start of every pulsate cycle. Traced why directly against Reanimated's
// own withRepeat source (repeat.ts): with `reverse: false`, each repeat doesn't continue from
// wherever the wrapped animation currently sits -- it explicitly resets to that animation's
// *original* starting value before replaying it. A two-leg withSequence (up, then down) ends each
// cycle at the "down" value, so the next cycle's reset-to-original-start was a real, visible jump
// back up, every single loop. `bob` above avoids this because it wraps a single withTiming with
// `reverse: true`, a genuinely different (and snap-free) code path where each repeat continues
// from the current value and just swaps the animation's own start/end -- so pulsate is now built
// the exact same proven way, as a second oscillating value, rather than trying to force the
// two-leg approach to not snap.
//
// `burst` handles just the pop-in (`initialScale` -> 1, via `burstAnimation` -- both the halo and
// the frame rings pass `BURST_START_SCALE`, see its own comment for why; the `0` default here just
// covers the general case) and then sits still forever once settled -- it's never itself asked to
// keep animating. `pulse` is a completely separate 0<->1
// oscillator (bob's exact pattern) that starts `pulseDelay` after mount and runs forever; the two
// are multiplied together in a derived value, so pulse's tiny wobble only becomes visible once
// burst has actually reached ~1 (multiplying by a still-small burst value keeps it negligible
// beforehand) without the two needing to be causally chained through a single shared value at all.
const useBurstThenPulsate = (
  delay: number,
  burstAnimation: () => number,
  burstDuration: number,
  pulsateDelay: number = 0,
  initialScale: number = 0
) => {
  const burst = useSharedValue(initialScale);
  const pulse = useSharedValue(0);

  useEffect(() => {
    burst.value = withDelay(delay, burstAnimation());
    pulse.value = withDelay(
      delay + burstDuration + pulsateDelay,
      withRepeat(withTiming(1, { duration: PULSATE_HALF_CYCLE_DURATION, easing: Easing.inOut(Easing.sin) }), -1, true)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useDerivedValue(() => burst.value * (1 + (pulse.value - 0.5) * 2 * PULSATE_AMPLITUDE));
};

const PulseRing: React.FC<{ delay: number; color: string }> = ({ delay, color }) => {
  const progress = useSharedValue(0);
  // `progress`'s own resting value (0, before its delayed animation below actually starts) is NOT
  // a safely-invisible frame -- by design, progress=0 is a pulse ring's *most visible* moment
  // (full size, full opacity, thickest border, right before it starts expanding and fading). Left
  // alone, that meant every ring sat there fully visible, statically, for the entire `delay`
  // window before its first real cycle kicked off -- a real bug (reported directly: "I see a
  // single ring circle behind where the emblem drops... the surface should be completely clean
  // initially"), not just an unpolished edge. `active` gates visibility independently of
  // `progress`'s own value: 0 (fully transparent, regardless of what progress is doing) until
  // `delay` elapses, then an instant flip to 1.
  const active = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: PULSE_DURATION, easing: Easing.out(Easing.cubic) }), -1, false)
    );
    active.value = withDelay(delay, withTiming(1, { duration: 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => {
    const size = PULSE_MIN_SIZE + (PULSE_MAX_SIZE - PULSE_MIN_SIZE) * progress.value;
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      borderWidth: PULSE_MAX_BORDER - (PULSE_MAX_BORDER - PULSE_MIN_BORDER) * progress.value,
      opacity: PULSE_MAX_OPACITY * (1 - progress.value) * active.value,
    };
  });

  return <Reanimated.View style={[styles.pulseRingBase, { borderColor: color }, style]} />;
};

// One frame ring. Not mounted at all until TrophyBadge's visibleRingCount reaches its index (the
// same "mount = start" pattern Halo uses, below, rather than an in-component Reanimated delay), so
// its spring starts fresh, already close to resting size, the instant it appears -- see
// BURST_START_SCALE's own comment for why. Opacity is a plain, unanimated style at the ring's own
// full designed value, since mounting already handles visibility; there's nothing for a separate
// opacity fade to add.
const BurstRing: React.FC<{ ring: (typeof FRAME_RINGS)[number]; color: string; pulsateDelay: number }> = ({
  ring,
  color,
  pulsateDelay,
}) => {
  const burst = useBurstThenPulsate(0, () => withSpring(1, BURST_SPRING_CONFIG), BURST_SETTLE_ESTIMATE, pulsateDelay, BURST_START_SCALE);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: Math.max(0, burst.value) }],
  }));

  const size = BADGE_SIZE + ring.sizeOffset * 2;
  return (
    <Reanimated.View
      style={[
        styles.frameRing,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ring.borderWidth,
          borderColor: color,
          opacity: ring.opacity,
        },
        style,
      ]}
    />
  );
};

// The big filled background circle -- same mount-gated, near-final-size spring approach as
// BurstRing above (they were split into two components mainly because a ring needs its own
// `ring`/size props and the halo doesn't, not because their animation differs anymore).
const Halo: React.FC<{ color: string }> = ({ color }) => {
  const halo = useBurstThenPulsate(0, () => withSpring(1, BURST_SPRING_CONFIG), BURST_SETTLE_ESTIMATE, 0, BURST_START_SCALE);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: Math.max(0, halo.value) }],
  }));

  return <Reanimated.View style={[styles.glow, { backgroundColor: color }, style]} />;
};

interface TrophyBadgeProps {
  icon: MaterialCommunityIconName;
  // The coin itself -- face fill, ring-shadow tint, ribbon banner, and (via getRibbonText's text
  // color) icon. Kept vivid/saturated enough to stay legible under the ribbon's white text -- see
  // `glowColor`/`accentColor` for the rest of the three-color set.
  color: string;
  // The medallion's surrounding aura -- the outer two frame rings, halo glow, and sonar pulse
  // rings -- kept deliberately distinct from `color` (the coin itself) per explicit user direction
  // to build a real three-color (base/glow/accent) scheme rather than one flat color for the whole
  // badge. Optional, falls back to `color`, so a caller with only a single color to give still
  // gets a sensible (if monotone) result.
  glowColor?: string;
  // A brighter/paler highlight reserved for small sparkle-scale detail -- the twinkling particle
  // sparkles and the innermost frame ring -- rather than any large filled area (most accent picks
  // are deliberately light/desaturated relative to their own `color`, so using one as a big fill
  // would read as washed out). Optional, falls back to `color`.
  accentColor?: string;
  // A short, all-caps label rendered on a ribbon banner across the lower third of the badge, like
  // a medal's engraving -- a count for kinds with a meaningful number (e.g. "10 DAYS", "100 DONE"),
  // a short non-numeric word for the one kind that doesn't (e.g. "COMEBACK" for comeback). Required,
  // not optional -- per explicit user direction every badge always shows a ribbon now, so it's the
  // caller's job (see AchievementCelebration's getRibbonText) to always have *something* to put on
  // it, not this component's job to gracefully omit one.
  ribbonText: string;
}

// Wrapped in React.memo (2026-08-13, a performance-review finding) -- every prop here is a plain
// string, stable across re-renders unless the achievement itself actually changes, so this alone
// stops CelebrationContent's own count-up-driven re-renders (see AchievementCelebration.tsx's
// useCountUp, which ticks up to ~60/sec for 1-3s) from cascading into this component's own large,
// deeply-nested animation tree (frame rings, halo, shockwave, pulse rings, ribbon, sparkles) --
// none of which actually needs to re-render on every tick, since nothing here reads `count` at
// all. The underlying Reanimated animations were never at risk of glitching either way (they run
// on the UI thread via shared values, unaffected by JS-thread re-renders), this was purely wasted
// reconciliation work.
export const TrophyBadge: React.FC<TrophyBadgeProps> = React.memo(({ icon, color, glowColor, accentColor, ribbonText }) => {
  const glow = glowColor ?? color;
  const accent = accentColor ?? color;
  // Memoized (2026-08-13) -- previously a fresh object every render, which defeated
  // ParticleSystem's own React.memo (a new `particles` prop reference always reads as "changed"
  // to its shallow comparison, regardless of the actual field values). Low-impact now that
  // TrophyBadge itself is memoized above (it won't spuriously re-render in the first place), but
  // kept as a direct, cheap belt-and-suspenders fix at the actual point of the object allocation.
  const sparkleConfig = useMemo(() => getSparkleConfig(accent), [accent]);
  // The "shaded half" color for each of the two flat-shadowed shapes -- the ring is now
  // `accent`-colored (its own "circle border" role, see AchievementMeta.color's own comment) and
  // the face/ribbon banner both share `color` (base), so each gets its own darkened shadow tint
  // computed from its own real fill rather than always darkening white. No memoization -- `color`/
  // `accent` are stable for this component's whole lifetime (see TrophyBadge's own established
  // pattern elsewhere), so this is a one-time computation regardless.
  const ringShadowColor = tinycolor(accent).darken(SHADOW_DARKEN_AMOUNT).toHexString();
  const faceShadowColor = tinycolor(color).darken(SHADOW_DARKEN_AMOUNT).toHexString();

  const bob = useSharedValue(0);
  // Two independent loops (see the SHEEN_* constants' own comment above for why) -- each starts
  // (and idles, during its own pause) at 0, which each style's own math below maps to that
  // element's own travel distance off to one side -- already outside its own clipped bounds, so no
  // separate opacity toggle is needed to hide either bar between cycles.
  const badgePhase = useSharedValue(0);
  const ribbonPhase = useSharedValue(0);
  const drop = useSharedValue(0);
  const [sparkleKey, setSparkleKey] = useState(0);
  // The halo and each frame ring mount (rather than animating in from scale 0) at their own
  // trigger moment -- see Halo/BurstRing's own comments for why. visibleRingCount counts up 0->3
  // as each ring's own staggered moment arrives, mirroring PulseRing's own "reveal one at a time"
  // approach elsewhere in this file.
  const [showHalo, setShowHalo] = useState(false);
  const [visibleRingCount, setVisibleRingCount] = useState(0);
  // The shockwave is a one-shot burst (unlike the halo/frame rings, which then settle into an idle
  // pulsate loop) -- mounting it at IMPACT_DELAY is enough on its own, no ongoing state needed
  // beyond "has it appeared yet."
  const [showShockwave, setShowShockwave] = useState(false);
  // Gates the *first* appearance of the sparkle burst -- per direct follow-up ("it shouldn't
  // appear until after the whole intro animation has completed"), sparkles used to mount (and
  // start spawning, staggered over their own spawnWindow) from frame one, well before the badge
  // had even finished falling. `DROP_DURATION` is the exact moment `drop`'s own withTiming
  // finishes -- not just IMPACT_DELAY (the first touchdown, before the decaying rebounds -- what
  // the frame rings/halo/shimmer all key off, since those are meant to burst in reaction to
  // impact) but the point the whole bounce sequence has fully settled to rest, matching "the
  // whole intro animation" rather than just its first beat. Once shown, the periodic re-burst
  // cycle (sparkleKey / handleSparkleComplete below) is unaffected -- this only delays the start.
  const [showSparkles, setShowSparkles] = useState(false);

  useEffect(() => {
    bob.value = withRepeat(withTiming(1, { duration: BOB_DURATION, easing: Easing.inOut(Easing.sin) }), -1, true);
    // Starts at IMPACT_DELAY -- see the SHEEN_SWEEP_DURATION comment above for why this (not the
    // full DROP_DURATION settle) is the shimmer's own start point.
    //
    // Both loops share this exact same sweep-then-pause shape (only their own starting delay
    // differs, via the extra `RIBBON_START_OFFSET` on the ribbon's), which is what keeps them
    // offset by a fixed amount forever rather than drifting apart cycle to cycle.
    const sheenLoop = () =>
      withRepeat(
        withSequence(
          withTiming(1, { duration: SHEEN_SWEEP_DURATION, easing: SHEEN_EASING }),
          withDelay(SHEEN_PAUSE, withTiming(0, { duration: 0 }))
        ),
        -1,
        false
      );
    badgePhase.value = withDelay(IMPACT_DELAY, sheenLoop());
    ribbonPhase.value = withDelay(IMPACT_DELAY + RIBBON_START_OFFSET, sheenLoop());
    drop.value = withTiming(1, { duration: DROP_DURATION, easing: Easing.bounce });
    const haloTimer = setTimeout(() => setShowHalo(true), IMPACT_DELAY);
    const ringTimers = FRAME_RINGS.map((_, i) =>
      setTimeout(() => setVisibleRingCount(count => Math.max(count, i + 1)), IMPACT_DELAY + i * BURST_RING_STAGGER)
    );
    const shockwaveTimer = setTimeout(() => setShowShockwave(true), IMPACT_DELAY);
    const sparkleTimer = setTimeout(() => setShowSparkles(true), DROP_DURATION);
    return () => {
      clearTimeout(haloTimer);
      clearTimeout(shockwaveTimer);
      ringTimers.forEach(clearTimeout);
      clearTimeout(sparkleTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSparkleComplete = useCallback(() => {
    setTimeout(() => setSparkleKey(k => k + 1), SPARKLE_PAUSE);
  }, []);

  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (bob.value - 0.5) * 2 * BOB_RANGE }],
  }));

  // The badge's own full-face sweep: -TRAVEL -> +TRAVEL over its own [0,1] loop.
  const badgeSheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (badgePhase.value * 2 - 1) * SHEEN_TRAVEL }, { rotate: '20deg' }],
  }));

  // The ribbon's own sweep, on its own independently-delayed [0,1] loop (see RIBBON_START_OFFSET)
  // -- mapped in the *opposite* direction from the badge's (+TRAVEL -> -TRAVEL, scaled to the
  // ribbon's own much smaller travel distance) so it still reads as "reversed" relative to it, even
  // though the two are no longer mathematically continuous the way a single shared phase would be.
  const ribbonSheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - ribbonPhase.value * 2) * RIBBON_SHEEN_TRAVEL }, { rotate: '20deg' }],
  }));

  const dropStyle = useAnimatedStyle(() => {
    // `remaining` is how far from "settled" the badge still is (1 at the very start, 0 once fully
    // at rest) -- translateY, scale, and rotation are all just this one quantity scaled into each
    // property's own start/end range, so a bounce's rebound (remaining briefly ticking back up)
    // moves the badge up *and* a little bigger *and* a little more rotated all together, reading
    // as one coherent physical motion instead of three separately-timed ones.
    const remaining = 1 - drop.value;
    const translateY = DROP_START_OFFSET_Y * remaining;
    const scale = 1 + (DROP_START_SCALE - 1) * remaining;
    const rotate = DROP_START_ROTATION * remaining;
    return { transform: [{ translateY }, { scale }, { rotate: `${rotate}deg` }] };
  });

  return (
    <Reanimated.View style={[styles.stack, bobStyle]}>
      {/* Innermost ring bursts first (index 0, no extra stagger), each successive one a beat
          later -- reads as a ripple expanding outward from the impact point. pulsateDelay
          continues that same ripple ordering (halo, then ring 0/1/2) into the idle breathing
          phase, offset by PULSATE_STAGGER per step -- see PULSATE_STAGGER's own comment. The
          innermost ring uses `accent` (a small sparkle-scale highlight, closest to the coin) while
          the outer two use `glow` (the broader aura) -- a deliberate two-tone split rather than
          one flat aura color for all three, per the base/glow/accent three-color scheme. */}
      {FRAME_RINGS.map((ring, i) => (
        <View key={ring.sizeOffset} style={styles.centeredFill}>
          {i < visibleRingCount && (
            <BurstRing ring={ring} color={i === 0 ? accent : glow} pulsateDelay={(i + 1) * PULSATE_STAGGER} />
          )}
        </View>
      ))}

      <View style={styles.centeredFill}>{showHalo && <Halo color={glow} />}</View>

      {/* The one-shot shockwave -- rendered after the halo/before the ambient pulse pool so it
          paints on top of the halo but underneath the badge itself, expanding outward from behind
          it. Uses `glow` (the aura color), matching the halo/outer frame rings' own role. */}
      <View style={styles.centeredFill}>{showShockwave && <ShockwaveRing color={glow} />}</View>

      {PULSE_POOL.map(i => (
        <View key={i} style={styles.centeredFill}>
          <PulseRing delay={IMPACT_DELAY + i * PULSE_STAGGER} color={glow} />
        </View>
      ))}

      <View style={styles.centeredFill}>
        <Reanimated.View style={dropStyle}>
          <View style={styles.badgeShadowWrap}>
            {/* The ring is now a genuine separate shape (not a border) specifically so it can carry
                its own flat-shadow overlay independent of the face's -- see RING_WIDTH/BADGE_FACE_SIZE's
                own comment above. */}
            <View style={[styles.badgeRing, { backgroundColor: accent }]}>
              <View style={[styles.diagonalShadowOverlay, { backgroundColor: ringShadowColor }]} />
              <View style={[styles.badgeFace, { backgroundColor: color }]}>
                <View style={[styles.diagonalShadowOverlay, { backgroundColor: faceShadowColor }]} />
                <MaterialCommunityIcons name={icon} size={66} color={accent} style={styles.badgeIcon} />
                <Reanimated.View style={[styles.sheen, badgeSheenStyle]} />
              </View>
            </View>
          </View>

          <View style={styles.ribbonRow}>
            <View style={[styles.ribbonTailLeft, { borderRightColor: color }]} />
            {/* Step 2 of the shimmer plays here, right after step 1 finishes on the badge above
                -- clipped to just this rectangle (ribbonBarClip), not the two triangular tail
                tips flanking it. Split into a shadow-carrying outer wrapper and an
                overflow:hidden inner clip for the same reason badgeShadowWrap/badgeRing are
                split -- Android's elevation-based shadow gets cut off by an overflow:hidden
                ancestor. */}
            <View style={styles.ribbonBarShadowWrap}>
              {/* A genuine drop shadow (shadowRadius/shadowOffset/elevation, on this View's own
                  wrapper) doesn't reliably spill *onto* the neighboring tail triangles -- those
                  iOS shadow properties don't affect Android at all (Android only reads
                  `elevation`, whose own shadow is known to stay tightly clipped to the casting
                  view's own bounds rather than genuinely extending over adjacent siblings). Per
                  direct follow-up ("I don't see any dropshadow of the central rectangle over top
                  of the triangles. That's part of what I want"), this is a deliberately explicit,
                  hand-drawn spill instead -- guaranteed to render identically on both platforms,
                  the same reasoning behind this file's other plain-View effects (the flat-shadow
                  overlays, the sheen bars) rather than depending on native shadow physics to
                  cooperate. */}
              <View style={styles.ribbonShadowSpill} pointerEvents="none" />
              <View style={[styles.ribbonBarClip, { backgroundColor: color }]}>
                {/* Pushed down from the shared style's default vertical centering -- see
                    RIBBON_SHADOW_VERTICAL_OFFSET's own comment above. */}
                <View
                  style={[
                    styles.diagonalShadowOverlay,
                    { backgroundColor: faceShadowColor, marginTop: SHADOW_OVERLAY_MARGIN_TOP + RIBBON_SHADOW_VERTICAL_OFFSET },
                  ]}
                />
                <Text style={styles.ribbonText}>{ribbonText}</Text>
                <Reanimated.View style={[styles.ribbonSheen, ribbonSheenStyle]} />
              </View>
            </View>
            <View style={[styles.ribbonTailRight, { borderLeftColor: color }]} />
          </View>
        </Reanimated.View>
      </View>

      {/* Deliberately NOT `centeredFill` here -- that style fills the *entire* STACK_SIZE box, so
          its own (0,0) top-left corner is the whole stack's corner, not its center. Each particle
          `ParticleSystem` renders is absolutely positioned with an explicit `left: 0, top: 0` (see
          ParticleComponent's own wrapperStaticStyle) plus a small originX/originY translate scattered
          *around* that (0,0) point -- so whatever box directly wraps `<ParticleSystem>` has to *be*
          the center point itself, not a box whose corner happens to coincide with one. A 0-sized box
          pinned at top/left: '50%' (no width/height, so it collapses to a point -- absolutely
          positioned children don't contribute to a parent's own intrinsic size) does exactly that:
          it sits at the stack's true center, the same point `centeredFill`'s alignItems/justifyContent
          already centers the badge/halo/rings on for their own (non-absolutely-positioned) children.
          Without this, the sparkle burst rendered clustered up near the stack's top-left corner
          instead of over the emblem+glow -- confirmed and fixed directly, not just theorized. */}
      <View style={styles.sparkleOrigin} pointerEvents="none">
        {showSparkles && (
          <ParticleSystem key={sparkleKey} count={SPARKLE_COUNT} particles={sparkleConfig} onComplete={handleSparkleComplete} />
        )}
      </View>
    </Reanimated.View>
  );
});
TrophyBadge.displayName = 'TrophyBadge';

const styles = StyleSheet.create({
  stack: {
    width: STACK_SIZE,
    height: STACK_SIZE,
  },
  centeredFill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A true single point at the stack's own center -- see the JSX comment at its one call site
  // (wrapping <ParticleSystem>) for why this has to be a zero-size point, not a `centeredFill`-style
  // box that merely centers its *non-absolute* children.
  sparkleOrigin: {
    position: 'absolute',
    top: '50%',
    left: '50%',
  },
  frameRing: {
    backgroundColor: 'transparent',
  },
  glow: {
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
    opacity: 0.3,
  },
  pulseRingBase: {
    backgroundColor: 'transparent',
  },
  badgeShadowWrap: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 10,
  },
  // Separate from badgeShadowWrap specifically so overflow:hidden (needed to clip the sheen sweep,
  // and now the ring's own shadow overlay) doesn't also clip the shadow above -- Android's
  // elevation-based shadow gets cut off by an overflow:hidden ancestor, a known RN quirk.
  //
  // The rim, formerly a `borderWidth`/`borderColor` on the face circle itself, is now this genuine
  // separate shape -- see RING_WIDTH's own comment for why (it needed to be independently
  // shadeable). `badgeFace` (below) nests centered inside it, inset by RING_WIDTH on each side, so
  // the visible result is a BADGE_SIZE ring (now `accent`-colored, see the JSX below -- its own
  // "circle border" role per AchievementMeta.color's own comment) with the smaller `color`-filled
  // face centered on top. `backgroundColor` set inline (per-instance, not here) rather than a
  // fixed white default.
  badgeRing: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Inverted contrast scheme, per direct user request to try flipping the prior "pale tinted face
  // + full-saturation accent icon" pairing: the face is now the raw, full-saturation `color`
  // itself (set inline, see the JSX below) with a *white* icon on top instead. This actually
  // matches the ribbon banner's own already-established scheme below (solid `color` bar + white
  // text) -- previously the face and ribbon disagreed (pale tint vs. solid fill), so this also
  // makes the whole medallion visually consistent rather than mixing two different light/dark
  // pairings.
  badgeFace: {
    width: BADGE_FACE_SIZE,
    height: BADGE_FACE_SIZE,
    borderRadius: BADGE_FACE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // The shared "pseudo flat shadow" overlay -- see SHADOW_ANGLE_DEGREES's own derivation above.
  // Reused as-is (only `backgroundColor` varies per instance) for badgeRing, badgeFace, and
  // ribbonBarClip -- the same oversized-rotated-square trick works for a circle, a ring, or a
  // rectangle without any shape-specific math, since the parent's own overflow:hidden + shape does
  // all the real clipping.
  diagonalShadowOverlay: {
    position: 'absolute',
    width: SHADOW_OVERLAY_SIZE,
    height: SHADOW_OVERLAY_SIZE,
    top: '50%',
    left: '50%',
    marginTop: SHADOW_OVERLAY_MARGIN_TOP,
    marginLeft: SHADOW_OVERLAY_MARGIN_LEFT,
    transform: [{ rotate: `${SHADOW_ANGLE_DEGREES}deg` }],
  },
  badgeIcon: {
    marginTop: -6,
  },
  // Brightened from a muted grey (rgba(160,160,160,...), tuned back when the face behind it was
  // flat white) to a cleaner translucent white -- a grey streak read as a dull smudge against the
  // new colored tint, where white reads more clearly as a glint of light crossing a polished coin.
  sheen: {
    position: 'absolute',
    top: -BADGE_FACE_SIZE * 0.6,
    left: BADGE_FACE_SIZE / 2 - 14,
    width: 28,
    height: BADGE_FACE_SIZE * 2.2,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  // A ribbon banner draped across the badge's lower third, like a medal's engraved tail --
  // negative marginTop pulls it up to overlap the circle rather than hanging fully below it.
  ribbonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20,
  },
  // Shadow-only -- no width/height, so it auto-sizes around ribbonBarClip's own intrinsic content
  // size (the text plus its padding) rather than needing a hardcoded pixel size the way
  // badgeShadowWrap can (BADGE_SIZE is fixed; the ribbon's text length isn't). Strengthened per
  // direct follow-up ("the central rectangle dropshadow needs to be stronger") -- opacity/radius/
  // offset/elevation all bumped up, though still well short of badgeShadowWrap's own much larger
  // values (that shadow is cast by a much bigger shape, so its own numbers were never meant as a
  // target to match, just a rough ceiling).
  ribbonBarShadowWrap: {
    zIndex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 7,
  },
  // Explicit, hand-drawn shadow-spill (see the JSX comment above `ribbonShadowSpill`'s usage for
  // why) -- a plain semi-transparent rectangle sized a bit larger than `ribbonBarClip` itself.
  // `ribbonBarShadowWrap`'s own `zIndex: 1` (relative to the triangle siblings outside it) is what
  // lets this render above them -- this view's own position within that wrapper doesn't need its
  // own zIndex for that, since z-index only competes among siblings sharing one parent, not across
  // nesting levels.
  //
  // Per direct follow-up ("I want it only casting from the central rectangle... tiny visible at
  // the top, a little on the left and right, a bit more on the bottom") -- an earlier version
  // extended left/right by the tail triangles' own full ~8px width, reaching all the way to their
  // tips; asymmetric per-edge extension reads more like a light source directly above casting a
  // shadow mostly downward, with only a hint spilling sideways and barely any upward, rather than
  // a uniform halo bleeding evenly in all directions. Rounded corners (`borderRadius`) per the same
  // follow-up, softening what would otherwise be a plain hard-edged rectangle.
  ribbonShadowSpill: {
    position: 'absolute',
    top: -0.5,
    bottom: -3,
    left: -2,
    right: -2,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  // Separate from ribbonBarShadowWrap for the exact same Android
  // overflow:hidden-clips-elevation-shadow reason badgeRing is split from badgeShadowWrap above --
  // this is what actually clips the ribbon's own sheen sweep and shadow overlay to just this
  // rectangle.
  ribbonBarClip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  ribbonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  ribbonSheen: {
    position: 'absolute',
    top: -(RIBBON_SHEEN_HEIGHT - RIBBON_ESTIMATED_HEIGHT) / 2,
    left: '50%',
    marginLeft: -RIBBON_SHEEN_WIDTH / 2,
    width: RIBBON_SHEEN_WIDTH,
    height: RIBBON_SHEEN_HEIGHT,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  // Classic border-triangle trick -- three of a zero-size box's four borders transparent, the
  // fourth colored, produces a triangle pointing away from the colored side. Gives the ribbon bar
  // a cut-tail silhouette without needing an SVG path.
  ribbonTailLeft: {
    width: 0,
    height: 0,
    borderTopWidth: 11,
    borderBottomWidth: 11,
    borderRightWidth: 8,
    borderLeftWidth: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    marginRight: -1,
  },
  ribbonTailRight: {
    width: 0,
    height: 0,
    borderTopWidth: 11,
    borderBottomWidth: 11,
    borderLeftWidth: 8,
    borderRightWidth: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    marginLeft: -1,
  },
});
