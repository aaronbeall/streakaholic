# Commitment Mode and Streak Saves

Status: **Product concept / design draft — not implemented**

This document defines a stricter, explicitly opt-in way to use Streakaholic. The original
idea was called **Ironman Mode**: when creating a habit, the user can choose to make its
past history immutable. The mode can later be turned off, but can never be enabled for an
existing habit or re-enabled after it is disabled. A broken streak may be preserved with
a paid unfreeze, and achievements earned under the stricter rules receive additional
credibility.

The recommended working name is **Commitment Mode**. “Ironman Mode,” “Hard Mode,” “Honor
Mode,” “Locked Mode,” and “No-Takebacks Mode” remain naming candidates. Commitment Mode
describes the actual promise without implying that rescue is categorically impossible.

The recommended user-facing name for an unfreeze is **Streak Save**. “Unfreeze” can remain
an internal/business term.

## Product thesis

Streakaholic currently lets users correct or backfill any previous date. That is useful
and humane, but it means a streak is always editable after the fact. Commitment Mode lets
a user deliberately remove that escape hatch:

> I am choosing a record I cannot rewrite later.

The feature strengthens motivation through consequence and credibility, not through
punishment. It also creates a natural extension of Streakaholic's light gamification:

- Locked history makes the streak feel consequential.
- Commitment-only achievements reward the choice.
- Existing achievements can show they were earned under locked rules.
- A Streak Save can preserve an emotionally valuable streak without pretending the
  missed period was completed.

The combination is more important than any one mechanic. Locked history, streak rescue,
and achievement variants all have precedents in other products; their integration into a
private, streak-first, lightly gamified tracker is the differentiator.

## Goals

- Give highly motivated users a voluntary way to make their habit record more binding.
- Preserve the simplicity and forgiveness of normal habits for everyone else.
- Make hard-earned achievements visibly more meaningful without adding a full game
  economy.
- Create an honest, limited consumable purchase that does not gate core tracking.
- Keep every exception visible so payment never falsifies history.
- Add a distinctive feature that is easy to explain in store copy and demo videos.
- Preserve Streakaholic's local-only, no-account architecture.

## Non-goals

- Preventing a determined owner from tampering with local/exported data.
- Certifying a habit record to another person or organization.
- Punishing standard-mode users or treating their achievements as invalid.
- Replacing flexible schedules with daily-only tracking.
- Turning achievements into points, currency, ranks, or competitive leaderboards.
- Making Streak Saves a primary revenue forecast or the reason the mode exists.
- Rewriting a missed day into a fake completion.

## Product modes

| State | Past history | Future setting changes | Streak Saves | Achievement treatment |
|---|---|---|---|---|
| **Standard habit** | Editable/backfillable, as today | Normal behavior | Not needed | Existing presentation |
| **Commitment Mode** | Locks after the current period closes | Prospective only | Available when eligible | Commitment crest plus save provenance |
| **Unbroken Commitment streak** | Locked | Prospective only | None used in the current chain | Highest-credibility “Unbroken” treatment |
| **Ended Commitment Mode** | Previously locked period stays locked; later history is standard | Normal after end date | Not available for later standard history | Previously earned variants remain |

“Unbroken” is a property of a Commitment streak, not a third mode the user selects. A
habit remains in Commitment Mode after using a Streak Save; it simply no longer has an
unbroken current chain.

## Opt-in and lifecycle

### Creation

Commitment Mode is offered only while creating a new habit. The option must default to
off and clearly explain the consequences before the habit is saved.

Suggested concise form copy:

> **Commitment Mode**
>
> Lock each day after it ends, so you cannot rewrite past progress. If you miss a due
> day, an optional paid Streak Save can preserve the streak, but the save remains visible
> and does not count as completing the habit.

The price or current price range for a Streak Save must be disclosed from this prompt;
it must not first appear as a surprise after the user has built a long streak.

