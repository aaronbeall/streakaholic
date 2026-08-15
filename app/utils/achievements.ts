import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns';
import { MaterialCommunityIconName, Task, TaskCompletion } from '../types';
import { calculateTaskStats, isDueOnDate, isTaskCompleted } from './streaks';
import { MAX_ACTIVE_TASKS } from './taskLimits';

// Achievement celebrations -- purely cosmetic collectibles for now (a future point system may
// hang off this same data, but isn't part of this feature).
export type AchievementKind =
  | 'first-completion'
  | 'streak-2' | 'streak-5' | 'streak-10' | 'streak-25' | 'streak-50' | 'streak-100' | 'streak-1000'
  | 'new-best-streak'
  | 'anniversary'
  | 'milestone-10' | 'milestone-50' | 'milestone-100' | 'milestone-1000'
  | 'century-club-100' | 'century-club-500' | 'century-club-1000'
  | 'perfect-day' | 'perfect-week'
  | 'comeback'
  | 'habit-collector'
  | 'early-bird' | 'night-owl';

export interface Achievement {
  id: string;
  kind: AchievementKind;
  // Absent for global kinds (first-completion, perfect-day) -- every task-scoped kind carries one.
  taskId?: string;
  // Snapshotted at earn time, not joined live against the current task list -- a trophy still
  // reads correctly even if the task that earned it is later renamed, recolored, or deleted.
  taskName?: string;
  taskIcon?: MaterialCommunityIconName;
  taskColor?: string;
  // The value driving the achievement's own description (a streak length, a completion count) --
  // not used for dedup itself, that's dedupScope's job.
  value?: number;
  // Uniquely identifies *what* this achievement instance is scoped to, e.g. `milestone-100:{taskId}`
  // or `perfect-day:2026-08-10` -- checked against already-earned achievements before recording a
  // new one, so a one-time kind can never be earned twice for the same scope. Repeatable kinds
  // still carry a scope (for grouping/display) but it's never checked for dedup.
  dedupScope: string;
  earnedAt: string; // ISO timestamp
}

// What detectCompletionAchievements returns -- everything about an achievement except the parts
// only the store can assign (a unique id, the exact moment it was actually recorded).
export type EarnedAchievement = Omit<Achievement, 'id' | 'earnedAt'>;

// ============================================================================================
// Everything below this point is the single source of truth for *how a kind behaves* -- what it
// looks like, how it's detected, and how "how close am I" is computed for the Trophy Case.
// Per explicit user direction ("I want to avoid having `kind` conditionally handled in code...
// instead I want the achievement meta to describe the achievement in ways that are fully
// dynamically handled downstream, so we can add new achievements without having to modify
// downstream code"), no file outside this one branches on a specific `AchievementKind` value --
// AchievementCelebration.tsx, TrophiesScreen.tsx, and TrophyBadge.tsx all read whichever fields
// they need off `ACHIEVEMENT_META[achievement.kind]` and dispatch on *data* (a strategy-type tag,
// a scope tag, or whether an achievement instance happens to have a `taskName`), never on `kind`
// itself.
//
// The one thing that's still inherently non-generic is *detecting a genuinely new kind of rule*
// (e.g. new-best-streak's specific "beat a real prior record" logic, or perfect-day's global
// across-every-task check) -- that's a new RULE, not a new data point in an existing pattern, and
// will always need its own bespoke code no matter how this is architected. What this design does
// eliminate is the much more common case: adding another *tier* of an existing pattern (e.g.
// streak-2/streak-5 alongside the existing streak-10/25/etc, added below) needs a single new
// ACHIEVEMENT_META entry and nothing else -- detection, celebration content, ribbon text, and
// Trophy Case progress all pick it up automatically, dispatched by *strategy type* (a small,
// stable, closed set of computation patterns) rather than by kind.

// How a kind's Trophy Case "how close" progress is computed -- a closed set of *patterns*, not
// one case per kind. A new kind that fits one of these needs no new downstream code at all; only
// a genuinely novel progress shape would need a new variant added here (still just one shared
// handler, not one per kind).
export type ProgressStrategy =
  // Progress = the closest not-yet-earned task's own `metric` stat, capped at `target`. Covers
  // first-completion and every streak-N/milestone-N tier -- the only difference between them is
  // which stat they read and what number they're aiming for.
  | { type: 'fixed-threshold'; metric: 'currentStreak' | 'totalCompletions'; target: number }
  // Progress = how close some task's current streak is to *tying* its own historical best (a
  // ratio, not a fixed target -- every task has a different record to beat).
  | { type: 'ratio-to-own-best' }
  // No numeric progress -- just whether the achievement could fire right now, per `isReady`.
  | { type: 'readiness'; isReady: (task: Task) => boolean }
  // Progress = today's own due-vs-completed fraction across every active task (global, not
  // per-task) -- live and re-evaluated every day, independent of whether it's ever been earned.
  | { type: 'today-progress' }
  // Progress = a task's own age (days since `createdAt`), capped at `target`'s equivalent
  // (`days`) -- unlike every other strategy here, this measures sheer elapsed time rather than
  // anything the user actively did, so it's not affected by streaks breaking/resetting at all.
  | { type: 'task-age'; days: number }
  // Progress = the current consecutive-perfect-day count ending today (every due, non-archived
  // task completed each of those days), capped at `days`. Covers perfect-week.
  | { type: 'perfect-day-streak'; days: number }
  // Progress = the live sum of `totalCompletions` across every active task, capped at `target` --
  // a global, cross-task aggregate rather than any single task's own stat. Covers the three
  // century-club-N tiers.
  | { type: 'total-completions-sum'; target: number }
  // Progress = the current number of active (non-archived) tasks, capped at `target`. Covers
  // habit-collector.
  | { type: 'active-task-count'; target: number }
  // Progress = how many of the most recent `window` completions (across every active task,
  // combined) fall before/after `hour` (in the device's own local time), against a target of
  // "at least half of them." Shared by early-bird (`direction: 'before'`) and night-owl
  // (`direction: 'after'`) -- the only two kinds using this strategy, distinguished purely by
  // their own parameters rather than needing two separate strategy types.
  | { type: 'time-of-day-ratio'; hour: number; direction: 'before' | 'after'; window: number; minSamples: number };

// How to word the ribbon banner on TrophyBadge's emblem -- either a live count with a fixed unit
// suffix ("10 DAYS", "100 DONE"), or a fixed word for a kind with no clean number to show ("PERFECT",
// "COMEBACK").
type RibbonSpec = { kind: 'count'; unit: string } | { kind: 'fixed'; text: string };

