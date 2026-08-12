import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns';
import { MaterialCommunityIconName, Task } from '../types';
import { isDueOnDate, isTaskCompleted } from './streaks';
import { MAX_ACTIVE_TASKS } from './taskLimits';

// Achievement celebrations -- purely cosmetic collectibles for now (a future point system may
// hang off this same data, but isn't part of this feature).
export type AchievementKind =
  | 'first-completion'
  | 'streak-2' | 'streak-5' | 'streak-10' | 'streak-25' | 'streak-50' | 'streak-100' | 'streak-1000'
  | 'new-best-streak'
  | 'anniversary'
  | 'milestone-10' | 'milestone-50' | 'milestone-100' | 'milestone-1000'
  | 'century-club'
  | 'perfect-day' | 'perfect-week'
  | 'beast-mode'
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
  // a global, cross-task aggregate rather than any single task's own stat. Covers century-club.
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

const taskName = (a: EarnedAchievement) => a.taskName ?? 'This task';

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
// "Century" is idiomatic here (a big round milestone number), not literal -- see century-club's
// own ACHIEVEMENT_META comment for why 1,000 was chosen over a literal 100.
const CENTURY_CLUB_TARGET = 1000;
// Shared by early-bird/night-owl's own progressStrategy entries and their bespoke detection --
// the trailing window of completions (across every active task, combined) considered, and the
// minimum sample size required before evaluating at all (avoids a lucky 2-early-completions
// false positive for a brand-new user).
const TIME_OF_DAY_WINDOW = 14;
const TIME_OF_DAY_MIN_SAMPLES = 10;
const EARLY_BIRD_HOUR = 7; // before 7am, local device time
const NIGHT_OWL_HOUR = 21; // at or after 9pm, local device time
const BEAST_MODE_DURATION_MINUTES = 10;

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
    // own global phrasing rather than falling back to a generic "This task" placeholder.
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
    describe: () => 'Every task completed today',
    repeatable: true,
    scope: 'global',
    flavorText: 'A clean sweep — nicely done!',
    numberBlock: { eyebrow: 'Perfect Day', unit: 'TASKS COMPLETED' },
    // A fixed word, not a count -- the number of tasks due that day isn't really the interesting
    // fact about a perfect day (it doesn't escalate/grow the way a streak or completion count
    // does, it's just whatever happened to be due), so a plain declaration reads better.
    ribbon: { kind: 'fixed', text: 'PERFECT' },
    triggerStandalone: v =>
      v !== undefined
        ? `All ${v.toLocaleString()} tasks due that day were completed.`
        : 'Every task due that day was completed.',
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
  // Six kinds added 2026-08-12, per explicit user direction ("add these new achievements you
  // proposed earlier: Perfect Week, Century Club, Habit Collector, Early Bird... Night Owl...
  // Beast Mode"). Four of these needed genuinely new ProgressStrategy variants (see that type's
  // own comments above) since none of the existing five patterns fit a cross-task aggregate sum,
  // an active-task count, a rolling time-of-day ratio, or a live consecutive-day lookback --
  // exactly the "genuinely novel progress shape" case that type's own doc comment anticipated.
  // Detection for all six is bespoke (see detectCompletionAchievements' own new blocks below),
  // same as new-best-streak/comeback/perfect-day already are, for the same reason: each is a
  // genuinely new *rule*, not another tier of an existing one.
  // ==========================================================================================

  // A direct escalation of perfect-day -- 7 consecutive perfect days (every due, non-archived
  // task completed each day) rather than just one. Global, repeatable (a genuinely later
  // 7-day window can still earn its own copy), dedup scope is the window's own end date so the
  // same window never double-fires.
  'perfect-week': {
    icon: 'calendar-week',
    title: 'Perfect Week!',
    describe: () => 'Every task completed, 7 days straight',
    repeatable: true,
    scope: 'global',
    flavorText: 'A full week without a single miss. Impressive.',
    numberBlock: { eyebrow: 'Perfect Week', unit: 'DAYS PERFECT' },
    ribbon: { kind: 'count', unit: 'DAYS' },
    triggerStandalone: v => `You completed every task, ${(v ?? PERFECT_WEEK_DAYS).toLocaleString()} days in a row.`,
    progressStrategy: { type: 'perfect-day-streak', days: PERFECT_WEEK_DAYS },
    color: { theme: 'Sapphire', base: '#1565C0', glow: '#42A5F5', accent: '#E3F2FD' }, // perfect-week
  },
  // A global, lifetime *sum* of totalCompletions across every active task -- distinct from any
  // single task's own milestone-N tier, which never aggregates across tasks. "Century" is used
  // idiomatically here (a big, round achievement number), not literally 100 -- 100 combined
  // completions across even two moderately-used tasks would trivially trip almost immediately,
  // undermining the "milestone" framing; 1,000 keeps it a genuine reach. One-time (like
  // milestone-N), since a lifetime sum never un-crosses a threshold in normal use.
  'century-club': {
    icon: 'crown',
    title: 'Century Club!',
    describe: () => 'Logged 1,000 completions across all your habits',
    repeatable: false,
    scope: 'global',
    flavorText: "You've officially put in the reps.",
    numberBlock: { eyebrow: 'Century Club', unit: 'TOTAL COMPLETIONS' },
    ribbon: { kind: 'count', unit: 'DONE' },
    triggerStandalone: v => `You've logged ${(v ?? CENTURY_CLUB_TARGET).toLocaleString()} completions across all your habits.`,
    progressStrategy: { type: 'total-completions-sum', target: CENTURY_CLUB_TARGET },
    color: { theme: 'Obsidian', base: '#212121', glow: '#616161', accent: '#FFD54F', useAccentText: true }, // century-club
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
    icon: 'weather-sunset-up',
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
    color: { theme: 'Midnight', base: '#10102B', glow: '#5C6BC0', accent: '#283593' }, // night-owl
  },
  // Layered on top of perfect-day's own exact condition (every due, non-archived task completed
  // that day) plus a speed constraint: the span between the day's earliest and latest completion
  // timestamp has to fit within BEAST_MODE_DURATION_MINUTES. Global, per-day, repeatable (dedup
  // scope is the date, same as perfect-day) -- a genuinely different day blitzing through
  // everything again earns its own copy. Deliberately reuses perfect-day's own `today-progress`
  // strategy for its Trophy Case progress bar rather than inventing a new strategy type just for
  // this -- "how many of today's due tasks are done" is still a meaningful prerequisite signal
  // even though it can't capture the speed dimension on its own; a known, accepted simplification
  // rather than a new mechanism for one kind.
  'beast-mode': {
    icon: 'lightning-bolt',
    title: 'Beast Mode!',
    describe: () => `Completed every task for the day in under ${BEAST_MODE_DURATION_MINUTES} minutes`,
    repeatable: true,
    scope: 'global',
    flavorText: 'In and out. No wasted motion.',
    numberBlock: { eyebrow: 'Beast Mode', unit: 'MINUTES' },
    ribbon: { kind: 'fixed', text: 'BEAST MODE' },
    triggerStandalone: v =>
      v !== undefined
        ? `You blitzed through every task for the day in just ${v.toLocaleString()} minute${v === 1 ? '' : 's'}.`
        : `You blitzed through every task for the day in under ${BEAST_MODE_DURATION_MINUTES} minutes.`,
    progressStrategy: { type: 'today-progress' },
    color: { theme: 'Voltage', base: '#6200EA', glow: '#B388FF', accent: '#C6FF00' }, // beast-mode
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
  'century-club': 14,
  'perfect-day': 15, 'perfect-week': 16,
  'beast-mode': 17,
  comeback: 18,
  'habit-collector': 19,
  'early-bird': 20, 'night-owl': 21,
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

// Every ratio-to-own-best kind, derived the same way FIXED_THRESHOLD_ENTRIES is above -- currently
// just new-best-streak, but a future kind reusing this strategy type is picked up automatically.
const RATIO_TO_OWN_BEST_KINDS: AchievementKind[] = ACHIEVEMENT_KIND_ORDER
  .filter(kind => ACHIEVEMENT_META[kind].progressStrategy.type === 'ratio-to-own-best');

// Every task-age kind, derived the same way as the two lists above -- currently just anniversary.
const TASK_AGE_ENTRIES: { kind: AchievementKind; days: number }[] = ACHIEVEMENT_KIND_ORDER
  .map(kind => ({ kind, strategy: ACHIEVEMENT_META[kind].progressStrategy }))
  .filter(
    (entry): entry is { kind: AchievementKind; strategy: Extract<ProgressStrategy, { type: 'task-age' }> } =>
      entry.strategy.type === 'task-age'
  )
  .map(({ kind, strategy }) => ({ kind, days: strategy.days }));

// Four more derived lists, same pattern, for the four strategy types added 2026-08-12 -- each
// currently backs exactly one kind (perfect-week / century-club / habit-collector, and
// early-bird+night-owl sharing time-of-day-ratio), but a future kind reusing any of them is picked
// up automatically with zero new code, same as every list above.
const PERFECT_DAY_STREAK_ENTRIES: { kind: AchievementKind; days: number }[] = ACHIEVEMENT_KIND_ORDER
  .map(kind => ({ kind, strategy: ACHIEVEMENT_META[kind].progressStrategy }))
  .filter(
    (entry): entry is { kind: AchievementKind; strategy: Extract<ProgressStrategy, { type: 'perfect-day-streak' }> } =>
      entry.strategy.type === 'perfect-day-streak'
  )
  .map(({ kind, strategy }) => ({ kind, days: strategy.days }));

const TOTAL_COMPLETIONS_SUM_ENTRIES: { kind: AchievementKind; target: number }[] = ACHIEVEMENT_KIND_ORDER
  .map(kind => ({ kind, strategy: ACHIEVEMENT_META[kind].progressStrategy }))
  .filter(
    (entry): entry is { kind: AchievementKind; strategy: Extract<ProgressStrategy, { type: 'total-completions-sum' }> } =>
      entry.strategy.type === 'total-completions-sum'
  )
  .map(({ kind, strategy }) => ({ kind, target: strategy.target }));

const ACTIVE_TASK_COUNT_ENTRIES: { kind: AchievementKind; target: number }[] = ACHIEVEMENT_KIND_ORDER
  .map(kind => ({ kind, strategy: ACHIEVEMENT_META[kind].progressStrategy }))
  .filter(
    (entry): entry is { kind: AchievementKind; strategy: Extract<ProgressStrategy, { type: 'active-task-count' }> } =>
      entry.strategy.type === 'active-task-count'
  )
  .map(({ kind, strategy }) => ({ kind, target: strategy.target }));

const TIME_OF_DAY_RATIO_ENTRIES: {
  kind: AchievementKind; hour: number; direction: 'before' | 'after'; window: number; minSamples: number;
}[] = ACHIEVEMENT_KIND_ORDER
  .map(kind => ({ kind, strategy: ACHIEVEMENT_META[kind].progressStrategy }))
  .filter(
    (entry): entry is { kind: AchievementKind; strategy: Extract<ProgressStrategy, { type: 'time-of-day-ratio' }> } =>
      entry.strategy.type === 'time-of-day-ratio'
  )
  .map(({ kind, strategy }) => ({
    kind, hour: strategy.hour, direction: strategy.direction, window: strategy.window, minSamples: strategy.minSamples,
  }));

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
): EarnedAchievement[] => {
  const nextStats = nextTask.stats;
  if (!nextStats) return [];
  const prevStats = prevTask.stats;
  const prevCurrent = prevStats?.currentStreak ?? 0;
  const prevBest = prevStats?.bestStreak ?? 0;
  const meta = taskMeta(nextTask);
  const earned: EarnedAchievement[] = [];

  const isFirstEarn = (kind: AchievementKind, scope: string) => !alreadyEarnedScopes.has(dedupKey(kind, scope));

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
    const dedupScope = isGlobal ? 'global' : nextTask.id;
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
    const ageDays = differenceInCalendarDays(date, parseISO(nextTask.createdAt));
    if (ageDays < days) continue;
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
    earned.push({ kind: 'new-best-streak', ...meta, value: nextStats.currentStreak, dedupScope: nextTask.id });
  }

  // Comeback -- repeatable; the task had genuinely lapsed (not just "not yet due today") right
  // before this completion revived it. Also bespoke -- reuses the same `isReady` predicate its
  // own ACHIEVEMENT_META entry already declares for Trophy Case progress, so the "what counts as
  // lapsed" definition can't drift between the two.
  const comebackStrategy = ACHIEVEMENT_META.comeback.progressStrategy;
  if (comebackStrategy.type === 'readiness' && comebackStrategy.isReady(prevTask) && nextStats.currentStreak > 0) {
    earned.push({ kind: 'comeback', ...meta, value: nextStats.currentStreak, dedupScope: nextTask.id });
  }

  // Perfect day -- global, evaluated against `date` (the day this completion was actually *for*),
  // not "today" -- a backfilled past-date completion should be judged against whether *that* day
  // was perfect, not today. A day with nothing due for anyone doesn't trivially count as
  // "perfect". Bespoke -- the only kind whose detection spans every task rather than just the one
  // that was just completed. Repeatable (per ACHIEVEMENT_META), so `isFirstEarn` is really just a
  // same-date re-entrancy guard here rather than a true one-time gate.
  const dateString = format(date, 'yyyy-MM-dd');
  if (isFirstEarn('perfect-day', dateString)) {
    const dueTasks = allTasksAfter.filter(t => !t.archived && isDueOnDate(t, date));
    if (dueTasks.length > 0 && dueTasks.every(t => isTaskCompleted(t, date))) {
      earned.push({ kind: 'perfect-day', value: dueTasks.length, dedupScope: dateString });
    }
  }

  // ============================================================================================
  // Six kinds added 2026-08-12 -- see their own ACHIEVEMENT_META entries above for the full
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
    return due.length > 0 && due.every(t => isTaskCompleted(t, checkDate));
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
  // CENTURY_CLUB_TARGET. `delta` isolates just this one completion's own contribution to the sum
  // (nextTask's own totalCompletions minus its prior value) so `prevSum` can be derived without a
  // separate "every task's stats before this mutation" snapshot -- every other task's own stats
  // are already unchanged in `activeTasksAfter`, only nextTask's own differs.
  if (isFirstEarn('century-club', 'global')) {
    const nextSum = activeTasksAfter.reduce((sum, t) => sum + (t.stats?.totalCompletions ?? 0), 0);
    const delta = nextStats.totalCompletions - (prevStats?.totalCompletions ?? 0);
    const prevSum = nextSum - delta;
    if (prevSum < CENTURY_CLUB_TARGET && nextSum >= CENTURY_CLUB_TARGET) {
      earned.push({ kind: 'century-club', value: CENTURY_CLUB_TARGET, dedupScope: 'global' });
    }
  }

  // Habit collector -- reaching the active-task cap. Evaluated fresh on every completion, not as
  // a crossing check, since there's no real "before/after" transition to diff here -- completing
  // a task doesn't itself change how many tasks exist. This means it's only ever detected on the
  // *next* completion after the cap-reaching task was actually added, not the instant it was
  // added -- an accepted tradeoff of this feature's single trigger point (completeTask only, see
  // taskStore.ts), not a new one introduced here.
  if (isFirstEarn('habit-collector', 'global') && activeTasksAfter.length >= MAX_ACTIVE_TASKS) {
    earned.push({ kind: 'habit-collector', value: MAX_ACTIVE_TASKS, dedupScope: 'global' });
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
    const allCompletions = activeTasksAfter.flatMap(t => t.completions ?? []);
    if (allCompletions.length >= TIME_OF_DAY_MIN_SAMPLES) {
      const recent = [...allCompletions]
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
        .slice(0, TIME_OF_DAY_WINDOW);
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

  // Beast mode -- perfect-day's own exact condition (recomputed fresh here rather than sharing
  // the block above, since that block's own `isFirstEarn('perfect-day', ...)` guard could skip
  // recomputing dueTasks on a day perfect-day itself was already recorded, even though beast-mode
  // still needs to evaluate independently), plus a speed constraint: the span between the day's
  // earliest and latest completion timestamp has to fit within BEAST_MODE_DURATION_MINUTES.
  if (isFirstEarn('beast-mode', dateString)) {
    const dueTasksToday = activeTasksAfter.filter(t => isDueOnDate(t, date));
    if (dueTasksToday.length > 0 && dueTasksToday.every(t => isTaskCompleted(t, date))) {
      const todaysCompletions = dueTasksToday
        .map(t => t.completions?.find(c => c.date === dateString))
        .filter((c): c is NonNullable<typeof c> => !!c);
      if (todaysCompletions.length === dueTasksToday.length) {
        const timestamps = todaysCompletions.map(c => new Date(c.completedAt).getTime());
        const spanMinutes = (Math.max(...timestamps) - Math.min(...timestamps)) / 60000;
        if (spanMinutes <= BEAST_MODE_DURATION_MINUTES) {
          earned.push({ kind: 'beast-mode', value: Math.round(spanMinutes), dedupScope: dateString });
        }
      }
    }
  }

  return earned;
};

// Retroactively evaluates every currently-qualifying, not-yet-earned achievement against the
// task list's *current* stats snapshot -- a deliberate, narrower sibling of
// detectCompletionAchievements above (which only ever looks at a single completion's own
// prev/next transition). Powers TrophiesScreen's manual "catch up" scan for tasks whose history
// predates this feature (or was imported, or just never happened to trigger detection at the
// right moment) -- per this file's own long-standing "no historical backfill" decision, this is
// deliberately opt-in and explicit, not automatic.
//
// `fixed-threshold`, `ratio-to-own-best`, and `task-age` strategies are evaluated -- `readiness`
// (comeback) needs to know the task was genuinely lapsed *immediately before* this moment, and
// `today-progress` (perfect-day) needs a specific day's own due-state, neither of which a single
// current snapshot can reconstruct. Both are silently skipped rather than guessed at.
//
// Dedup here is deliberately stricter than the live detector's own ONE_TIME_KINDS-only check:
// with no transition to detect a fresh "just crossed" moment from, a repeatable kind that's
// already been earned once for a given scope is skipped too here -- otherwise re-running this
// scan with nothing having changed would re-award every already-qualifying kind again and again.
export const detectRetroactiveAchievements = (
  achievements: Achievement[],
  activeTasks: Task[],
  today: Date = new Date(),
): EarnedAchievement[] => {
  const earnedScopes = new Set(achievements.map(a => dedupKey(a.kind, a.dedupScope)));
  const earned: EarnedAchievement[] = [];

  for (const { kind, metric, target } of FIXED_THRESHOLD_ENTRIES) {
    const isGlobal = ACHIEVEMENT_META[kind].scope === 'global';
    if (isGlobal) {
      if (earnedScopes.has(dedupKey(kind, 'global'))) continue;
      if (activeTasks.some(t => (t.stats?.[metric] ?? 0) >= target)) {
        earned.push({ kind, value: target, dedupScope: 'global' });
      }
      continue;
    }
    for (const task of activeTasks) {
      if (earnedScopes.has(dedupKey(kind, task.id))) continue;
      if ((task.stats?.[metric] ?? 0) >= target) {
        earned.push({ kind, ...taskMeta(task), value: target, dedupScope: task.id });
      }
    }
  }

  for (const kind of RATIO_TO_OWN_BEST_KINDS) {
    for (const task of activeTasks) {
      if (earnedScopes.has(dedupKey(kind, task.id))) continue;
      const stats = task.stats;
      if (stats && stats.bestStreak >= FIRST_STREAK_THRESHOLD && stats.currentStreak >= stats.bestStreak) {
        earned.push({ kind, ...taskMeta(task), value: stats.currentStreak, dedupScope: task.id });
      }
    }
  }

  for (const { kind, days } of TASK_AGE_ENTRIES) {
    for (const task of activeTasks) {
      if (earnedScopes.has(dedupKey(kind, task.id))) continue;
      if (differenceInCalendarDays(today, parseISO(task.createdAt)) >= days) {
        earned.push({ kind, ...taskMeta(task), value: days, dedupScope: task.id });
      }
    }
  }

  // Perfect week -- global, evaluated against `today`'s own trailing 7-day window via the same
  // per-day due/completed check the live detector uses, just without the "only on the exact
  // crossing day" restriction (there's no prev/next transition to check a crossing against here).
  for (const { kind, days } of PERFECT_DAY_STREAK_ENTRIES) {
    if (earnedScopes.has(dedupKey(kind, 'global'))) continue;
    let allPerfect = true;
    for (let i = 0; i < days; i++) {
      const checkDate = subDays(today, i);
      const due = activeTasks.filter(t => isDueOnDate(t, checkDate));
      if (due.length === 0 || !due.every(t => isTaskCompleted(t, checkDate))) {
        allPerfect = false;
        break;
      }
    }
    if (allPerfect) earned.push({ kind, value: days, dedupScope: 'global' });
  }

  // Century club -- global lifetime sum across every active task, same target check the live
  // detector's own crossing logic uses, just against the current total directly.
  for (const { kind, target } of TOTAL_COMPLETIONS_SUM_ENTRIES) {
    if (earnedScopes.has(dedupKey(kind, 'global'))) continue;
    const sum = activeTasks.reduce((s, t) => s + (t.stats?.totalCompletions ?? 0), 0);
    if (sum >= target) earned.push({ kind, value: target, dedupScope: 'global' });
  }

  // Habit collector -- global active-task count, same as the live detector's own check.
  for (const { kind, target } of ACTIVE_TASK_COUNT_ENTRIES) {
    if (earnedScopes.has(dedupKey(kind, 'global'))) continue;
    if (activeTasks.length >= target) earned.push({ kind, value: target, dedupScope: 'global' });
  }

  // Early bird / night owl -- global, same trailing-completions-window ratio check the live
  // detector uses, evaluated once against the current completion pool.
  if (TIME_OF_DAY_RATIO_ENTRIES.length > 0) {
    const allCompletions = activeTasks.flatMap(t => t.completions ?? []);
    for (const { kind, hour, direction, window, minSamples } of TIME_OF_DAY_RATIO_ENTRIES) {
      if (earnedScopes.has(dedupKey(kind, 'global'))) continue;
      if (allCompletions.length < minSamples) continue;
      const recent = [...allCompletions]
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
        .slice(0, window);
      const qualifying = recent.filter(c => {
        const h = new Date(c.completedAt).getHours();
        return direction === 'before' ? h < hour : h >= hour;
      }).length;
      if (qualifying / recent.length >= 0.5) {
        earned.push({ kind, value: qualifying, dedupScope: 'global' });
      }
    }
  }

  // Beast mode is deliberately excluded here, same reasoning as perfect-day above: it needs a
  // specific day's own due-state and completion timestamps (which day, and how tightly clustered
  // that day's completions were), neither of which a single current-state snapshot can
  // reconstruct -- there's no "current" day to retroactively evaluate it against.

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
        progress: dueTasks.length > 0 ? { current: doneCount, target: dueTasks.length } : undefined,
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
        if (due.length === 0 || !due.every(t => isTaskCompleted(t, checkDate))) break;
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
      // the >= 50% rule detectCompletionAchievements applies). No progress at all until there's at
      // least one completion to look at, matching every other strategy's "nothing to show yet"
      // treatment (undefined, not a 0/0 progress bar).
      const { hour, direction, window } = strategy;
      const allCompletions = activeTasks.flatMap(t => t.completions ?? []);
      if (allCompletions.length === 0) return { ...base, progress: undefined };
      const recent = [...allCompletions]
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
        .slice(0, window);
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
): AchievementCardStatus[] =>
  ACHIEVEMENT_KIND_ORDER.map(kind => getAchievementCardStatus(kind, achievements, activeTasks, today));

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
): GroupedAchievementCardStatuses[] => {
  const statuses = getAllAchievementCardStatuses(achievements, activeTasks, today);

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