An existing standard habit cannot enter Commitment Mode because its earlier history was
created under editable rules. A user who wants the stronger commitment must create a new
habit. The creation UI can offer “Create a committed copy” later if this proves to be a
common need, but the new habit's streak starts fresh.

### While active

- The current day/period remains editable until its defined rollover.
- Undo and corrections remain available before rollover.
- Once a due unit closes, its completion count and status are immutable.
- Schedule, quota, and frequency changes affect future units only.
- A change cannot retroactively turn a failed unit into a non-due unit.
- Standard Mode's free passes/skips and pauses are unavailable while Commitment Mode is
  active. The only continuity-preserving exception after a failed unit is a Streak Save.
- Archive/delete remain available; neither action unlocks history.

### Turning it off

Commitment Mode can be turned off, but the action is permanent for that habit.

- Show a clear destructive-style confirmation.
- Record an immutable `endedAt` boundary.
- Everything before that boundary stays locked.
- Everything afterward follows standard editable-history behavior.
- Previously earned Commitment/Unbroken achievement provenance remains intact.
- The mode cannot be re-enabled for that habit.

Suggested confirmation copy:

> Turn off Commitment Mode? Past committed history will stay locked, but future days will
> become editable. You cannot turn Commitment Mode back on for this habit.

This rule prevents “turn it off, edit the miss, turn it back on” from becoming an escape
hatch.

## What locks

“Past history cannot be changed” applies to every input that could retroactively affect a
streak, not only taps on the calendar.

Once a due unit closes, the user cannot:

- Add, remove, or change its completion count.
- Mark it skipped or paused retroactively.
- Change the old schedule so it was no longer due.
- Change the old target/completions-per-day requirement.
- Move the old completion to another date.
- Use a normal edit flow to replace a Streak Save with a completion.

Schedule and quota editing therefore need effective dates or equivalent versioning. A
new schedule applies beginning with the next unlocked unit; historical calculations use
the rules that were active at the time.

## Day and period boundaries

Commitment Mode needs a predictable definition of when history becomes past.

### Daily and specific-day habits

- The due date locks at the habit-day rollover.
- A late-night grace boundary (for example, 3:00 or 4:00 a.m.) is preferable to strict
  midnight.
- The exact boundary must be shown in the mode explanation/settings.
- A completion recorded before rollover belongs to the intended habit day.

### X-per-week and X-per-month habits

- The locked unit is the completed week or month, not an arbitrarily chosen missing day.
- A failure becomes final only when the period closes below its required quota.
- A Streak Save applies to that failed period.
- Schedule changes made mid-period must not lower an already-active quota retroactively;
  either defer them to the next period or preserve the original requirement for the
  current period.

### Timezone and clock changes

Timezone travel, daylight-saving changes, and manual clock changes require conservative
handling. The product is an honor-system commitment aid, not an anti-cheat system. The
implementation should prevent ordinary accidental lock/unlock behavior without claiming
tamper-proof verification.

Open implementation choice: store a task-specific rollover hour, use one app-wide
rollover setting, or initially use the existing local-calendar-day boundary and add a
grace-hour setting later.

## Passes, pauses, and Streak Saves

Standard Mode's humane exceptions and Commitment Mode's paid exception are deliberately
different concepts:

| Exception | When selected | Counts as completion | Preserves streak | Costs money | Visible in history |
|---|---|---:|---:|---:|---:|
| **Standard pass/skip** | Before or after a Standard due unit, within the product's eventual editing rules | No | Yes | No | Yes |
| **Standard pause** | Before a future date range begins | No | Yes | No | No due units are created during the pause |
| **Streak Save** | After a committed due unit fails | No | Yes | Proposed: yes | Yes, permanently |

Standard habits may allow forgiving retroactive passes for sickness, travel, recovery,
or an intentional day off. Active Commitment Mode habits allow neither free passes nor
free pauses, even when planned in advance: its strictness is the point. A user who wants
that flexibility must permanently turn off Commitment Mode for the habit; committed
history before the end boundary remains locked.