interface AchievementMeta {
  icon: MaterialCommunityIconName;
  title: string;
  // Plain/factual one-line description -- used by TrophiesScreen's card captions and
  // AchievementCelebration's own accessibility label, neither of which wants a whimsical tone
  // (see flavorText below for that).
  describe: (achievement: EarnedAchievement) => string;
  // Whether *the same task* can earn this exact kind more than once -- this is scoped per-task
  // (or, for a global kind, per-app), never across different tasks: a one-time kind still gets
  // earned independently by every task that qualifies for it (dedup is keyed by `${kind}:${scope}`,
  // and scope is the task's own id for any task-scoped kind), so "one-time" never means "only one
  // task can ever have this."
  //
  // first-completion (a single user-wide "you got started" moment, scope 'global') and anniversary
  // (a task can only turn 1 year old once) are one-time for genuinely structural reasons -- the
  // underlying event itself can only happen once. milestone-10/50/100/1000 (2026-08-12, per
  // explicit user direction) are also one-time, but for a softer reason: `totalCompletions` is a
  // lifetime counter that never un-crosses a threshold in normal use, so they were already
  // self-limiting even back when marked repeatable -- setting `repeatable: false` here just makes
  // that a hard guarantee (closing the one real edge case where it wasn't: undoing completions via
  // Undo can decrement totalCompletions, so without this a redo could theoretically re-cross the
  // same threshold a second time for the same task).
  //
  // Every other kind is genuinely repeatable in the sense that it can and does re-fire under
  // normal use: streak-10 can be earned again by the same task if its streak later resets and
  // re-climbs back to that length; new-best-streak fires on every fresh record; comeback fires on
  // every lapse-then-revival; perfect-day's own crossing-per-date dedup scope means a different
  // day can always independently re-trigger it. Drives ONE_TIME_KINDS below.
  repeatable: boolean;
  // Whether an earned instance of this kind is tied to the specific task that triggered it
  // ('task', the common case -- carries taskId/taskName/taskIcon/taskColor) or is a user/app-wide
  // milestone independent of which task happened to trigger it ('global', currently first-completion
  // and perfect-day -- carries no task identity at all). Drives both what gets attached to the
  // earned record and, for fixed-threshold kinds, what dedup scope is used (a fixed 'global' key
  // vs. per-task).
  scope: 'task' | 'global';
  // A short, witty/quippy reaction (AchievementCelebration's own tone, deliberately separate from
  // `describe` above) -- no task name, no numbers, no restating the technical condition; that's
  // triggerSuffix/triggerStandalone's job.
  flavorText: string;
  // The celebration screen's hero number block (eyebrow + huge animated count + unit caption).
  // Absent entirely for a kind with no meaningful number to lead with (comeback, first-completion)
  // -- the screen falls back to plain `title` instead.
  numberBlock?: { eyebrow: string; unit: string };
  ribbon: RibbonSpec;
  // The technical "what actually happened" sentence. Exactly one of these two should be set per
  // kind: `triggerSuffix` for a kind whose earned achievement has a `taskName` (the task becomes
  // the sentence's subject, this is just the tail: " reached a 10-day streak."); `triggerStandalone`
  // for a kind with no single task to lead with (first-completion, perfect-day) -- a complete
  // sentence on its own. Callers dispatch on whether the *achievement instance* actually has a taskName,
  // not on kind, so this still works correctly for a future taskless kind without new code.
  triggerSuffix?: (value: number) => string;
  triggerStandalone?: (value: number | undefined) => string;
  progressStrategy: ProgressStrategy;
  // The achievement's own visual identity, a three-color set per explicit user direction ("for
  // each one I want 3 colors: base, glow, and accent... use a thematic color scheme and make these
  // really pop") -- everywhere *except* a task's own inline name/icon within the celebration's
  // description text (see AchievementCelebration.tsx's DescriptionText, which colors that span
  // with the earning task's own `taskColor` instead). A kind's identity no longer varies by which
  // task happens to earn it -- two different tasks earning the same kind now render identically.
  //
  // `base` -- the coin/face itself and the ribbon banner (needs to stay vivid/saturated enough to
  // keep the ribbon's white text legible against it, so `accent`, however vivid, is still never
  // used as a background behind text anywhere). `glow` -- the surrounding aura: the celebration's
  // halo and the outer two frame/pulse rings, and the Trophy Case emblem's own static halo.
  // `accent` -- used for the coin's icon glyph and its own ring (the "circle border" -- the band
  // framing the face), plus the celebration's innermost frame ring and its twinkling particle
  // sparkles.
  //
  // A brief detour and reversal, worth recording: a WCAG-relative-luminance-contrast pass (see the
  // git history of this file for the throwaway script/table) measured real, sometimes severe,
  // contrast problems between `accent` and `base` on several kinds (Silver's own accent against
  // its steel base measured ~1.1:1) and re-picked every accent purely to maximize that number --
  // which, for the fire-length ladder specifically, meant abandoning its own warm palette for a
  // "blue-hot core" on the hottest tiers. Reverted per direct user feedback ("most of the streaks
  // looked better before") -- the streak ladder's colors (this whole doc comment's own repeated
  // subject) are the ones the user explicitly said they liked, so they're restored here close to
  // that earlier, warmer, more saturated set even though a couple of pairs (Raging Fire, Magic
  // Fire) measure under 2:1 by the same script -- a deliberate, informed tradeoff of measured
  // contrast for the actual preferred look, not an oversight. The milestone/exotic kinds (Bronze/
  // Silver/Gold/Diamond/Radiant Gold/Rebirth) keep their own `base` values completely untouched
  // through all of this (the user separately called these out as liked), with `glow`/`accent`
  // re-tuned to stay closer to each one's own real-world gem/metal sparkle (e.g. Bronze's accent a
  // warm copper-gold, Silver's an icy pale blue, Gold's a pale warm gold) rather than the earlier
  // pass's more contrast-optimized-than-thematic picks (a flat deep indigo shared across Gold/
  // Radiant Gold/Intense Fire/Raging Fire, chosen for contrast headroom, not because it fit any of
  // those four themes individually).
  //
  // Each kind maps to one hand-picked, named theme (not derived/shared across a whole family the
  // way an earlier version's flat single color, and later flat base/accent pair, both were) --
  // per explicit user direction, drawn from a real thematic vocabulary rather than an abstract
  // palette:
  // - The streak-*length* ladder (streak-2 through streak-1000) is a genuine escalating
  //   fire-intensity story, one *unique* theme per tier from streak-2 through streak-50 rather than
  //   one theme shared across two tiers (an earlier version paired 5/10 and 25/50 under the same
  //   two colors -- per explicit user direction each of 2/5/10/25/50 now gets its own distinct,
  //   still-escalating set): Fire (2) -> Intense Fire (5) -> Blazing Fire (10) -> Raging Fire (25)
  //   -> Inferno (50) -> Magic Fire (100, breaking from real flame colors into violet) -> Cosmic
  //   Fire (1000, electric magenta-violet, the ultimate tier). The original `first-streak` kind
  //   used to just mirror streak-2's exact colors (same real-world moment, global vs. per-task
  //   scope) but per explicit user direction was given its own Ruby gemstone theme instead -- see
  //   the gemstone bullet below (that theme has since carried over to `first-completion`, the kind
  //   that replaced `first-streak` entirely -- see that entry's own comment for why).
  //
  //   Every regular-fire tier (Fire through Inferno) follows one consistent rule discovered by
  //   direct comparison after a specific complaint ("Raging Fire has some contrast issues"): the
  //   two tiers that read fine (Fire, Intense Fire) both have an `accent` that's unambiguously
  //   *brighter* than their own `base` (reads as a highlight/spark), while the one that read badly
  //   had an `accent` (`#FF1744`, a saturated red) that was actually *darker*-reading than its own
  //   golden-amber `base` -- so the icon read as a dim smudge rather than a spark, a real defect
  //   distinct from (and more important than) the raw WCAG contrast *number*, which barely differed
  //   between the two. Every tier's own `base` gets progressively brighter/warmer as intensity
  //   rises (deep red -> orange -> amber -> gold), and each tier's `accent` is deliberately kept
  //   brighter still than that tier's own `base` -- amber, then yellow, then pale yellow, then
  //   near-white -- so the "hotter" a tier gets, the closer its own spark reads to genuinely
  //   white-hot, and the raw contrast *ratio* between base/accent shrinking tier over tier (there's
  //   less room above an already-bright base) is an accepted, understood tradeoff, not a defect
  //   the way Raging Fire's inverted brightness relationship was.
  //
  //   (A "duotone flame" redesign -- both `base` and `accent` staying fully saturated at every
  //   tier, escalating via hue alone (gold -> hot pink -> magenta -> violet -> cyan) rather than
  //   `accent` paling toward white -- was tried and reverted the same day per direct, blunt
  //   feedback ("the new colors suck ass"). Noted here so it isn't casually retried.)
  //
  //   Fire/Intense Fire/Blazing Fire (2/5/10) were confirmed good as-is on a direct follow-up
  //   look; Raging Fire (25) and Inferno (50) went through two more rounds after that. A first fix
  //   swapped just `glow`/`accent` onto Material's "A" (accent) series (keeping the original
  //   `base`) after both were called out as "flat" -- a real improvement, but a follow-up asked for
  //   a full reinvention of both instead ("make the color scheme look like very intense heat using
  //   both yellow and orange, very bright"). Both tiers now deliberately use *both* hues together
  //   (an orange `base`/`glow` pair, a vivid yellow `accent`) rather than a single-hue gradient --
  //   Raging Fire: `#FF3D00` (a hot red-leaning orange) -> `#FF9800` (pure vivid orange) -> `#FFEB3B`
  //   (bright yellow). Inferno's *first* reinvented set (`#FF6F00`/`#FFA726`/`#FFFF00`) technically
  //   satisfied the brief but, per direct follow-up ("streak 50 looks GOOD but is too close to
  //   streak 5"), landed almost on top of Intense Fire's own values (`#FF6D00`/`#FFAB40`/`#FFEA00`)
  //   -- both are a medium-bright orange warming into a medium-bright yellow, with only a few hex
  //   digits of difference. Fixed with a genuinely different approach rather than another nearby
  //   hue nudge: instead of another mid-range orange-to-yellow gradient, Inferno's `base`/`glow`
  //   now span a much *wider* value range -- a deep, dark, almost-scorched red-orange base
  //   (`#BF360C`) through a vivid mid-orange (`#FF5722`) -- so the *shape* of that half of the
  //   gradient (a dark ember core) reads as distinctly more dramatic than Intense Fire's flatter,
  //   uniformly-bright one, not just a slightly different set of similarly-bright hues.
  //
  //   `accent` briefly changed on top of that, per direct follow-up once the above landed well
  //   ("since streak-100 is going full on magic, let's make 50 a sort of in-between the
  //   traditional flames and magical flame... just starting to shift into purple or blue"):
  //   swapped from the blazing-yellow `#FFFF00` peak to `#7C4DFF`, an electric blue-violet. Per
  //   immediate direct follow-up ("that's way too much purple... I liked the prior accent color")
  //   `accent` reverted straight back to `#FFFF00`, and the "just starting to turn magical" idea
  //   was moved to `base`/`glow` instead -- first a subtle nudge from pure red-orange toward a
  //   deep wine/crimson undertone, then per direct follow-up ("make the glow more purple, and the
  //   base more bright") pushed further in both directions at once: `base` brightened into a
  //   vivid, punchy crimson-red (`#E53950`, no longer dark/muted) while `glow` leaned further into
  //   a genuinely purple magenta-violet (`#C2449E`) -- so the pair now reads as a bright, hot red
  //   warming into a clearly purple-tinged glow, still grounded by `accent`'s own plain yellow
  //   "hottest point," rather than the earlier, more understated wine-red pairing. The literal
  //   "hand off into Magic Fire" story this was meant to carry lives in that base/glow shift, not
  //   in a fully violet accent.
  // - `new-best-streak` -- not a rung on the fixed ladder, so not part of the fire progression --
  //   used to get its own Diamond theme (its accent plain white, `#FFFFFF`, since a diamond is
  //   colorless and its "sparkle" *is* white light -- fixed there from an earlier violet pick that
  //   read as arbitrary without knowing the "diamond fluorescence flash" backstory behind it). Per
  //   explicit user direction ("it should be an orange gemstone, and use the trophy icon, for
  //   better consistency with how we represent 'best' throughout the app"), it now gets Topaz (a
  //   vivid orange base/glow with the same `#FFD700` gold this app's other "best streak" surfaces
  //   already use for their own trophy icon -- DashboardStreaksView, TaskStatsScreen, TaskCard's
  //   stats face -- as its accent, deliberately tying this kind's sparkle back to that established
  //   color) and its `icon` changed from `trophy-award` to plain `trophy`, matching those same
  //   surfaces exactly rather than a similar-but-different glyph. Diamond itself wasn't retired --
  //   `anniversary` (a new kind: fires once a task has been alive for a full year, via the new
  //   `task-age` progress strategy -- see below) inherited its exact `#00B8D4`/`#84FFFF`/`#FFFFFF`
  //   color set unchanged, per explicit user direction to "keep the Diamond color scheme and come
  //   up with a new achievement it could be used for." A diamond's own real-world cultural tie to a
  //   long-standing anniversary (endurance, rarity, something that doesn't fade) fits "a task
  //   that's been going a full year" far better than it ever fit "beat your own record," which was
  //   really about brilliance/precision more than the passage of time itself.
  // - The four milestone tiers get a classic Bronze -> Silver -> Gold -> Platinum medal
  //   progression, echoing their own medal-outline/medal iconography with an escalating sense of
  //   rank. (2026-08-12: a new milestone-50 tier was added between the original 10/100/1000 --
  //   Bronze stayed at 10, but Silver and Gold each moved down one slot (100 -> 50, 1000 -> 100,
  //   values otherwise unchanged) to make room for a genuinely new top-tier metal at 1000 --
  //   Platinum, a cool, dark blue-grey base with an icy pale sheen, deliberately darker/cooler
  //   than Silver's own lighter blue-grey rather than a near-duplicate of it, reading as more
  //   refined/premium than gold per the classic bronze-silver-gold-platinum rank convention.)
  // - Three more kinds use a proper *gemstone* theme each, per explicit user direction ("use
  //   gemstone themes for first streak, perfect day, and comeback"): `first-streak` (later replaced
  //   entirely by `first-completion`, which inherited this same theme -- see that entry's own
  //   comment) got Ruby (a deep, rich red -- the very first spark, distinct from streak-2's own Fire
  //   despite the similar hue family, since a polished gem reads differently than a flame -- Ruby's own glow/accent
  //   lean toward a clean pink-white sparkle rather than Fire's warm amber/orange flame-light);
  //   `perfect-day` gets Emerald (a vivid green with a pale mint sparkle -- "flawless" pairs just as
  //   naturally with an emerald as a sapphire does, and green is otherwise completely absent from
  //   this catalog, so it reads as clearly its own thing rather than close to anything else in the
  //   palette -- the original Sapphire pick here was dropped for exactly the opposite reason,
  //   reported directly as "too close to Diamond (blue)"); `comeback` gets Amethyst (a vivid violet
  //   base/glow paired with a *matching* bright violet-magenta accent, `#EA80FC`, replacing this
  //   kind's own former gold accent -- inherited from its previous name/story, Rebirth, "night
  //   breaking into gold dawn" -- which per direct follow-up ("I like the idea of a purple gemstone
  //   but gold makes no sense") didn't fit a genuine single-gem theme; the whole three-color set is
  //   now consistently purple, not two unrelated hues sharing one kind).
  //
  // Follow-up (2026-08-12): every gemstone theme's `glow` bumped to a more vibrant/electric shade,
  // per explicit user direction ("Make all the gemstone color themes use vibrant glow color") --
  // Ruby, Topaz, Diamond, Emerald, and Amethyst all moved from a comparatively muted/pastel glow
  // (e.g. Diamond's `#84FFFF`, a pale Cyan A100) to a Material "A"-series-style saturated
  // equivalent (Diamond -> `#18FFFF`, Cyan A200) -- the same "A-series stays fully saturated at
  // high brightness where the plain numbered series desaturates toward pale" distinction already
  // established for the fire ladder's own accent tuning. `base` and `accent` were untouched;
  // Bronze/Silver/Gold (the medal family, not a gemstone theme) were also left as-is.
  //
  // `theme` names which of the above this kind's colors were actually picked for -- real data
  // (not just a trailing comment, which could drift out of sync with the hex values beside it
  // unnoticed) naming the intent behind the three hex values it sits next to.
  //
  // `useAccentText` (2026-08-12): the celebration screen's hero number is colored `base` by
  // default, matching the coin/ribbon it sits under -- but a genuinely dark-based theme (Gilded,
  // Obsidian) reads that number as nearly invisible against the screen's own dark backdrop. Rather
  // than switch every kind over to `accent` (tried first, then reverted -- most themes' base
  // color was actually preferred for the counter text), this is an explicit per-kind opt-in,
  // defaulting to `false`/absent (use base, the normal case) so only the handful of dark-based
  // themes that actually need it override to `accent` instead.
  color: { theme: string; base: string; glow: string; accent: string; useAccentText?: boolean };
}

const taskName = (a: EarnedAchievement) => a.taskName ?? 'This habit';

// Fires the first time a task's own streak reaches this length -- deliberately not "day 1" (every
// single completion of every task would trigger it, far too noisy to feel special), but low
// enough to celebrate genuinely getting started. Kept as its own named constant (rather than a
// bare `2` inlined into streak-2's own progressStrategy below) since new-best-streak's own
// detection re-reads it too as its own floor.
const FIRST_STREAK_THRESHOLD = 2;

// Constants for the six kinds added 2026-08-12 -- grouped here (rather than scattered per-entry)
// since several are read from more than one place (both an ACHIEVEMENT_META entry's own
// progressStrategy and the matching bespoke detection block below).
const PERFECT_WEEK_DAYS = 7;
// A day/week with only one due task still trivially "wins" without this -- per explicit user
// direction (2026-08-12), a genuine "perfect" day needs a little more actually riding on it. 2 is
// the smallest change that rules out the trivial one-task case without meaningfully raising the
// bar for someone with a modest task list; shared by both perfect-day and perfect-week (a
// "perfect week" is just seven perfect days in a row, so both should mean the same thing).
const PERFECT_DAY_MIN_DUE_TASKS = 2;
// Century Club started as a single kind whose target was 1,000 (idiomatic, not literal -- "a big
// round milestone number"). Split (2026-08-12, per explicit user direction) into three literal
// tiers instead -- 100/500/1,000 -- so "Century Club" now genuinely means a century, matching
// "500 Club"/"Millennium Club" alongside it (see the three `century-club-N` ACHIEVEMENT_META
// entries below). Each tier inlines its own literal target directly (matching how
// milestone-10/50/100/1000's own entries each inline their own target) rather than sharing one
// constant across three genuinely different numbers.
// Shared by early-bird/night-owl's own progressStrategy entries and their bespoke detection --
// the trailing window of completions (across every active task, combined) considered, and the
// minimum sample size required before evaluating at all (avoids a lucky 2-early-completions
// false positive for a brand-new user).
const TIME_OF_DAY_WINDOW = 14;
const TIME_OF_DAY_MIN_SAMPLES = 10;
const EARLY_BIRD_HOUR = 7; // before 7am, local device time
const NIGHT_OWL_HOUR = 21; // at or after 9pm, local device time

// Single source of truth for every per-kind behavior -- icon/title/description, celebration
// screen content, Trophy Case progress strategy and display grouping, all in one place. Adding a
// new kind that fits an existing ProgressStrategy pattern means adding one entry here (including
// its own category/order for display) and nothing else -- ACHIEVEMENT_KIND_ORDER below is derived
// from these entries directly, and every other file in this feature picks the new kind up
// automatically.
export const ACHIEVEMENT_META: Record<AchievementKind, AchievementMeta> = {
  // Replaces the original `first-streak` kind (2026-08-12), per explicit user direction ("First
  // Streak is basically redundant to streak started -- come up with a different, perhaps global,
  // achievement in its place"). `first-streak` fired at the exact same moment as `streak-2` below
  // (a task's own currentStreak first reaching FIRST_STREAK_THRESHOLD) -- the only thing that ever
  // distinguished them was scope (global/one-time vs. per-task/repeatable), which read as two
  // trophies for the literal same action rather than two genuinely different moments. This kind
  // instead celebrates the *very first completion of anything, ever* -- a genuinely earlier,
  // distinct moment (day 1, not day 2 of a streak) that a per-task "streak started" kind can't
  // already cover. Reuses the exact same `fixed-threshold` mechanism as every other kind here
  // (`metric: 'totalCompletions', target: 1, scope: 'global'`) -- no new detection code needed:
  // the generic FIXED_THRESHOLD_ENTRIES loop already fires this the instant *any* task's own
  // totalCompletions first crosses 0 -> 1, and global dedup means it can only ever happen once,
  // for whichever task is completed first.
  'first-completion': {
    icon: 'shoe-print',
    title: 'First Steps!',
    // Taskless -- describe/triggerStandalone don't reference a task at all, matching perfect-day's
    // own global phrasing rather than falling back to the generic "This habit" placeholder
    // (`taskName`'s own fallback, see that helper) other per-task kinds use.
    describe: () => 'You logged your very first completion',
    repeatable: false,
    scope: 'global',
    flavorText: 'The hardest part is usually just starting. Nailed it.',
    // No numberBlock -- the underlying value is always exactly 1 (the first completion, by
    // definition), and animating a count-up to "1" would read as pointless rather than dramatic.
    // Falls back to plainTitle instead, the same treatment `comeback` (no meaningful number of its
    // own) already gets.
    ribbon: { kind: 'fixed', text: 'FIRST STEP' },
    triggerStandalone: () => 'You just logged your very first completion.',
    progressStrategy: { type: 'fixed-threshold', metric: 'totalCompletions', target: 1 },
    color: { theme: 'Ruby', base: '#C62828', glow: '#FF1744', accent: '#FFEBEE' }, // first-completion
  },
  'streak-2': {
    icon: 'fire',
    // A per-task, repeatable "you started a streak on *this* task" moment -- can happen many times
    // across different tasks (or the same task rebuilding after a break), unlike a one-time global
    // milestone.
    title: 'Streak Started!',
    describe: a => `"${taskName(a)}" started a 2-day streak`,
    repeatable: true,
    scope: 'task',
    flavorText: 'And so it begins!',
    numberBlock: { eyebrow: 'Streak Milestone', unit: 'DAY STREAK' },
    ribbon: { kind: 'count', unit: 'DAYS' },
    triggerSuffix: v => ` started a ${v.toLocaleString()}-day streak.`,
    progressStrategy: { type: 'fixed-threshold', metric: 'currentStreak', target: FIRST_STREAK_THRESHOLD },
    color: { theme: 'Fire', base: '#E64A19', glow: '#FF7043', accent: '#FFC400' }, // streak-2
  },
  'streak-5': {
    icon: 'fire',
    title: '5-Day Streak!',
    describe: a => `"${taskName(a)}" hit a 5-day streak`,
    repeatable: true,
    scope: 'task',
    flavorText: 'Five days deep and going strong!',
    numberBlock: { eyebrow: 'Streak Milestone', unit: 'DAY STREAK' },
    ribbon: { kind: 'count', unit: 'DAYS' },
    triggerSuffix: v => ` reached a ${v.toLocaleString()}-day streak.`,
    progressStrategy: { type: 'fixed-threshold', metric: 'currentStreak', target: 5 },
    color: { theme: 'Intense Fire', base: '#FF6D00', glow: '#FFAB40', accent: '#FFEA00' }, // streak-5
  },
  'streak-10': {
    icon: 'fire',
    title: '10-Day Streak!',
    describe: a => `"${taskName(a)}" hit a 10-day streak`,
    repeatable: true,
    scope: 'task',
    flavorText: "You're on a roll — literally!",
    numberBlock: { eyebrow: 'Streak Milestone', unit: 'DAY STREAK' },
    ribbon: { kind: 'count', unit: 'DAYS' },
    triggerSuffix: v => ` reached a ${v.toLocaleString()}-day streak.`,
    progressStrategy: { type: 'fixed-threshold', metric: 'currentStreak', target: 10 },
    color: { theme: 'Blazing Fire', base: '#FF8F00', glow: '#FFC107', accent: '#FFF59D' }, // streak-10
  },
  'streak-25': {
    icon: 'fire',
    title: '25-Day Streak!',
    describe: a => `"${taskName(a)}" hit a 25-day streak`,
    repeatable: true,
    scope: 'task',
    flavorText: 'Consistency looks so good on you!',
    numberBlock: { eyebrow: 'Streak Milestone', unit: 'DAY STREAK' },
    ribbon: { kind: 'count', unit: 'DAYS' },
    triggerSuffix: v => ` reached a ${v.toLocaleString()}-day streak.`,
    progressStrategy: { type: 'fixed-threshold', metric: 'currentStreak', target: 25 },
    color: { theme: 'Raging Fire', base: '#FF3D00', glow: '#FF9800', accent: '#FFEB3B' }, // streak-25
  },
  'streak-50': {
    icon: 'fire',
    title: '50-Day Streak!',
    describe: a => `"${taskName(a)}" hit a 50-day streak`,
    repeatable: true,
    scope: 'task',
    flavorText: 'High five, times ten.',
    numberBlock: { eyebrow: 'Streak Milestone', unit: 'DAY STREAK' },
    ribbon: { kind: 'count', unit: 'DAYS' },
    triggerSuffix: v => ` reached a ${v.toLocaleString()}-day streak.`,
    progressStrategy: { type: 'fixed-threshold', metric: 'currentStreak', target: 50 },
    // Reworked again (2026-08-12), per direct user redirect: rather than a fresh, distinct
    // concept (the char-red/white-hot-core take just above didn't land either), this now starts
    // directly from streak-25's own Raging Fire triple (#FF3D00/#FF9800/#FFEB3B) and pushes each
    // channel further in the same direction -- a deeper, more saturated red base, a hotter more
    // saturated orange glow, a more vivid yellow-gold accent -- so Inferno reads as a genuine
    // escalation of Raging Fire's own hue family, not a swap to a different one.
    color: { theme: 'Inferno', base: '#D50000', glow: '#FF6100', accent: '#FFB300' }, // streak-50
  },
  'streak-100': {
    icon: 'fire',
    title: '100-Day Streak!',
    describe: a => `"${taskName(a)}" hit a 100-day streak`,
    repeatable: true,
    scope: 'task',
    flavorText: 'This is basically a personality trait now.',
    numberBlock: { eyebrow: 'Streak Milestone', unit: 'DAY STREAK' },
    ribbon: { kind: 'count', unit: 'DAYS' },
    triggerSuffix: v => ` reached a ${v.toLocaleString()}-day streak.`,
    progressStrategy: { type: 'fixed-threshold', metric: 'currentStreak', target: 100 },
    color: { theme: 'Magic Fire', base: '#7B1FA2', glow: '#BA68C8', accent: '#F50057' }, // streak-100
  },
  'streak-1000': {
    icon: 'fire',
    title: '1,000-Day Streak!',
    describe: a => `"${taskName(a)}" hit a 1,000-day streak`,
    repeatable: true,
    scope: 'task',
    flavorText: "You've entered myth territory. Godspeed, legend.",
    numberBlock: { eyebrow: 'Streak Milestone', unit: 'DAY STREAK' },
    ribbon: { kind: 'count', unit: 'DAYS' },
    triggerSuffix: v => ` reached a ${v.toLocaleString()}-day streak.`,
    progressStrategy: { type: 'fixed-threshold', metric: 'currentStreak', target: 1000 },
    color: { theme: 'Cosmic Fire', base: '#AA00FF', glow: '#E040FB', accent: '#00E5FF' }, // streak-1000
  },
  'new-best-streak': {
    // Plain `trophy`, not `trophy-award` -- matching the exact icon (and gold, `#FFD700`) every
    // other "best streak" surface in the app already uses (DashboardStreaksView, TaskStatsScreen,
    // TaskCard's own stats face), per explicit user direction ("use the trophy icon, for better
    // consistency with how we represent 'best' throughout the app").
    icon: 'trophy',
    title: 'New Best Streak!',
    describe: a => `"${taskName(a)}" beat its record — ${a.value} days!`,
    repeatable: true,
    scope: 'task',
    flavorText: 'Take a bow — you just outdid yourself!',
    numberBlock: { eyebrow: 'New Personal Best', unit: 'DAY STREAK' },
    ribbon: { kind: 'count', unit: 'DAYS' },
    triggerSuffix: v => ` just beat its own personal best with a ${v.toLocaleString()}-day streak.`,
    progressStrategy: { type: 'ratio-to-own-best' },
    // Gilded (2026-08-12), replacing Topaz -- mirrors century-club's own Obsidian structure (a
    // dark, near-neutral base/glow with a single bright accent carrying all the color), just warm
    // instead of cold: a shadowed bronze-black base and antique-bronze glow, with the accent kept
    // at this app's own established `#FFD700` "best streak" gold (DashboardStreaksView,
    // TaskStatsScreen, TaskCard's stats face all already use this exact hex).
    color: { theme: 'Gilded', base: '#5c4502', glow: '#8C6D1F', accent: '#FFD700', useAccentText: true }, // new-best-streak
  },
  anniversary: {
    icon: 'cake-variant',
    title: 'One Year Strong!',
    describe: a => `"${taskName(a)}" has been going for a full year`,
    // A true one-time-per-task event, like first-completion's own one-time-per-app moment -- a task
    // can only turn 1 year old once, so this joins ONE_TIME_KINDS (via `repeatable: false`) rather
    // than needing its own bespoke edge-trigger logic; the store's existing dedup-by-scope guard
    // already prevents this from re-firing every single day after the anniversary passes.
    repeatable: false,
    scope: 'task',
    flavorText: 'A full trip around the sun, and you never missed a beat.',
    numberBlock: { eyebrow: 'Anniversary', unit: 'DAYS STRONG' },
    ribbon: { kind: 'count', unit: 'DAYS' },
    triggerSuffix: v => ` has been going strong for ${v.toLocaleString()} days.`,
    progressStrategy: { type: 'task-age', days: 365 },
    // Diamond's own exact color set, reassigned here per explicit user direction ("keep the
    // Diamond color scheme and come up with a new achievement it could be used for") once
    // new-best-streak moved to its own Topaz theme -- a diamond's real-world cultural association
    // with a long-standing anniversary (sheer endurance, rarity, something that doesn't fade) fits
    // "a task that's been going for a full year" far better than it ever fit "beat your own
    // record," which was really more about brilliance/precision than time itself.
    color: { theme: 'Diamond', base: '#00B8D4', glow: '#18FFFF', accent: '#FFFFFF' }, // anniversary
  },
  'milestone-10': {
    icon: 'medal-outline',
    title: '10 Completions!',
    describe: a => `"${taskName(a)}" hit 10 total completions`,
    repeatable: false,
    scope: 'task',
    flavorText: 'Look at you building momentum!',
    numberBlock: { eyebrow: 'Completion Milestone', unit: 'TOTAL COMPLETIONS' },
    ribbon: { kind: 'count', unit: 'DONE' },
    triggerSuffix: v => ` logged its ${v.toLocaleString()}th completion.`,
    progressStrategy: { type: 'fixed-threshold', metric: 'totalCompletions', target: 10 },
    color: { theme: 'Bronze', base: '#8D5524', glow: '#C87F3D', accent: '#FFB74D' }, // milestone-10
  },
  // New tier (2026-08-12), slotted between the original 10/100/1000 -- Silver's own color set
  // moved down here from milestone-100 unchanged (see the medal-progression comment above).
  'milestone-50': {
    icon: 'medal',
    title: '50 Completions!',
    describe: a => `"${taskName(a)}" hit 50 total completions`,
    repeatable: false,
    scope: 'task',
    flavorText: 'Halfway to triple digits and still going strong.',
    numberBlock: { eyebrow: 'Completion Milestone', unit: 'TOTAL COMPLETIONS' },
    ribbon: { kind: 'count', unit: 'DONE' },
    triggerSuffix: v => ` logged its ${v.toLocaleString()}th completion.`,
    progressStrategy: { type: 'fixed-threshold', metric: 'totalCompletions', target: 50 },
    color: { theme: 'Silver', base: '#607D8B', glow: '#B0BEC5', accent: '#E1F5FE' }, // milestone-50
  },
  // Gold's own color set moved down here from milestone-1000 unchanged (see the medal-progression
  // comment above) -- 100 used to be Silver, now Gold.
  'milestone-100': {
    icon: 'medal',
    title: '100 Completions!',
    describe: a => `"${taskName(a)}" hit 100 total completions`,
    repeatable: false,
    scope: 'task',
    flavorText: 'This is starting to look like a lifestyle.',
    numberBlock: { eyebrow: 'Completion Milestone', unit: 'TOTAL COMPLETIONS' },
    ribbon: { kind: 'count', unit: 'DONE' },
    triggerSuffix: v => ` logged its ${v.toLocaleString()}th completion.`,
    progressStrategy: { type: 'fixed-threshold', metric: 'totalCompletions', target: 100 },
    color: { theme: 'Gold', base: '#B8860B', glow: '#DAA520', accent: '#FFF9C4' }, // milestone-100
  },
  // A genuinely new top-tier metal (2026-08-12), not a moved-down existing theme -- 1000 used to
  // be Gold, which moved down to 100 (see above) to make room for this. Deliberately a darker,
  // cooler blue-grey than Silver's own lighter one (not a near-duplicate of it), reading as more
  // refined/premium than gold per the classic bronze-silver-gold-platinum rank convention.
  'milestone-1000': {
    icon: 'medal',
    title: '1,000 Completions!',
    describe: a => `"${taskName(a)}" hit 1,000 total completions`,
    repeatable: false,
    scope: 'task',
    flavorText: 'Someone alert the Guinness World Records people.',
    numberBlock: { eyebrow: 'Completion Milestone', unit: 'TOTAL COMPLETIONS' },
    ribbon: { kind: 'count', unit: 'DONE' },
    triggerSuffix: v => ` logged its ${v.toLocaleString()}th completion.`,
    progressStrategy: { type: 'fixed-threshold', metric: 'totalCompletions', target: 1000 },
    color: { theme: 'Platinum', base: '#37474F', glow: '#90A4AE', accent: '#ECEFF1' }, // milestone-1000
  },
  'perfect-day': {
    icon: 'calendar-star',
    title: 'Perfect Day!',
    describe: () => 'Every habit completed today',
    repeatable: true,
    scope: 'global',
    flavorText: 'A clean sweep — nicely done!',
    numberBlock: { eyebrow: 'Perfect Day', unit: 'HABITS COMPLETED' },
    // A fixed word, not a count -- the number of habits due today isn't really the interesting
    // fact about a perfect day (it doesn't escalate/grow the way a streak or completion count
    // does, it's just whatever happened to be due), so a plain declaration reads better.
    ribbon: { kind: 'fixed', text: 'PERFECT' },
    // "Today", not "that day" -- reads far more naturally for the overwhelmingly common case (a
    // live, same-day completion), even though a backfilled past-date completion technically means
    // this isn't always literally "today" in wall-clock terms. Accepted per explicit direction.
    triggerStandalone: v =>
      v !== undefined
        ? `All ${v.toLocaleString()} habits due today were completed.`
        : 'Every habit due today was completed.',
    progressStrategy: { type: 'today-progress' },
    color: { theme: 'Emerald', base: '#00A86B', glow: '#00E676', accent: '#E8F5E9' }, // perfect-day
  },
  comeback: {
    icon: 'restore',
    title: 'Welcome Back!',
    describe: a => `"${taskName(a)}" is back on track`,
    repeatable: true,
    scope: 'task',
    flavorText: 'Like you never left.',
    // No numberBlock -- there's no meaningful number to lead with here, so the celebration screen
    // falls back to the plain title instead.
    ribbon: { kind: 'fixed', text: 'COMEBACK' },
    triggerSuffix: () => ' is back on track after a lapsed streak.',
    progressStrategy: { type: 'readiness', isReady: task => task.stats?.streakStatus === 'expired' },
    color: { theme: 'Amethyst', base: '#6A1B9A', glow: '#D500F9', accent: '#EA80FC' }, // comeback
  },

  // ==========================================================================================
  // Five kinds added 2026-08-12, per explicit user direction ("add these new achievements you
  // proposed earlier: Perfect Week, Century Club, Habit Collector, Early Bird... Night Owl...
  // Beast Mode"). A sixth, Beast Mode, was added in this same batch but removed the same day
  // (see this file's own git history / CLAUDE.md for the full reasoning) once direct testing
  // surfaced real, un-fixable design gaps -- it fired trivially with only one due task (a single
  // completion's own timestamp span is always 0 minutes), and its speed window didn't scale with
  // how many tasks were actually due, making it easier on light days and harder on busy ones. Four
  // of the five remaining kinds needed genuinely new ProgressStrategy variants (see that type's own
  // comments above) since none of the existing five patterns fit a cross-task aggregate sum, an
  // active-task count, a rolling time-of-day ratio, or a live consecutive-day lookback -- exactly
  // the "genuinely novel progress shape" case that type's own doc comment anticipated. Detection
  // for all five is bespoke (see detectCompletionAchievements' own blocks below), same as
  // new-best-streak/comeback/perfect-day already are, for the same reason: each is a genuinely new
  // *rule*, not another tier of an existing one.
  // ==========================================================================================

  // A direct escalation of perfect-day -- 7 consecutive perfect days (every due, non-archived
  // task completed each day) rather than just one. Global, repeatable (a genuinely later
  // 7-day window can still earn its own copy), dedup scope is the window's own end date so the
  // same window never double-fires.
  'perfect-week': {
    icon: 'calendar-week',
    title: 'Perfect Week!',
    describe: () => 'Every habit completed, 7 days straight',
    repeatable: true,
    scope: 'global',
    flavorText: 'A full week without a single miss. Impressive.',
    numberBlock: { eyebrow: 'Perfect Week', unit: 'DAYS PERFECT' },
    ribbon: { kind: 'count', unit: 'DAYS' },
    triggerStandalone: v => `You completed every habit, ${(v ?? PERFECT_WEEK_DAYS).toLocaleString()} days in a row.`,
    progressStrategy: { type: 'perfect-day-streak', days: PERFECT_WEEK_DAYS },
    color: { theme: 'Sapphire', base: '#1565C0', glow: '#42A5F5', accent: '#E3F2FD' }, // perfect-week
  },
  // Three global, lifetime-*sum* tiers of totalCompletions across every active task (2026-08-12,
  // split from a single 1,000-target "Century Club" kind, per explicit user direction to "add a
  // 100 and 500 version, appropriately named and styled") -- distinct from any single task's own
  // milestone-N tier, which never aggregates across tasks. Named Century Club (100, a literal
  // century), Fortune 500 (500 -- a deliberate pun on the real-world "Fortune 500" list, replacing
  // an initial flat "500 Club" per direct user feedback that it "sucks" and needed something
  // cleverer -- since there's no clean, well-known English word for "500" the way "century"/
  // "millennium" exist for 100/1,000, borrowing an already-famous "500" itself was the better
  // move than forcing one), Millennium Club (1,000, a literal millennium). All one-time (a
  // lifetime sum never un-crosses a threshold in normal use), same reasoning as milestone-N.
  //
  // Styled as a "stone/monument" theme -- Cobalt (100) -> Garnet (500) -> Obsidian (1,000, the
  // original kind's own color set, unchanged) -- deliberately distinct from milestone-N's own
  // metal-medal theme (Bronze/Silver/Gold/Platinum, a *per-task* progression) and from the
  // gemstone/fire themes used elsewhere in this catalog, since a cross-task lifetime total
  // commemorating "how much you've built" reads more like an engraved monument than a medal. All
  // three tiers are deliberately dark-based with a bright accent on top (matching Obsidian's own
  // "dark base, bright warm accent" formula, `useAccentText: true` on all three) -- an earlier
  // pass had these as light-based themes (Marble/Granite), which per direct user feedback had
  // "serious contrast problems" next to Obsidian's own strong dark-base/bright-accent pairing: a
  // light base pairs badly with this catalog's other shared conventions built around a dark base
  // (most concretely, the ribbon banner's own fixed white text, which read as nearly invisible
  // against Marble's pale `#FAFAFA` face). Renamed once more from an intermediate Slate/Basalt
  // pass (2026-08-13) -- "Slate" -> "Cobalt" per direct request (the color itself was already
  // approved, "otherwise it's perfect," just the mineral-name label), and "Basalt" replaced
  // outright ("meh, try something else") with Garnet, a deep-red gemstone giving the middle tier
  // its own distinct warm identity rather than sharing Cobalt's cool blue-grey family.
  'century-club-100': {
    icon: 'trophy-outline',
    title: 'Century Club!',
    describe: () => 'Logged 100 completions across all your habits',
    repeatable: false,
    scope: 'global',
    flavorText: 'Consistency is clearly your superpower.',
    numberBlock: { eyebrow: 'Century Club', unit: 'TOTAL COMPLETIONS' },
    ribbon: { kind: 'count', unit: 'DONE' },
    triggerStandalone: v => `You've logged ${(v ?? 100).toLocaleString()} completions across all your habits.`,
    progressStrategy: { type: 'total-completions-sum', target: 100 },
    // Cobalt -- a deep blue-grey stone base with a vivid sky-blue mineral-glint accent (colors
    // unchanged from the prior "Slate" pass, just the theme's own name corrected).
    color: { theme: 'Cobalt', base: '#263238', glow: '#546E7A', accent: '#40C4FF', useAccentText: true }, // century-club-100
  },
  'century-club-500': {
    icon: 'trophy',
    title: 'Fortune 500!',
    describe: () => 'Logged 500 completions across all your habits',
    repeatable: false,
    scope: 'global',
    flavorText: 'Fortune favors the consistent.',
    numberBlock: { eyebrow: 'Fortune 500', unit: 'TOTAL COMPLETIONS' },
    ribbon: { kind: 'count', unit: 'DONE' },
    triggerStandalone: v => `You've logged ${(v ?? 500).toLocaleString()} completions across all your habits.`,
    progressStrategy: { type: 'total-completions-sum', target: 500 },
    // Garnet -- a deep, dark garnet-red base with a warm amber-gold accent (jewelry convention:
    // garnet is classically set in gold), giving this middle tier a warm identity distinct from
    // Cobalt's cool blue-grey and Obsidian's neutral near-black.
    color: { theme: 'Garnet', base: '#4A0E0E', glow: '#8B2635', accent: '#FFCA28', useAccentText: true }, // century-club-500
  },
  'century-club-1000': {
    icon: 'crown',
    title: 'Millennium Club!',
    describe: () => 'Logged 1,000 completions across all your habits',
    repeatable: false,
    scope: 'global',
    flavorText: "You've officially put in the reps.",
    numberBlock: { eyebrow: 'Millennium Club', unit: 'TOTAL COMPLETIONS' },
    ribbon: { kind: 'count', unit: 'DONE' },
    triggerStandalone: v => `You've logged ${(v ?? 1000).toLocaleString()} completions across all your habits.`,
    progressStrategy: { type: 'total-completions-sum', target: 1000 },
    // Obsidian -- the original single kind's own color set, unchanged; the darkest, rarest stone
    // for the top tier.
    color: { theme: 'Obsidian', base: '#212121', glow: '#616161', accent: '#FFD54F', useAccentText: true }, // century-club-1000
  },
  // Reaching the free-tier's own active-task cap (MAX_ACTIVE_TASKS, taskLimits.ts) for the first
  // time -- an engagement milestone, not a performance one. One-time global moment, matching
  // first-completion's own "marks a specific point in your journey" framing rather than
  // comeback's "can recur" one (you'd have to archive tasks back below the cap and refill it for
  // this to even theoretically happen twice, which isn't worth treating as a real repeat case).
  'habit-collector': {
    icon: 'view-grid',
    title: 'Habit Collector!',
    describe: () => `Built a full roster of ${MAX_ACTIVE_TASKS} habits`,
    repeatable: false,
    scope: 'global',
    flavorText: 'A well-rounded lineup. Look at you go.',
    numberBlock: { eyebrow: 'Habit Collector', unit: 'ACTIVE HABITS' },
    ribbon: { kind: 'count', unit: 'HABITS' },
    triggerStandalone: v => `You're now tracking ${(v ?? MAX_ACTIVE_TASKS).toLocaleString()} habits at once.`,
    progressStrategy: { type: 'active-task-count', target: MAX_ACTIVE_TASKS },
    color: { theme: 'Turquoise', base: '#00BFA5', glow: '#64FFDA', accent: '#E0F7FA' }, // habit-collector
  },
  // A behavior-pattern moment, not a task-performance one -- fires the first time at least half
  // of your most recent completions (across every active task, combined) land before a given
  // hour. The first two kinds in this whole feature to read raw completion *timestamps*
  // (`TaskCompletion.completedAt`) rather than precomputed `.stats` -- everything else here has
  // only ever needed a task's own streak/completion-count stats. One-time (a "you're an early
  // riser" personality trait, not something to re-celebrate every time a rolling window happens
  // to qualify again -- see night-owl's own identical reasoning).
  'early-bird': {
    icon: 'weather-sunny',
    title: 'Early Bird!',
    describe: () => 'Most of your recent habits were done before sunrise',
    repeatable: false,
    scope: 'global',
    flavorText: "The world is quiet and you're already crushing it.",
    numberBlock: { eyebrow: 'Early Bird', unit: 'EARLY COMPLETIONS' },
    ribbon: { kind: 'fixed', text: 'EARLY BIRD' },
    triggerStandalone: v => `${(v ?? 0).toLocaleString()} of your last ${TIME_OF_DAY_WINDOW} completions landed before 7am.`,
    progressStrategy: { type: 'time-of-day-ratio', hour: EARLY_BIRD_HOUR, direction: 'before', window: TIME_OF_DAY_WINDOW, minSamples: TIME_OF_DAY_MIN_SAMPLES },
    color: { theme: 'Dawn', base: '#FF8A65', glow: '#FFAB91', accent: '#FFF176' }, // early-bird
  },
  // Night Owl's exact mirror -- same `time-of-day-ratio` strategy, `direction: 'after'` instead
  // of `'before'`, a later hour. See early-bird's own comment for the shared reasoning
  // (timestamp-based detection, one-time framing).
  'night-owl': {
    icon: 'weather-night',
    title: 'Night Owl!',
    describe: () => 'Most of your recent habits were done late at night',
    repeatable: false,
    scope: 'global',
    flavorText: 'Burning the midnight oil, one habit at a time.',
    numberBlock: { eyebrow: 'Night Owl', unit: 'LATE COMPLETIONS' },
    ribbon: { kind: 'fixed', text: 'NIGHT OWL' },
    triggerStandalone: v => `${(v ?? 0).toLocaleString()} of your last ${TIME_OF_DAY_WINDOW} completions landed after 9pm.`,
    progressStrategy: { type: 'time-of-day-ratio', hour: NIGHT_OWL_HOUR, direction: 'after', window: TIME_OF_DAY_WINDOW, minSamples: TIME_OF_DAY_MIN_SAMPLES },
    color: { theme: 'Midnight', base: '#10102B', glow: '#5C6BC0', accent: '#283593', useAccentText: true }, // night-owl
  },
};