Passes, pauses, and Streak Saves do not advance completion-based achievements. A pass or
save bridges continuity without adding a genuine completion. Using a Streak Save also
ends the affected chain's “Unbroken” qualification; the habit remains in Commitment Mode
with visible Saved provenance and a save count.

## Streak Save behavior

A Streak Save preserves continuity without creating a completion.

### Eligibility

- Only Commitment Mode habits are eligible.
- The save applies to the first failed, closed due unit that broke the current streak.
- It cannot be applied to arbitrary old history.
- It must be offered for a limited, clearly documented period after the break.
- A later schedule edit cannot create eligibility or remove the failure.
- A saved unit cannot be saved again.

Recommended initial eligibility window: **48 hours after the failed unit closes**. This
is long enough to avoid a pressure timer while preventing indefinite reconstruction of
old chains. The exact window should be tested before implementation is considered final.

### Effect on streak calculations

- The failed unit stays incomplete.
- The save acts as a bridge: it does not break the chain and does not add one to its
  length.
- The next genuine completion continues from the prior genuine streak length.
- Total completions and completion percentages do not increase.
- Perfect-day/week achievements do not treat it as complete.
- Best/current streak displays may include a “saved” marker/count but count only genuine
  completed units.

Example:

1. The user has 10 completed due days in a row.
2. Day 11 is missed and the streak breaks.
3. A Streak Save bridges Day 11; history still shows it as missed/saved.
4. Completing Day 12 produces an 11-completion streak spanning 12 due days, with one
   save used.

Suggested status copy:

> 47-day streak · Commitment Mode · 1 save used

Here “47-day” must match the product's final definition: preferably 47 genuine completed
units, not elapsed calendar units hidden behind exceptions.

### Purchase experience

- Use a fixed price; never charge more because a streak is longer.
- Display the price before mode opt-in and again at the purchase decision.
- Present “Accept the broken streak” as an equally clear choice.
- Do not use a short countdown, repeated nags, or guilt-driven language.
- Declining must leave the app fully usable.
- A successful purchase and save insertion must be idempotent so retries cannot charge
  twice or create duplicate exceptions.
- If billing succeeds but the app closes before applying the save, the next launch must
  reconcile and finish the pending transaction safely.

Proposed starting price: **$0.99 for one save**, subject to Play Console pricing and
testing. Packs are intentionally deferred: stockpiling cheap saves could weaken the
commitment and make provenance harder to understand.

### History presentation

A saved unit needs a distinct visual state, such as a repaired chain, shield, or
snowflake. It must not use the completed color/checkmark alone.

Tapping it should explain:

> This habit was not completed. A Streak Save preserved the streak without adding a
> completion.

The task calendar, streak history, status summary, statistics, export/import format, and
achievement detail UI must all understand this state consistently.

## Achievement design

Commitment Mode should enrich the existing achievement system rather than duplicate all
23 kinds into a second catalog.

### Existing task-scoped achievements

When an existing achievement is earned by a habit in Commitment Mode, snapshot its
provenance at unlock time:

- **Commitment** — earned while past history was locked.
- **Unbroken** — earned in Commitment Mode with zero Streak Saves in the qualifying
  current chain/window.
- **Saved** — earned in Commitment Mode after one or more saves; show the save count.

Suggested visual hierarchy:

- Standard: existing emblem.
- Commitment: iron/locked outer crest.
- Unbroken: upgraded forged-metal treatment or an “UNBROKEN” ribbon.
- Saved: Commitment crest plus a small shield/save count, never the Unbroken ribbon.

Using a save after an achievement was earned does not retroactively remove its Unbroken
provenance; the achievement truthfully records the state at the moment it unlocked.

### Global achievements

Global kinds need explicit rules because they may aggregate standard and committed
habits. Recommended first version:

- Task-scoped achievements receive Commitment provenance.
- Perfect-day/week can receive Unbroken provenance only if every contributing due habit
  was in active Commitment Mode and none used a save in the qualifying window.