// Derived from ACHIEVEMENT_META's own `repeatable` flag rather than maintained as a separate list
// -- a kind's dedup behavior is a property of the kind, not something to keep in sync by hand.
// first-completion, anniversary, and milestone-10/50/100/1000 are one-time (see repeatable's own
// comment above for why each is); every other kind is repeatable.
export const ONE_TIME_KINDS: AchievementKind[] = (Object.keys(ACHIEVEMENT_META) as AchievementKind[])
  .filter(kind => !ACHIEVEMENT_META[kind].repeatable);

// The base catalog order -- streaks (the biggest, most central family) first, then completions,
// then the one-off/global moments last. A plain hand-curated list, not derived from any per-kind
// metadata field: an earlier version of this file tried inventing a `category`/`order` pair on
// AchievementMeta to derive this automatically, but per explicit user correction that wasn't
// wanted -- display grouping should come from each kind's *actual live status* (unlocked/in
// progress/not started, see getGroupedAchievementCardStatuses below), not a new invented taxonomy
// field. This list now serves one purpose only: the tiebreak order for kinds that have no
// unlocked/in-progress standing to sort by yet (the "not started" bucket's own fallback order).
// Expressed as a `Record<AchievementKind, number>` rather than a bare array specifically so tsc
// forces every kind in ACHIEVEMENT_META to have an entry here -- a plain array could silently omit
// a newly-added kind with no compile-time signal; this can't.
const ACHIEVEMENT_ORDER_INDEX: Record<AchievementKind, number> = {
  'first-completion': 0, 'streak-2': 1, 'streak-5': 2, 'streak-10': 3, 'streak-25': 4, 'streak-50': 5,
  'streak-100': 6, 'streak-1000': 7, 'new-best-streak': 8, anniversary: 9,
  'milestone-10': 10, 'milestone-50': 11, 'milestone-100': 12, 'milestone-1000': 13,
  'century-club-100': 14, 'century-club-500': 15, 'century-club-1000': 16,
  'perfect-day': 17, 'perfect-week': 18,
  comeback: 19,
  'habit-collector': 20,
  'early-bird': 21, 'night-owl': 22,
};