- Cross-task lifetime totals remain standard until per-completion provenance exists;
  do not guess from current task settings.

### Commitment-only achievements

Names and thresholds are placeholders for later design:

- **The Pact** — complete the first locked due unit.
- **Iron Week** — complete seven due units in one unbroken Commitment chain.
- **Forged** — complete 30 due units in one unbroken Commitment chain.
- **Tempered** — complete 100 due units in one unbroken Commitment chain.
- **Unbreakable** — complete one year/365 qualifying units without a save; the exact
  rule must account for non-daily schedules.
- **Back on the Anvil** — successfully continue after using a Streak Save.
- **No Takebacks** — reach a major lifetime completion count entirely while committed.

Thresholds should be defined in completed due units or completed schedule periods, not
raw elapsed days, so flexible-frequency habits remain first-class.

## Suggested UX surfaces

### Add Habit

- A clearly separated Commitment Mode choice near the final save action.
- Off by default.
- A short explanation plus “Learn more.”
- A confirmation step summarizing irrevocability and the current Streak Save price.

### Edit Habit

- Active state and lock explanation.
- Read-only start date.
- “Turn off Commitment Mode” destructive action.
- No toggle that could imply it can be turned back on.
- Schedule changes explicitly labeled “Applies starting {date/period}.”

### Home/task header

- Small lock/commitment indicator that does not overpower the streak itself.
- Status text includes save count when relevant.

### Calendar/history

- Locked dates cannot be toggled.
- A tap explains why rather than silently doing nothing.
- Saved units use their own permanent state and explanation.
- Standard passes/pauses remain visually distinct from saves wherever both can appear in
  the habit's full history (for example, after Commitment Mode has been permanently ended).

### Broken-streak moment

- First acknowledge the break without shaming the user.
- Offer “Start a new streak” and “Use a Streak Save.”
- Explain exactly what the purchase changes and does not change.
- Do not block navigation or repeatedly reopen the purchase prompt after decline.

### Trophy Case

- Show Commitment/Unbroken treatment directly on eligible emblems.
- Achievement detail states the task, unlock date, mode, and saves used at unlock.
- Filters may eventually include Standard / Commitment / Unbroken.

## Conceptual data model

Exact field names are implementation details, but the persisted model needs these
concepts.

### Task-level commitment history

```ts
type CommitmentPolicy = {
  startedAt: string; // creation boundary; cannot be added later
  endedAt?: string; // once set, can never be cleared
  rolloverHour?: number;
  version: 1;
};
```

Existing tasks have no policy and remain standard. A policy is historical data, not a
boolean toggle; that is what preserves the committed interval after the mode ends.

### Exceptions

```ts
type HabitException = {
  id: string;
  periodKey: string; // date, week, or month key under the task's frequency
  type: 'pass' | 'streak-save'; // `pass` is Standard-only; `streak-save` is Commitment-only
  createdAt: string;
  purchaseId?: string;
};
```

Pauses may be better represented as effective-dated schedule intervals rather than one
exception per day.

### Schedule versions

Commitment Mode requires enough historical schedule information to answer what target
was active for a closed period. A conceptual shape:

```ts
type ScheduleVersion = {
  effectiveAt: string;
  frequency: TaskFrequency;
  timesPerDayCount: number;
};
```

The implementation may instead store immutable closed-period snapshots if that fits the
existing streak algorithms better. The invariant matters more than the representation:
future edits cannot change the rules used for locked history.

### Achievement provenance

```ts
type CommitmentProvenance = {
  mode: 'commitment';
  unbroken: boolean;
  savesUsed: number;
};
```

This is stored on the achievement at unlock time rather than derived later from the
task's current mode.

## Export, import, and local integrity

- Commitment settings, schedule versions, exceptions, and achievement provenance must
  be included in export/import.
- Export/import remains free; Commitment Mode must not weaken the “your data is yours”
  promise.