export const ACHIEVEMENT_KIND_ORDER: AchievementKind[] = (Object.keys(ACHIEVEMENT_META) as AchievementKind[])
  .sort((a, b) => ACHIEVEMENT_ORDER_INDEX[a] - ACHIEVEMENT_ORDER_INDEX[b]);

// The ribbon banner's own text, fully derived from ACHIEVEMENT_META -- no per-kind branching.
// Exported so both AchievementCelebration (TrophyBadge's emblem) and any future consumer read the
// exact same formatting logic.
export const getRibbonText = (achievement: Achievement): string => {
  const ribbon = ACHIEVEMENT_META[achievement.kind].ribbon;
  if (ribbon.kind === 'fixed') return ribbon.text;
  const n = (achievement.value ?? 0).toLocaleString();
  return `${n} ${ribbon.unit}`;
};

export const dedupKey = (kind: AchievementKind, scope: string): string => `${kind}:${scope}`;

// Whether a kind is attributable to a single task, vs. a global condition that spans every task
// (or none in particular) -- e.g. Century Club's cross-task completion sum, or Perfect Day's
// "every due task today" condition, can't meaningfully be scoped down to just one task. Shared by
// every UI-layer "filter/preview by task" surface (TrophiesScreen's own task filter,
// AchievementsPreviewCard) so they can't drift on what counts as task-scoped.
export const isTaskScopedKind = (kind: AchievementKind): boolean => ACHIEVEMENT_META[kind].scope === 'task';

// Precomputed once, not re-filtered on every call -- the task-scoped subset of ACHIEVEMENT_KIND_ORDER,
// in the same catalog order. Passed as `getAllAchievementCardStatuses`/`getGroupedAchievementCardStatuses`'s
// own optional `kinds` param by every UI-layer surface that's already scoped to one task (see that
// param's own comment for why computing, then discarding, the global kinds' own status was a real
// performance problem worth avoiding rather than just filtering the *result*).
export const TASK_SCOPED_KIND_ORDER: AchievementKind[] = ACHIEVEMENT_KIND_ORDER.filter(isTaskScopedKind);

const taskMeta = (task: Task) => ({
  taskId: task.id,
  taskName: task.name,
  taskIcon: task.icon,
  taskColor: task.color,
});

// Every fixed-threshold kind (first-completion, streak-N, milestone-N), derived directly from
// ACHIEVEMENT_META rather than a separately maintained tier list -- a new fixed-threshold kind
// (even a new tier of an existing pattern, like a hypothetical streak-500) is detected
// automatically the moment it's added to ACHIEVEMENT_META above, with zero new code here.
const FIXED_THRESHOLD_ENTRIES: { kind: AchievementKind; metric: 'currentStreak' | 'totalCompletions'; target: number }[] =
  ACHIEVEMENT_KIND_ORDER
    .map(kind => ({ kind, strategy: ACHIEVEMENT_META[kind].progressStrategy }))
    .filter(
      (entry): entry is { kind: AchievementKind; strategy: Extract<ProgressStrategy, { type: 'fixed-threshold' }> } =>
        entry.strategy.type === 'fixed-threshold'
    )
    .map(({ kind, strategy }) => ({ kind, metric: strategy.metric, target: strategy.target }));

// Every total-completions-sum kind (the three century-club-N tiers), derived the same way as
// FIXED_THRESHOLD_ENTRIES above -- adding a fourth tier needs one new ACHIEVEMENT_META entry and
// nothing else, the same "add a tier of an existing pattern for free" property every other
// derived-entries list here already has.
const TOTAL_COMPLETIONS_SUM_ENTRIES: { kind: AchievementKind; target: number }[] = ACHIEVEMENT_KIND_ORDER
  .map(kind => ({ kind, strategy: ACHIEVEMENT_META[kind].progressStrategy }))
  .filter(
    (entry): entry is { kind: AchievementKind; strategy: Extract<ProgressStrategy, { type: 'total-completions-sum' }> } =>
      entry.strategy.type === 'total-completions-sum'
  )
  .map(({ kind, strategy }) => ({ kind, target: strategy.target }));

// Every task-age kind, derived the same way as FIXED_THRESHOLD_ENTRIES above -- currently just
// anniversary. Used both by detectCompletionAchievements (live) and detectRetroactiveAchievements'
// own standalone task-age check below (task-age isn't completion-driven, so it sits outside that
// function's chronological replay).
const TASK_AGE_ENTRIES: { kind: AchievementKind; days: number }[] = ACHIEVEMENT_KIND_ORDER
  .map(kind => ({ kind, strategy: ACHIEVEMENT_META[kind].progressStrategy }))
  .filter(
    (entry): entry is { kind: AchievementKind; strategy: Extract<ProgressStrategy, { type: 'task-age' }> } =>
      entry.strategy.type === 'task-age'
  )
  .map(({ kind, strategy }) => ({ kind, days: strategy.days }));

// Shared by detectCompletionAchievements and detectRetroactiveAchievements -- both need "has this
// task's own age crossed this many days," just evaluated against a different reference point (the
// completion's own date vs. "today") and a different task scope (the one just-completed task vs.
// every active task in a loop). Extracted 2026-08-14 so the two can't independently drift on the
// underlying date math -- simple enough that they hadn't actually disagreed yet, but matches this
// file's own established bias toward one shared predicate over two hand-typed copies of the same
// condition (see getTimeOfDayWindow's own extraction, same day, for the more consequential version
// of this same fix).
const hasReachedTaskAge = (task: Task, days: number, referenceDate: Date): boolean =>
  differenceInCalendarDays(referenceDate, parseISO(task.createdAt)) >= days;

// Every active-task-count kind (currently just habit-collector) -- same reasoning as
// TASK_AGE_ENTRIES: not completion-driven, so detectRetroactiveAchievements checks it directly
// via this list rather than as part of its chronological replay. Every OTHER strategy type
// (ratio-to-own-best, perfect-day-streak, total-completions-sum, time-of-day-ratio) no longer
// needs its own derived list here -- detectRetroactiveAchievements' replay drives all of those
// straight through detectCompletionAchievements' own existing per-strategy logic instead of
// duplicating it in a second, snapshot-only form.
const ACTIVE_TASK_COUNT_ENTRIES: { kind: AchievementKind; target: number }[] = ACHIEVEMENT_KIND_ORDER
  .map(kind => ({ kind, strategy: ACHIEVEMENT_META[kind].progressStrategy }))
  .filter(
    (entry): entry is { kind: AchievementKind; strategy: Extract<ProgressStrategy, { type: 'active-task-count' }> } =>
      entry.strategy.type === 'active-task-count'
  )
  .map(({ kind, strategy }) => ({ kind, target: strategy.target }));

// Repeatable, task-scoped kinds (streak-N tiers, new-best-streak, comeback) -- the ones where the
// *same* task can legitimately earn the *same* kind again after a genuine reset (a streak breaks
// and climbs back to 10, a task lapses and revives a second time). Their dedupScope gets
// date-qualified below (see detectCompletionAchievements' own `dedupScopeFor`) rather than staying
// a bare taskId, closing a real bug: `undoCompleteTask` deliberately never retracts an
// already-recorded achievement (see "No revocation on Undo" elsewhere in this codebase), so
// undoing a completion and immediately redoing it reproduces the *identical* prev/next crossing --
// a bare taskId-scoped dedup key can't tell that apart from a genuinely new crossing weeks later,
// so it fired a duplicate every time. Date-qualifying fixes this because a specific calendar date
// can only ever be "the day this task's streak crossed threshold X" once, by definition -- an
// undo+redo replay recomputes the *same* date, correctly blocked, while a real new crossing lands
// on a *different* date, correctly allowed.
//
// Exported so achievementsStore.ts's own live dedup-set builder can apply the identical
// "everything except these needs simple one-time-per-scope dedup" rule detectRetroactiveAchievements'
// own replay already made -- these three were the one place the two were checking different things
// (the live path used to exclude every *repeatable* kind from dedup entirely via `ONE_TIME_KINDS`,
// which wrongly caught perfect-day/perfect-week too, even though those are global-scoped and their
// own date-scoped dedupScope should never repeat regardless of the `repeatable` flag on their
// `ACHIEVEMENT_META` entry, which exists so *different* dates can each still be earned separately).
// detectRetroactiveAchievements still needs its own separate counting-based guard for these three
// specifically (a chronological replay can legitimately encounter the same (kind, taskId) many
// times across real history, and has to tell "already accounted for" apart from "a new one") --
// this set is what tells that function which kinds need that treatment instead of simple dedup.
export const REPEATABLE_TASK_SCOPED_KINDS = new Set<AchievementKind>(
  (Object.keys(ACHIEVEMENT_META) as AchievementKind[])
    .filter(kind => ACHIEVEMENT_META[kind].repeatable && ACHIEVEMENT_META[kind].scope === 'task')
);

// Selects the `n` most-recent items from `items` (by `completedAt`, newest first) without sorting
// the whole list -- a single linear pass maintaining a small ascending-by-completedAt buffer
// (`buffer[0]` is always the current oldest, so evicting it is O(1)) costs O(n) overall instead of
// a full O(n log n) sort, since `n` here is always tiny (TIME_OF_DAY_WINDOW, 14) -- inserting into
// an n-sized array is effectively a constant-time step relative to the size of `items`, which can
// be a task's *entire* completion history. Extracted 2026-08-14 alongside getTimeOfDayWindow below,
// replacing a plain `[...all].sort(...).slice(0, n)` that scaled with total lifetime history just
// to answer a "top 14" question.
const selectMostRecentByCompletedAt = (items: readonly TaskCompletion[], n: number): TaskCompletion[] => {
  const buffer: TaskCompletion[] = [];
  for (const item of items) {
    if (buffer.length < n) {
      insertSortedAscending(buffer, item);
    } else if (item.completedAt > buffer[0].completedAt) {
      buffer.shift();
      insertSortedAscending(buffer, item);
    }
  }
  return buffer.reverse(); // ascending -> newest-first, matching the convention every caller expects
};

const insertSortedAscending = (buffer: TaskCompletion[], item: TaskCompletion): void => {
  let i = buffer.length;
  buffer.push(item);
  while (i > 0 && buffer[i - 1].completedAt > buffer[i].completedAt) {
    [buffer[i - 1], buffer[i]] = [buffer[i], buffer[i - 1]];
    i--;
  }
};

// Shared by detectCompletionAchievements (checking whether early-bird/night-owl just crossed) and
// getAchievementCardStatus's own `time-of-day-ratio` case (showing live progress toward them) --
// previously two independent implementations of "gather the trailing window across active tasks,
// see if there are enough samples to even consider it," which had already drifted apart by the
// time this was extracted: the display side never enforced the same `minSamples` floor detection
// did, so a locked card's progress bar could show a misleadingly "close" or "done"-looking number
// (e.g. "1/1") from a tiny handful of completions detection wouldn't yet consider eligible at all.
// Both callers now share one gate, so they can't disagree on that again. `override` preserves
// detectRetroactiveAchievements' own already-sorted-and-windowed slice (see its own comment) so the
// replay loop still avoids re-deriving this per historical event.
interface TimeOfDayWindow {
  recent: readonly TaskCompletion[]; // newest-first, capped at `window`
  meetsMinSamples: boolean;
}

const recentCompletionsByArray = new WeakMap<TaskCompletion[], Map<number, readonly TaskCompletion[]>>();
const EMPTY_RECENT_COMPLETIONS: readonly TaskCompletion[] = Object.freeze([]);