- Importing a valid committed task preserves its lock rules going forward.
- Merge/import cannot mutate an already-present locked period through a normal collision.
- Replace-all import can necessarily replace the local database. This means a determined
  user can tamper with exported data and re-import it.

That limitation is acceptable. Commitment Mode provides self-imposed friction and an
honest in-app record; it is not cryptographic verification. Marketing and UI must avoid
words such as “certified,” “verified,” “tamper-proof,” or “proof.”

## Privacy and billing

Commitment Mode itself remains fully local. A Streak Save purchase uses Play Billing and
the same IAP layer chosen for tips/Pro.

Consumable purchases introduce recovery concerns:

- A used save is restored through exported app data, not by re-consuming the Play
  purchase after reinstall.
- Pending/unacknowledged purchases must be reconciled on launch.
- Purchase IDs are used for idempotency and should not become behavioral tracking.
- No server account or cross-device identity is required solely for this feature.

## Monetization and trust guardrails

The user's intentional opt-in materially improves the ethics of a paid save: they chose
the locked rules while calm, before a streak was at risk. It does not eliminate the need
for restraint at the moment of failure.

- Do not dynamically price based on streak length or inferred emotional value.
- Do not make the save price a surprise.
- Do not falsify completion history.
- Do not make saved achievements look identical to unbroken ones.
- Do not sell retroactive skips as a cheaper back door.
- Do not count projected save revenue in the base business forecast.
- Measure whether the mode improves motivation/retention before optimizing purchase
  conversion.

The feature's primary value is differentiation, commitment, retention, and achievement
meaning. Consumable revenue is secondary upside.

## Success measures

Initial qualitative questions:

- Do users understand that the option cannot be enabled later?
- Do they understand what remains locked after turning it off?
- Does the restriction increase motivation without creating anxiety or regret?
- Is the distinction between complete, skip, pause, and save clear?
- Do Commitment/Unbroken achievement variants feel meaningfully more prestigious?
- Does the save offer feel fair and optional rather than manipulative?

Useful aggregate/local or voluntary-test metrics:

- Percentage of newly created habits opting into Commitment Mode
- 7/30/90-day retention versus standard habits
- Mode-disable rate and reasons
- Broken committed streaks per retained committed habit
- Save offer views, purchases, declines, and later retention
- Achievement engagement/Trophy Case visits for committed habits
- Support complaints about rollover, schedule edits, purchases, or perceived coercion

No invasive behavioral analytics should be added solely to measure this. Closed-test
feedback, voluntary surveys, aggregate Play purchase reporting, and privacy-respecting
local counters are sufficient initially.

## Rollout sequence

1. **Rules prototype without purchases** — implement locked history and prospective
   schedule changes behind a test flag; validate daily and weekly/monthly algorithms.
2. **Commitment achievement provenance** — add crests/Unbroken state and a small set of
   mode-only achievements.
3. **Free closed-test saves** — validate the bridge calculation, UI honesty, and edge
   cases without charging testers.
4. **Billing integration** — only after the tip jar has already validated the common IAP
   plumbing and pending-purchase recovery.
5. **Limited production rollout** — fixed price, no packs, no pressure UI.
6. **Evaluate** — retention and trust first; purchase revenue second.

## Open decisions

- Final mode name: Commitment, Ironman, Hard, Honor, Locked, or another name.
- Final user-facing purchase name: Streak Save, Unfreeze, Repair, or another name.
- Exact habit-day rollover behavior and whether it is app-wide or per habit.
- Exact Streak Save eligibility window; 48 hours is the current recommendation.
- Whether one free save is ever offered, earned, or included with Pro.
- Whether future purchase packs would weaken the mode too much.
- Whether a save preserves only the current streak or can also preserve best-streak
  qualification.
- Which existing/global achievements can receive Commitment provenance in version one.
- Final Commitment-only achievement catalog, thresholds, art, and language.
- How imported collisions with locked history should be reported to the user.
- Whether prospective schedule changes in Commitment Mode need a lead time or other
  guardrail so editing the schedule cannot become a disguised free pass.