// Same immutable-reference rule as streaks.ts's cached completion-count maps. Keep only a task's
// newest `window` records, freeze the shared result, and cache it by that exact completions array.
// A live completion replaces one task's array, so only that task rescans its full history; every
// unchanged task contributes at most `window` cached candidates to the final cross-task merge.
const getCachedRecentCompletions = (
  completions: readonly TaskCompletion[],
  window: number
): readonly TaskCompletion[] => {
  if (completions.length === 0 || window <= 0) return EMPTY_RECENT_COMPLETIONS;

  const key = completions as TaskCompletion[];
  let byWindow = recentCompletionsByArray.get(key);
  const cached = byWindow?.get(window);
  if (cached) return cached;

  const recent = Object.freeze(selectMostRecentByCompletedAt(completions, window));
  if (!byWindow) {
    byWindow = new Map();
    recentCompletionsByArray.set(key, byWindow);
  }
  byWindow.set(window, recent);
  return recent;
};

const getTimeOfDayWindow = (
  activeTasks: Task[],
  window: number,
  minSamples: number,
  override?: readonly TaskCompletion[],
): TimeOfDayWindow => {
  let recent = override;
  if (!recent) {
    const candidates: TaskCompletion[] = [];
    for (const task of activeTasks) {
      candidates.push(...getCachedRecentCompletions(task.completions ?? EMPTY_RECENT_COMPLETIONS, window));
    }
    recent = selectMostRecentByCompletedAt(candidates, window);
  }
  return { recent, meetsMinSamples: recent.length >= minSamples };
};

// Detects newly-earned achievements from a single task completion. Pure -- given the task's
// state immediately before and after the completion (both already carrying freshly computed
// `.stats`), the full task list *after* the completion (needed for perfect-day, which spans every
// task, not just the one just completed), the actual date the completion was *for* (not
// necessarily "today" -- TaskCalendarScreen can backfill a past date), and the dedup scopes of
// every one-time achievement already on record, returns whatever this specific completion newly
// earned. No side effects, no id/timestamp assignment -- that's the caller's (the store's) job.
export const detectCompletionAchievements = (
  prevTask: Task,
  nextTask: Task,
  allTasksAfter: Task[],
  date: Date,
  alreadyEarnedScopes: Set<string>,
  // Optional performance escape hatches, both purely additive. The live taskStore path supplies
  // immutable-reference-cached per-task count maps; detectRetroactiveAchievements' replay loop
  // (which calls this once per historical completion) supplies its own incrementally maintained
  // maps plus an already-windowed recent slice. If the recent override is omitted, the shared
  // time-of-day helper below uses its own per-completions-array cache. None changes the rules --
  // only the source of the exact same count/window data.
  options?: {
    // Per-task completion-count-by-date maps (the live path uses streaks.ts's shared immutable-
    // reference cache for this exact problem) -- when
    // provided, perfect-day/perfect-week's own day-completion checks read from these instead of
    // linearly rescanning each task's own `completions` array via `isTaskCompleted` every time.
    completionCountsByTaskId?: ReadonlyMap<string, ReadonlyMap<string, number>>;
    // An already-sorted-newest-first, already-capped-to-TIME_OF_DAY_WINDOW slice of the most
    // recent completions across every active task -- when provided, early-bird/night-owl use it
    // directly instead of flattening and re-sorting every active task's own completions from
    // scratch on every call.
    recentCompletionsOverride?: readonly TaskCompletion[];
  },
): EarnedAchievement[] => {
  const nextStats = nextTask.stats;
  if (!nextStats) return [];
  const prevStats = prevTask.stats;
  const prevCurrent = prevStats?.currentStreak ?? 0;
  const prevBest = prevStats?.bestStreak ?? 0;
  const meta = taskMeta(nextTask);
  const earned: EarnedAchievement[] = [];
  // Computed once up front (previously only computed partway through, right before the perfect-day
  // check) since REPEATABLE_TASK_SCOPED_KINDS' own dedupScope-qualifying below now needs it too.
  const dateString = format(date, 'yyyy-MM-dd');

  const isFirstEarn = (kind: AchievementKind, scope: string) => !alreadyEarnedScopes.has(dedupKey(kind, scope));
  // For REPEATABLE_TASK_SCOPED_KINDS (see that set's own comment for the full "why"), a bare
  // taskId scope can't distinguish an undo-then-redo replay of the identical crossing from a
  // genuine new one -- qualifying by the date this crossing happened on fixes that, since a
  // specific calendar date can only ever be "the day this task crossed threshold X" once. Every
  // other kind keeps its existing bare-taskId (or 'global') scope unchanged.
  const dedupScopeFor = (kind: AchievementKind, taskId: string): string =>
    REPEATABLE_TASK_SCOPED_KINDS.has(kind) ? `${taskId}:${dateString}` : taskId;

  // Same formula isTaskCompleted itself uses (getCompletionCount(t, date) >= its own timesPerDay)
  // -- this doesn't reimplement that rule, it just sources the count from the caller's own
  // precomputed map when one's supplied, instead of always calling through to a fresh linear scan.
  const isCompletedOnDate = (t: Task, d: Date): boolean => {
    const byDate = options?.completionCountsByTaskId?.get(t.id);
    if (!byDate) return isTaskCompleted(t, d);
    const count = byDate.get(format(d, 'yyyy-MM-dd')) ?? 0;
    return count >= (t.timesPerDay || 1);
  };

  // Every fixed-threshold kind shares the identical "crossed this metric's own threshold" shape
  // -- one generic loop over ACHIEVEMENT_META-derived tiers, rather than one special-cased block
  // per kind. `scope` (global vs. per-task, see AchievementMeta's own comment) decides both the
  // dedup key and whether task identity gets attached -- this is what lets first-completion
  // (global, reading totalCompletions) and streak-2 (per-task, reading currentStreak) share this
  // same loop despite reading entirely different metrics and firing on different crossings.
  for (const { kind, metric, target } of FIXED_THRESHOLD_ENTRIES) {
    const prevValue = prevStats?.[metric] ?? 0;
    const nextValue = nextStats[metric];
    if (prevValue >= target || nextValue < target) continue;
    const isGlobal = ACHIEVEMENT_META[kind].scope === 'global';
    const dedupScope = isGlobal ? 'global' : dedupScopeFor(kind, nextTask.id);
    if (!isFirstEarn(kind, dedupScope)) continue;
    earned.push({ kind, ...(isGlobal ? {} : meta), value: target, dedupScope });
  }

  // Task-age kinds (anniversary) -- evaluated against `date` (the day this completion was
  // actually *for*), same reasoning as perfect-day's own use of `date` over "today" below. Since
  // `createdAt` never changes, there's no real prev/next transition to detect here the way
  // currentStreak crossing a threshold has -- a plain `>= days` check plus the standard dedup
  // guard is sufficient, because `repeatable: false` means the store's own dedup set already
  // blocks this from ever firing a second time for the same task once recorded.
  for (const { kind, days } of TASK_AGE_ENTRIES) {
    if (!hasReachedTaskAge(nextTask, days, date)) continue;
    if (!isFirstEarn(kind, nextTask.id)) continue;
    earned.push({ kind, ...meta, value: days, dedupScope: nextTask.id });
  }

  // New best streak -- repeatable, but only for a *genuine* record: a real prior ceiling has to
  // have existed above where this run started (prevCurrent < prevBest), and this completion has
  // to actually cross it. Without the first clause, a brand-new task's very first unbroken climb
  // would trigger this on nearly every day -- bestStreak trivially equals currentStreak the whole
  // way up when there's no earlier closed run to compare against (see streaks.ts's
  // `Math.max(longestRunIncludingClose(...), currentStreak)`), so "currentStreak > previous best"
  // alone is true on almost every single day of that climb, not just the one day that matters.
  // This is a genuinely bespoke rule (not a fixed-threshold pattern), so it stays its own block.
  if (
    prevCurrent < prevBest &&
    nextStats.currentStreak > prevBest &&
    nextStats.currentStreak >= FIRST_STREAK_THRESHOLD
  ) {
    earned.push({ kind: 'new-best-streak', ...meta, value: nextStats.currentStreak, dedupScope: dedupScopeFor('new-best-streak', nextTask.id) });
  }

  // Comeback -- repeatable; the task had genuinely lapsed (not just "not yet due today") right
  // before this completion revived it. Also bespoke -- reuses the same `isReady` predicate its
  // own ACHIEVEMENT_META entry already declares for Trophy Case progress, so the "what counts as
  // lapsed" definition can't drift between the two.
  //
  // Unlike new-best-streak (deliberately never gated -- see that block's own comment on why its
  // condition is already self-protecting against a redo), comeback's condition is NOT
  // self-protecting: `prevTask.stats.streakStatus === 'expired'` is exactly the state an undo
  // reverts back to, so a redo of the identical completion sees the identical "was expired" prev
  // state again and would otherwise re-fire every time -- this was the actual undo/redo-spam bug
  // for this kind. Gated behind isFirstEarn using the same date-qualified scope the value is
  // recorded with, so a same-date replay is blocked while a genuine future revival still fires.
  const comebackStrategy = ACHIEVEMENT_META.comeback.progressStrategy;
  if (comebackStrategy.type === 'readiness' && comebackStrategy.isReady(prevTask) && nextStats.currentStreak > 0) {
    const comebackScope = dedupScopeFor('comeback', nextTask.id);
    if (isFirstEarn('comeback', comebackScope)) {
      earned.push({ kind: 'comeback', ...meta, value: nextStats.currentStreak, dedupScope: comebackScope });
    }
  }

  // Perfect day -- global, evaluated against `date` (the day this completion was actually *for*),
  // not "today" -- a backfilled past-date completion should be judged against whether *that* day
  // was perfect, not today. Requires at least PERFECT_DAY_MIN_DUE_TASKS due tasks (2026-08-12, per
  // explicit user direction) -- a day with nothing due for anyone was already excluded, but a day
  // with exactly one due task used to trivially "win" too, with nothing genuinely riding on it.
  // Bespoke -- the only kind whose detection spans every task rather than just the one that was
  // just completed. `repeatable: true` here means "a different date can still be earned
  // separately," not "the same date can repeat" -- achievementsStore.ts's own dedup-set builder
  // now protects the latter directly (see REPEATABLE_TASK_SCOPED_KINDS' own comment), so
  // `isFirstEarn` is a genuine same-date guard across calls, not just within this one.
  if (isFirstEarn('perfect-day', dateString)) {
    const dueTasks = allTasksAfter.filter(t => !t.archived && isDueOnDate(t, date));
    if (dueTasks.length >= PERFECT_DAY_MIN_DUE_TASKS && dueTasks.every(t => isCompletedOnDate(t, date))) {
      earned.push({ kind: 'perfect-day', value: dueTasks.length, dedupScope: dateString });
    }
  }

  // ============================================================================================
  // Five kinds added 2026-08-12 -- see their own ACHIEVEMENT_META entries above for the full
  // per-kind reasoning. `activeTasksAfter` is shared by all six (none of them are meaningfully
  // affected by archived-task history the way, say, Century Club's "lifetime" framing might
  // tempt you to include it -- keeping detection scoped to the same `activeTasks` universe
  // getAchievementCardStatus's own progress calculations can see keeps the two from ever
  // disagreeing about what's being measured).
  // ============================================================================================
  const activeTasksAfter = allTasksAfter.filter(t => !t.archived);

  // Perfect week -- 7 consecutive perfect days ending on `date`. Only fires on the exact day the
  // trailing window first becomes fully perfect (today's window is perfect, but yesterday's own
  // trailing window wasn't) -- the same "fire on the crossing, not on every day the condition
  // stays true" convention every other kind in this file already follows; without the second
  // check, a long perfect streak would re-fire this every single day it continues past 7, not
  // just once when it first reaches 7.
  const isPerfectDayOn = (checkDate: Date): boolean => {
    const due = activeTasksAfter.filter(t => isDueOnDate(t, checkDate));
    return due.length >= PERFECT_DAY_MIN_DUE_TASKS && due.every(t => isCompletedOnDate(t, checkDate));
  };
  const isPerfectWeekEndingOn = (endDate: Date): boolean => {
    for (let i = 0; i < PERFECT_WEEK_DAYS; i++) {
      if (!isPerfectDayOn(subDays(endDate, i))) return false;
    }
    return true;
  };
  if (
    isFirstEarn('perfect-week', dateString) &&
    isPerfectWeekEndingOn(date) &&
    !isPerfectWeekEndingOn(subDays(date, 1))
  ) {
    earned.push({ kind: 'perfect-week', value: PERFECT_WEEK_DAYS, dedupScope: dateString });
  }

  // Century club -- a global lifetime sum of totalCompletions across every active task, crossing
  // each tier's own target (see TOTAL_COMPLETIONS_SUM_ENTRIES). `delta` isolates just this one
  // completion's own contribution to the sum (nextTask's own totalCompletions minus its prior
  // value) so `prevSum` can be derived without a separate "every task's stats before this
  // mutation" snapshot -- every other task's own stats are already unchanged in
  // `activeTasksAfter`, only nextTask's own differs. `nextSum`/`delta` are computed once, outside
  // the loop, since neither depends on which tier is being checked.
  const nextSum = activeTasksAfter.reduce((sum, t) => sum + (t.stats?.totalCompletions ?? 0), 0);
  const sumDelta = nextStats.totalCompletions - (prevStats?.totalCompletions ?? 0);
  const prevSum = nextSum - sumDelta;
  for (const { kind, target } of TOTAL_COMPLETIONS_SUM_ENTRIES) {
    if (prevSum >= target || nextSum < target) continue;
    if (!isFirstEarn(kind, 'global')) continue;
    earned.push({ kind, value: target, dedupScope: 'global' });
  }

  // Active-task-count kinds (currently just habit-collector) -- reaching some active-task cap.
  // Evaluated fresh on every completion, not as a crossing check, since there's no real
  // "before/after" transition to diff here -- completing a task doesn't itself change how many
  // tasks exist. This means it's only ever detected on the *next* completion after the
  // cap-reaching task was actually added, not the instant it was added -- an accepted tradeoff of
  // this feature's single trigger point (completeTask only, see taskStore.ts), not a new one
  // introduced here. Loops over ACTIVE_TASK_COUNT_ENTRIES generically (2026-08-14, replacing a
  // single hardcoded `if` that only ever checked 'habit-collector' against MAX_ACTIVE_TASKS
  // directly) -- matching every other multi-kind family in this function (FIXED_THRESHOLD_ENTRIES,
  // TASK_AGE_ENTRIES, TOTAL_COMPLETIONS_SUM_ENTRIES): a future second active-task-count kind now
  // needs only its own ACHIEVEMENT_META entry to be detected live, same as detectRetroactiveAchievements'
  // own already-generic loop over this same list.
  for (const { kind, target } of ACTIVE_TASK_COUNT_ENTRIES) {
    if (!isFirstEarn(kind, 'global')) continue;
    if (activeTasksAfter.length >= target) {
      earned.push({ kind, value: target, dedupScope: 'global' });
    }
  }

  // Early bird / night owl -- the first two kinds in this file to read raw completion
  // *timestamps* (`TaskCompletion.completedAt`) rather than precomputed `.stats`. Both re-read
  // their own hour/direction/window from their own ACHIEVEMENT_META entry (mirroring comeback's
  // own "re-read my own progressStrategy rather than duplicate the predicate" pattern above) so
  // detection and the Trophy Case's own progress bar can never disagree about what "early" or
  // "late" means.
  const earlyBirdStrategy = ACHIEVEMENT_META['early-bird'].progressStrategy;
  const nightOwlStrategy = ACHIEVEMENT_META['night-owl'].progressStrategy;
  if (
    earlyBirdStrategy.type === 'time-of-day-ratio' &&
    nightOwlStrategy.type === 'time-of-day-ratio' &&
    (isFirstEarn('early-bird', 'global') || isFirstEarn('night-owl', 'global'))
  ) {
    const { recent, meetsMinSamples } = getTimeOfDayWindow(
      activeTasksAfter, TIME_OF_DAY_WINDOW, TIME_OF_DAY_MIN_SAMPLES, options?.recentCompletionsOverride
    );
    if (meetsMinSamples) {
      const earlyCount = recent.filter(c => new Date(c.completedAt).getHours() < earlyBirdStrategy.hour).length;
      const lateCount = recent.filter(c => new Date(c.completedAt).getHours() >= nightOwlStrategy.hour).length;
      if (isFirstEarn('early-bird', 'global') && earlyCount / recent.length >= 0.5) {
        earned.push({ kind: 'early-bird', value: earlyCount, dedupScope: 'global' });
      }
      if (isFirstEarn('night-owl', 'global') && lateCount / recent.length >= 0.5) {
        earned.push({ kind: 'night-owl', value: lateCount, dedupScope: 'global' });
      }
    }
  }

  return earned;
};

// Retroactively evaluates every achievement a task list's *history* actually earned, not just
// whatever its current stats happen to show -- a genuine chronological replay, not a one-shot
// snapshot check. Powers TrophiesScreen's/Settings' manual "catch up" scan for history that
// predates this feature, was imported, or just never happened to trigger live detection at the
// right moment.
//
// Why replay instead of a snapshot: a repeatable kind's *current* state can only ever reveal its
// most recent crossing. A task whose streak has broken and restarted three times only shows one
// live "Streak Started!" moment in a plain snapshot of `currentStreak`, even though it genuinely
// earned that moment three separate times across its real history. Completion records already
// carry what's needed to reconstruct that whole history -- this walks every completion across
// every active task, in the exact order they were actually *recorded*, replaying each one through
// the same detectCompletionAchievements the live completion path already uses.
//
// Two distinct dates matter per completion, for two different reasons -- getting this right is
// what makes the replay actually match live behavior:
//   - `completion.completedAt` -- the real-world moment the press happened. Live completion
//     (taskStore.completeTask, via withUpdatedStats) always computes stats against real "now" at
//     press time, *regardless* of which day the press was actually *for* -- so a genuine backfill
//     (completing a past day via the Calendar tab well after the fact) evaluates currentStreak/
//     bestStreak/streakStatus as of the backfill's own real moment, not the backfilled day. This
//     is what lets a backfill "bridge" an old closed run and an already-open one into a single
//     jump past a prior record in one step (see achievements.ts's own `new-best-streak` comment,
//     and this function's own tests) -- replaying by *completedAt* order, and using it as
//     calculateTaskStats' asOfDate, reproduces that exactly. For an ordinary same-day tap,
//     completedAt's date always equals `date`, so this is a no-op difference for the common case.
//   - `completion.date` -- which calendar day the completion actually counts *for*. Used
//     unchanged as detectCompletionAchievements' own `date` parameter, driving perfect-day/
//     perfect-week/anniversary's date-scoped logic exactly as it already does live.
//
// Two kinds are deliberately NOT part of this replay, and keep their own simple current-snapshot
// check instead, since replay wouldn't add anything: `task-age` (anniversary -- pure calendar
// time, unaffected by completion history, and one-time regardless) and `active-task-count`
// (habit-collector -- driven by task *existence*, not completions, and also one-time).
//
// A real, inherent limitation shared with the old snapshot-only version: this can only see each
// task's *current* configuration (frequency, schedule, archived state) -- there's no historical
// record of e.g. when a task was archived or had its schedule changed, so every replayed moment
// assumes today's task list and settings held constant throughout. Good enough for the common
// case (a task's schedule rarely changes), not a perfect reconstruction.
export const detectRetroactiveAchievements = (
  achievements: Achievement[],
  activeTasks: Task[],
  today: Date = new Date(),
): EarnedAchievement[] => {
  const earned: EarnedAchievement[] = [];

  // Ordinary exact-scope dedup -- correct as-is for every kind EXCEPT the repeatable/task-scoped
  // ones (see REPEATABLE_TASK_SCOPED_KINDS' own comment), which get the counting-based guard
  // below instead. Mutated as the replay discovers new one-time/date-scoped achievements, exactly
  // mirroring how the live store's own alreadyEarnedScopes accumulates across real completions.
  const alreadyEarnedScopes = new Set(
    achievements
      .filter(a => !REPEATABLE_TASK_SCOPED_KINDS.has(a.kind))
      .map(a => dedupKey(a.kind, a.dedupScope))
  );

  // How many times each (kind, taskId) pair has ALREADY been recorded, for the repeatable
  // task-scoped kinds. Their scope is deliberately never added to alreadyEarnedScopes (that would
  // permanently block every future crossing for that task, not just the ones already on record),
  // so the replay is free to rediscover every genuine historical crossing -- the first N it finds,
  // in chronological order, are skipped here as already-accounted-for; only a crossing beyond
  // what's already on record actually counts as newly earned.
  //
  // Keyed on plain `${kind}:${taskId}`, deliberately NOT the record's own literal `dedupScope` --
  // dedupScopeFor (see its own comment) now date-qualifies these kinds' dedupScope (e.g.
  // `t1:2026-01-06` instead of bare `t1`), so the *exact* scope string genuinely differs between
  // two real, separate crossings of the same tier for the same task. A count keyed on that literal
  // string would only ever match a crossing that happened to land on the identical date, silently
  // treating every other already-recorded crossing as "never happened" -- including every record
  // that predates this date-qualification change entirely (all sharing the old, bare-taskId
  // format). `taskId` alone is stable regardless of which dedupScope format produced it, so this
  // is what actually answers "how many times has this task already earned this kind," independent
  // of the string shape any individual record happens to carry.
  const alreadyRecordedCounts = new Map<string, number>();
  for (const a of achievements) {
    if (!REPEATABLE_TASK_SCOPED_KINDS.has(a.kind) || !a.taskId) continue;
    const key = `${a.kind}:${a.taskId}`;
    alreadyRecordedCounts.set(key, (alreadyRecordedCounts.get(key) ?? 0) + 1);
  }

  // Task-age (anniversary) -- not completion-driven, so not part of the replay below; see this
  // function's own top comment for why.
  for (const { kind, days } of TASK_AGE_ENTRIES) {
    for (const task of activeTasks) {
      if (alreadyEarnedScopes.has(dedupKey(kind, task.id))) continue;
      if (hasReachedTaskAge(task, days, today)) {
        earned.push({ kind, ...taskMeta(task), value: days, dedupScope: task.id });
      }
    }
  }

  // Habit collector (active-task-count) -- also not completion-driven; same reasoning.
  for (const { kind, target } of ACTIVE_TASK_COUNT_ENTRIES) {
    if (alreadyEarnedScopes.has(dedupKey(kind, 'global'))) continue;
    if (activeTasks.length >= target) earned.push({ kind, value: target, dedupScope: 'global' });
  }

  // The chronological replay itself -- one event per (task, completion), ordered by completedAt
  // (see this function's own top comment for why that's the correct order, not completion.date).
  const events: { task: Task; completion: TaskCompletion }[] = [];
  for (const task of activeTasks) {
    for (const completion of task.completions ?? []) {
      events.push({ task, completion });
    }
  }
  events.sort((a, b) => a.completion.completedAt.localeCompare(b.completion.completedAt));

  // Each task's own completions, accumulated in completedAt order as the replay proceeds -- "what
  // this task's own record looked like at the real moment we've replayed up through so far".
  const runningCompletions = new Map<string, TaskCompletion[]>();

  // Two performance-only accumulators, threaded into detectCompletionAchievements' own optional
  // `options` (see that function's own comment on why these are safe, non-duplicative additions).
  // Both are maintained incrementally as the replay proceeds -- O(1) work per event -- rather than
  // rebuilt from scratch on every call, which is what made this scan slow in practice on a real
  // device (a `calculateTaskStats`-style full rescan, but happening inside perfect-day/perfect-week
  // and early-bird/night-owl's own checks too, once per historical completion instead of once per
  // real press).
  //
  // Per-task completion-count-by-date map, updated with just this event's own one new entry each
  // time (O(1)) instead of rebuilding via buildCompletionCountsByDate from that task's *entire*
  // completions-so-far on every event (O(n) per event, O(n²) overall for that task's own history).
  const completionCountsByTaskId = new Map<string, Map<string, number>>();

  for (let i = 0; i < events.length; i++) {
    const { task, completion } = events[i];
    const recordedAt = new Date(completion.completedAt);
    const forDate = parseISO(completion.date);

    const priorCompletions = runningCompletions.get(task.id) ?? [];
    const prevTask: Task = { ...task, completions: priorCompletions, stats: calculateTaskStats(task, priorCompletions, recordedAt) };

    const nextCompletions = [...priorCompletions, completion];
    runningCompletions.set(task.id, nextCompletions);
    const nextTask: Task = { ...task, completions: nextCompletions, stats: calculateTaskStats(task, nextCompletions, recordedAt) };

    const taskCounts = completionCountsByTaskId.get(task.id) ?? new Map<string, number>();
    taskCounts.set(completion.date, completion.timesCompleted);
    completionCountsByTaskId.set(task.id, taskCounts);

    // Every active task's own completions as accumulated up through this same real moment --
    // `.stats` isn't recomputed for tasks other than the one completing right now, since nothing
    // detectCompletionAchievements' own cross-task logic reads (perfect-day/perfect-week read raw
    // completions via isDueOnDate/isCompletedOnDate, not `.stats`; century-club's sum reads
    // totalCompletions, which is just `completions.length` and so isn't asOfDate-sensitive at all)
    // actually needs it. A task that didn't exist yet as of this moment (createdAt still in the
    // future) is excluded entirely, the same way a real historical moment wouldn't have known
    // about it either.
    const allTasksAsOfNow = activeTasks
      .filter(t => differenceInCalendarDays(recordedAt, parseISO(t.createdAt)) >= 0)
      .map(t => (t.id === task.id ? nextTask : { ...t, completions: runningCompletions.get(t.id) ?? [] }));

    // The trailing TIME_OF_DAY_WINDOW completions across every active task, up to and including
    // this one -- `events` is already sorted ascending by completedAt, so this is a plain O(window)
    // index slice into data already in hand, not a re-derivation from allTasksAsOfNow.
    const windowStart = Math.max(0, i - TIME_OF_DAY_WINDOW + 1);
    const recentCompletionsOverride = events.slice(windowStart, i + 1).map(e => e.completion).reverse();

    const newlyEarnedNow = detectCompletionAchievements(prevTask, nextTask, allTasksAsOfNow, forDate, alreadyEarnedScopes, {
      completionCountsByTaskId,
      recentCompletionsOverride,
    });

    for (const item of newlyEarnedNow) {
      if (REPEATABLE_TASK_SCOPED_KINDS.has(item.kind) && item.taskId) {
        // Same taskId-only key as alreadyRecordedCounts' own build-up above -- see that map's
        // comment for why this can't be the item's own (now date-qualified) dedupScope string.
        const countKey = `${item.kind}:${item.taskId}`;
        const remaining = alreadyRecordedCounts.get(countKey) ?? 0;
        if (remaining > 0) {
          alreadyRecordedCounts.set(countKey, remaining - 1);
          continue; // already accounted for by an existing record -- not a new find
        }
      } else {
        // Block this exact scope from firing again later in the same replay -- mirrors how the
        // live store's own alreadyEarnedScopes grows across real completions.
        alreadyEarnedScopes.add(dedupKey(item.kind, item.dedupScope));
      }
      earned.push(item);
    }
  }

  return earned;
};

export interface AchievementProgress {
  current: number;
  target: number;
  // Snapshotted from whichever live task is currently closest to earning this kind -- omitted for
  // global-scope progress (perfect-day, and first-completion once unlocked), which isn't
  // attributable to one task.
  taskName?: string;
  taskColor?: string;
}

// A single distinct task that has earned a kind at least once -- used for the Trophy Case's
// at-a-glance "which tasks have this" icon row (see AchievementCardStatus.earners below), not for
// the celebration screen's own (much richer) unlock history, which reads straight off `Achievement`
// records instead.
export interface AchievementEarner {
  taskId: string;
  taskName: string;
  taskIcon?: MaterialCommunityIconName;
  taskColor?: string;
}

export interface AchievementCardStatus {
  kind: AchievementKind;
  unlocked: boolean;
  // How many separate instances exist in history -- meaningful even for per-task kinds, since two
  // different tasks (or the same task, now that most kinds are repeatable) can each earn their
  // own copy of e.g. streak-10.
  timesEarned: number;
  // The most recently earned instance, when unlocked -- carries its own snapshotted
  // taskName/taskColor/earnedAt for display, so TrophiesScreen never needs to cross-reference the
  // live task list (which may have since renamed/deleted/recolored the task that earned it).
  latest?: Achievement;
  // Every distinct task that's earned this kind at least once, most-recently-earned first --
  // per explicit user direction ("put the task icons on the trophy tiles so at a glance you know
  // which ones have them"). Empty for a locked kind or a global kind (first-completion, perfect-day),
  // neither of which has a per-task earner to show.
  earners: AchievementEarner[];
  // Only present when there's a meaningful numeric "how close" to show (fixed-threshold kinds,
  // new-best-streak, perfect-day) -- absent for comeback, which has no clean fraction.
  progress?: AchievementProgress;
  // comeback-specific: true when at least one active task is currently lapsed and could earn this
  // the moment it's revived. No numeric fraction fits "will you ever complete it again" -- this is
  // a simple readiness flag instead of a progress bar.
  opportunityAvailable?: boolean;
}

// Computes a single kind's Trophy Case card state: unlocked (with its most recent earn) or locked
// (with, where a meaningful metric exists, live "how close" progress derived from the current
// task list). Dispatches purely on `progressStrategy.type` (a small closed set of computation
// patterns), never on `kind` itself -- a new kind that reuses an existing strategy type needs no
// changes here at all. Pure and testable like the rest of this module -- `today` is a parameter
// (not implicitly `new Date()`) purely so tests can pin it.
export const getAchievementCardStatus = (
  kind: AchievementKind,
  achievements: Achievement[],
  activeTasks: Task[],
  today: Date = new Date(),
): AchievementCardStatus => {
  const earnedForKind = achievements.filter(a => a.kind === kind);
  const unlocked = earnedForKind.length > 0;
  const latest = unlocked
    ? earnedForKind.reduce((most, a) => (a.earnedAt > most.earnedAt ? a : most))
    : undefined;

  // Dedup to one entry per distinct task, keeping whichever instance is most recent for that
  // task, then sort the *tasks* themselves newest-first by that same instance.
  const earnersByTask = new Map<string, Achievement>();
  for (const a of earnedForKind) {
    if (!a.taskId) continue;
    const existing = earnersByTask.get(a.taskId);
    if (!existing || a.earnedAt > existing.earnedAt) earnersByTask.set(a.taskId, a);
  }
  const earners: AchievementEarner[] = Array.from(earnersByTask.values())
    .sort((a, b) => b.earnedAt.localeCompare(a.earnedAt))
    .map(a => ({ taskId: a.taskId!, taskName: a.taskName!, taskIcon: a.taskIcon, taskColor: a.taskColor }));

  const base = { kind, unlocked, timesEarned: earnedForKind.length, latest, earners };

  const strategy = ACHIEVEMENT_META[kind].progressStrategy;

  switch (strategy.type) {
    case 'fixed-threshold': {
      const { metric, target } = strategy;
      // Progress is only meaningful for tasks that haven't already earned this specific kind --
      // a task that's already earned streak-10 isn't "in progress" toward it anymore, it's done.
      // (For a global kind like first-completion this set is always empty, since earned instances
      // carry no taskId -- fine, since TrophiesScreen never renders progress once unlocked.)
      const earnedTaskIds = new Set(earnedForKind.map(a => a.taskId));
      let best: { task: Task; value: number } | undefined;
      for (const task of activeTasks) {
        if (earnedTaskIds.has(task.id)) continue;
        const value = Math.min(task.stats?.[metric] ?? 0, target);
        if (!best || value > best.value) best = { task, value };
      }
      return {
        ...base,
        progress: best
          ? { current: best.value, target, taskName: best.task.name, taskColor: best.task.color }
          : undefined,
      };
    }

    case 'ratio-to-own-best': {
      // "How close" here means how close some task's currently-open run is to tying its own
      // historical best -- the task with the highest currentStreak/bestStreak ratio among those
      // that haven't already tied or passed it (a tied/passed run isn't "in progress", it's either
      // about to fire or already did).
      let best: { task: Task; current: number; target: number } | undefined;
      for (const task of activeTasks) {
        const stats = task.stats;
        if (!stats || stats.bestStreak <= 0 || stats.currentStreak >= stats.bestStreak) continue;
        if (!best || stats.currentStreak / stats.bestStreak > best.current / best.target) {
          best = { task, current: stats.currentStreak, target: stats.bestStreak };
        }
      }
      return {
        ...base,
        progress: best
          ? { current: best.current, target: best.target, taskName: best.task.name, taskColor: best.task.color }
          : undefined,
      };
    }

    case 'readiness':
      return { ...base, opportunityAvailable: activeTasks.some(strategy.isReady) };

    case 'today-progress': {
      // Live progress toward *today's* perfect day specifically, independent of whether it's
      // ever been earned before (it's repeatable across different dates, so "unlocked" and
      // "still has today's own progress to show" aren't mutually exclusive the way they are for
      // the one-time-per-task kinds above).
      const dueTasks = activeTasks.filter(t => isDueOnDate(t, today));
      const doneCount = dueTasks.filter(t => isTaskCompleted(t, today)).length;
      return {
        ...base,
        // Below PERFECT_DAY_MIN_DUE_TASKS, today can never actually become "perfect" regardless
        // of doneCount -- no progress to show, same as a day with nothing due at all.
        progress: dueTasks.length >= PERFECT_DAY_MIN_DUE_TASKS ? { current: doneCount, target: dueTasks.length } : undefined,
      };
    }

    case 'task-age': {
      // Same "closest not-yet-earned task, capped at target" shape as fixed-threshold above, just
      // reading a task's own elapsed age (via `createdAt`) instead of a live stat.
      const { days } = strategy;
      const earnedTaskIds = new Set(earnedForKind.map(a => a.taskId));
      let best: { task: Task; value: number } | undefined;
      for (const task of activeTasks) {
        if (earnedTaskIds.has(task.id)) continue;
        const value = Math.min(differenceInCalendarDays(today, parseISO(task.createdAt)), days);
        if (!best || value > best.value) best = { task, value };
      }
      return {
        ...base,
        progress: best
          ? { current: best.value, target: days, taskName: best.task.name, taskColor: best.task.color }
          : undefined,
      };
    }

    case 'perfect-day-streak': {
      // Same "walk backward from today counting consecutive perfect days" logic
      // isPerfectWeekEndingOn uses in detectCompletionAchievements above, just evaluated against
      // `today` instead of a specific completion's own date, and against the caller's own
      // `activeTasks` rather than re-deriving them.
      const { days } = strategy;
      let count = 0;
      for (let i = 0; i < days; i++) {
        const checkDate = subDays(today, i);
        const due = activeTasks.filter(t => isDueOnDate(t, checkDate));
        if (due.length < PERFECT_DAY_MIN_DUE_TASKS || !due.every(t => isTaskCompleted(t, checkDate))) break;
        count++;
      }
      return { ...base, progress: { current: count, target: days } };
    }

    case 'total-completions-sum': {
      const { target } = strategy;
      const sum = activeTasks.reduce((s, t) => s + (t.stats?.totalCompletions ?? 0), 0);
      return { ...base, progress: { current: Math.min(sum, target), target } };
    }

    case 'active-task-count': {
      const { target } = strategy;
      return { ...base, progress: { current: Math.min(activeTasks.length, target), target } };
    }

    case 'time-of-day-ratio': {
      // "How close" here is a fraction of the same trailing window the detector itself reads --
      // qualifying completions out of the window, against half the window as the target (matching
      // the >= 50% rule detectCompletionAchievements applies). Now genuinely the *same* window via
      // getTimeOfDayWindow (shared with the detector, see that function's own comment) -- no
      // progress shown until `minSamples` is met, matching detection's own eligibility floor
      // exactly, rather than this branch's own previous, looser "at least one completion" check
      // (which could show a misleadingly close/complete-looking bar from a tiny sample detection
      // wouldn't yet consider eligible at all).
      const { hour, direction, window, minSamples } = strategy;
      const { recent, meetsMinSamples } = getTimeOfDayWindow(activeTasks, window, minSamples);
      if (!meetsMinSamples) return { ...base, progress: undefined };
      const qualifying = recent.filter(c => {
        const h = new Date(c.completedAt).getHours();
        return direction === 'before' ? h < hour : h >= hour;
      }).length;
      return { ...base, progress: { current: qualifying, target: Math.ceil(recent.length / 2) } };
    }
  }
};

export const getAllAchievementCardStatuses = (
  achievements: Achievement[],
  activeTasks: Task[],
  today: Date = new Date(),
  // Defaults to the full catalog; a caller already scoped to one task (TrophiesScreen's own task
  // filter, AchievementsPreviewCard's `taskScoped` mode) passes TASK_SCOPED_KIND_ORDER instead --
  // see that constant's own comment. Computing (then discarding) a global kind's status here isn't
  // free: `time-of-day-ratio` (early-bird/night-owl) in particular flattens and sorts *all* of
  // `activeTasks`' completions from scratch, twice, unbounded by how much history a task has --
  // a real, measurable cost on every single task switch when `activeTasks` is just the one
  // just-switched-to task, for two kinds that were only ever going to be filtered back out.
  kinds: AchievementKind[] = ACHIEVEMENT_KIND_ORDER,
): AchievementCardStatus[] =>
  kinds.map(kind => getAchievementCardStatus(kind, achievements, activeTasks, today));

// Trophy Case display grouping -- per explicit user direction ("I just meant to visually group
// based on existing meta data. So it's just a multi-sort: first group by [unlocked, in progress,
// not started]..."), not the invented category taxonomy an earlier version of this file tried.
// Every input here is data getAchievementCardStatus already computes -- this only buckets and
// sorts it, no new state.
//
// Originally three visual sections (Unlocked / In Progress / Not Started); collapsed to two
// (Unlocked / Locked) per direct follow-up ("let's just have unlocked and locked, but in the
// locked section we put all the in-progress first, followed by all the not yet started,
// preserving the sorting within those lists") -- the *sorting* logic (closeness for in-progress,
// fixed catalog order for not-started) is completely unchanged, it's now just concatenated into
// one `locked` array instead of rendered as two separate headed sections.
export type AchievementStatusGroup = 'unlocked' | 'locked';

export interface GroupedAchievementCardStatuses {
  group: AchievementStatusGroup;
  label: string;
  statuses: AchievementCardStatus[];
}

// "How close" as a single 0-1 fraction, uniform across every progress shape so in-progress
// sorting can compare kinds with genuinely different strategies (a fixed-threshold streak count
// against comeback's own no-numeric-progress readiness flag) on one scale. A readiness kind with
// an opportunity available right now is treated as maximally close (1) -- it could fire on the
// very next completion, no waiting on a count required, which is at least as "close" as any
// numeric progress gets.
const progressFraction = (status: AchievementCardStatus): number => {
  if (status.progress && status.progress.target > 0) return status.progress.current / status.progress.target;
  return status.opportunityAvailable ? 1 : 0;
};

// Buckets every kind into unlocked / locked and sorts each per its own criterion, omitting any
// bucket that ends up empty -- a fresh install with nothing unlocked yet shouldn't show an empty
// "Unlocked" heading with nothing under it. `locked` is itself an in-progress-then-not-started
// concatenation (each half keeping its own original sort), not a single flat sort across both --
// closeness and catalog order aren't comparable on one scale, and this preserves the exact
// ordering the three-section design already had, just without the extra heading between them.
export const getGroupedAchievementCardStatuses = (
  achievements: Achievement[],
  activeTasks: Task[],
  today: Date = new Date(),
  // See getAllAchievementCardStatuses' own comment on this same param -- forwarded straight through.
  kinds: AchievementKind[] = ACHIEVEMENT_KIND_ORDER,
): GroupedAchievementCardStatuses[] => {
  const statuses = getAllAchievementCardStatuses(achievements, activeTasks, today, kinds);

  const unlocked = statuses
    .filter(s => s.unlocked)
    // Most recently earned first -- ISO timestamps sort lexically in chronological order, so a
    // plain string comparison is sufficient with no date parsing needed.
    .sort((a, b) => (b.latest?.earnedAt ?? '').localeCompare(a.latest?.earnedAt ?? ''));

  const inProgress = statuses
    .filter(s => !s.unlocked && progressFraction(s) > 0)
    .sort((a, b) => progressFraction(b) - progressFraction(a));

  const notStarted = statuses
    .filter(s => !s.unlocked && progressFraction(s) === 0)
    .sort((a, b) => ACHIEVEMENT_ORDER_INDEX[a.kind] - ACHIEVEMENT_ORDER_INDEX[b.kind]);

  const groups: GroupedAchievementCardStatuses[] = [
    { group: 'unlocked', label: 'Unlocked', statuses: unlocked },
    { group: 'locked', label: 'Locked', statuses: [...inProgress, ...notStarted] },
  ];

  return groups.filter(g => g.statuses.length > 0);
};
