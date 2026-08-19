import { format } from 'date-fns';
import { Task, TaskCompletion, TaskStats } from '../../app/types';
import {
  Achievement,
  AchievementKind,
  ACHIEVEMENT_KIND_ORDER,
  EarnedAchievement,
  ONE_TIME_KINDS,
  dedupKey,
  detectCompletionAchievements,
  detectRetroactiveAchievements,
  detectTaskCreatedAchievements,
  detectTipAchievements,
  getAchievementCardStatus,
  getAllAchievementCardStatuses,
  getFirstEarnedAchievements,
  getGroupedAchievementCardStatuses,
} from '../../app/utils/achievements';

const makeCompletion = (id: string, date: Date, timesCompleted = 1): TaskCompletion => ({
  id,
  taskId: 't1',
  date: format(date, 'yyyy-MM-dd'),
  completedAt: date.toISOString(),
  timesCompleted,
});

const makeStats = (overrides: Partial<TaskStats> = {}): TaskStats => ({
  currentStreak: 0,
  lastStreak: 0,
  bestStreak: 0,
  totalCompletions: 0,
  completionRate: 0,
  streakStatus: 'never_started',
  ...overrides,
});

// detectCompletionAchievements only ever reads `.stats` (never recomputes it), so tests can set
// whatever before/after stats a scenario needs directly, rather than synthesizing a real
// completion history through calculateTaskStats -- except the perfect-day tests, which do need
// real completions/frequency since isDueOnDate/isTaskCompleted read those directly, not `.stats`.
const makeTask = (overrides: Partial<Task> = {}, statsOverrides: Partial<TaskStats> = {}): Task => ({
  id: 't1',
  name: 'Read',
  icon: 'book-open-page-variant',
  color: '#4285F4',
  frequency: 'daily',
  daysOfWeek: [],
  daysPerWeek: 0,
  daysPerMonth: 0,
  timesPerDay: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  completions: [],
  stats: makeStats(statsOverrides),
  ...overrides,
});

const today = new Date();
const kindsOf = (earned: { kind: string }[]) => earned.map(e => e.kind);

describe('detectCompletionAchievements', () => {
  describe('first-completion', () => {
    it('fires on a task\'s very first-ever completion (totalCompletions 0 -> 1)', () => {
      const prev = makeTask({}, { totalCompletions: 0 });
      const next = makeTask({}, { totalCompletions: 1 });
      const earned = detectCompletionAchievements(prev, next, [next], today, new Set());
      expect(kindsOf(earned)).toContain('first-completion');
    });

    it('does not fire again on later completions', () => {
      const prev = makeTask({}, { totalCompletions: 4 });
      const next = makeTask({}, { totalCompletions: 5 });
      const earned = detectCompletionAchievements(prev, next, [next], today, new Set());
      expect(kindsOf(earned)).not.toContain('first-completion');
    });

    it('does not fire twice if already recorded (dedup) -- global scope, not per-task', () => {
      const prev = makeTask({}, { totalCompletions: 0 });
      const next = makeTask({}, { totalCompletions: 1 });
      // first-completion is global (see achievements.ts), so its dedup key is a fixed 'global'
      // scope, not the task's own id -- once any task has ever fired it, no task can fire it
      // again (e.g. a second, brand-new task later reaching its own first completion).
      const earned = detectCompletionAchievements(prev, next, [next], today, new Set(['first-completion:global']));
      expect(kindsOf(earned)).not.toContain('first-completion');
    });

    it('carries no task identity, unlike a per-task kind like streak-2', () => {
      const prev = makeTask({}, { currentStreak: 1, totalCompletions: 0 });
      const next = makeTask({}, { currentStreak: 2, totalCompletions: 1 });
      const earned = detectCompletionAchievements(prev, next, [next], today, new Set());
      const firstCompletion = earned.find(e => e.kind === 'first-completion');
      const streakTwo = earned.find(e => e.kind === 'streak-2');
      expect(firstCompletion?.taskId).toBeUndefined();
      expect(firstCompletion?.dedupScope).toBe('global');
      expect(streakTwo?.taskId).toBe('t1');
      // Date-qualified (2026-08-13 fix for "achievement spam via undo/redo") -- see
      // dedupScopeFor's own comment in achievements.ts.
      expect(streakTwo?.dedupScope).toBe(`t1:${format(today, 'yyyy-MM-dd')}`);
    });
  });

  describe('streak-2', () => {
    it('fires once currentStreak reaches 2', () => {
      const prev = makeTask({}, { currentStreak: 1 });
      const next = makeTask({}, { currentStreak: 2 });
      const earned = detectCompletionAchievements(prev, next, [next], today, new Set());
      expect(kindsOf(earned)).toContain('streak-2');
    });

  });

  describe('repeatability', () => {
    it('first-completion, anniversary, and every milestone-N tier are one-time -- every other kind is repeatable', () => {
      // detectCompletionAchievements itself is agnostic to "repeatable" -- it just respects
      // whatever's in the alreadyEarnedScopes set it's given. The actual repeatable/one-time
      // distinction lives in ONE_TIME_KINDS (derived from ACHIEVEMENT_META's own `repeatable`
      // flag), which is what the store uses to decide which scopes even go into that set in the
      // first place -- so this is what's actually worth pinning down directly. `anniversary`
      // joins first-completion since a task can only turn 1 year old once; milestone-10/50/100/1000
      // (2026-08-12, per explicit user direction) join for a softer reason -- totalCompletions is a
      // lifetime counter that never un-crosses a threshold in normal use, so they were already
      // self-limiting even as "repeatable"; this just makes that a hard guarantee. Being one-time
      // is still scoped per-task (see repeatable's own comment in achievements.ts) -- different
      // tasks each independently earn their own copy regardless. The three century-club-N tiers/
      // habit-collector/early-bird/night-owl (2026-08-12) join too -- each is a one-shot "you
      // crossed this global threshold/pattern for the first time" moment (see their own
      // ACHIEVEMENT_META comments), not something meant to re-celebrate every time its own
      // condition happens to hold again.
      expect(ONE_TIME_KINDS.sort()).toEqual(
        [
          'anniversary', 'first-completion', 'milestone-10', 'milestone-50', 'milestone-100', 'milestone-1000',
          'century-club-100', 'century-club-500', 'century-club-1000', 'century-club-10000',
          'habit-collector', 'early-bird', 'night-owl', 'weekend-warrior', 'weekday-hero',
          'weekly-overachiever', 'monthly-overachiever', 'unstoppable', 'streak-addict',
          'tip-coffee', 'tip-generous', 'tip-legend',
        ].sort()
      );
    });
  });

  describe('anniversary', () => {
    it('fires once a task has been alive for a full year (365 days)', () => {
      const createdAt = new Date('2025-01-01T00:00:00.000Z');
      const completionDate = new Date('2026-01-01T00:00:00.000Z'); // exactly 365 days later
      const prev = makeTask({ createdAt: createdAt.toISOString() }, { currentStreak: 1 });
      const next = makeTask({ createdAt: createdAt.toISOString() }, { currentStreak: 2 });
      const earned = detectCompletionAchievements(prev, next, [next], completionDate, new Set());
      const anniversary = earned.find(e => e.kind === 'anniversary');
      expect(anniversary).toBeDefined();
      expect(anniversary?.value).toBe(365);
      expect(anniversary?.taskId).toBe('t1');
    });

    it('does not fire before the task\'s own createdAt reaches 365 days old', () => {
      const createdAt = new Date('2025-06-01T00:00:00.000Z');
      const completionDate = new Date('2025-12-01T00:00:00.000Z'); // ~183 days later
      const task = makeTask({ createdAt: createdAt.toISOString() });
      const earned = detectCompletionAchievements(task, task, [task], completionDate, new Set());
      expect(kindsOf(earned)).not.toContain('anniversary');
    });

    it('does not fire twice for the same task once already recorded (dedup by taskId)', () => {
      const createdAt = new Date('2024-01-01T00:00:00.000Z');
      const completionDate = new Date('2026-01-01T00:00:00.000Z'); // well over a year old
      const task = makeTask({ id: 't1', createdAt: createdAt.toISOString() });
      const earned = detectCompletionAchievements(task, task, [task], completionDate, new Set(['anniversary:t1']));
      expect(kindsOf(earned)).not.toContain('anniversary');
    });

    it('evaluates against the completion\'s own date, not "today" -- a backfilled past completion is judged against that day', () => {
      const createdAt = new Date('2024-01-01T00:00:00.000Z');
      const backfilledDate = new Date('2024-06-01T00:00:00.000Z'); // task was only ~5 months old then
      const task = makeTask({ createdAt: createdAt.toISOString() });
      const earned = detectCompletionAchievements(task, task, [task], backfilledDate, new Set());
      expect(kindsOf(earned)).not.toContain('anniversary');
    });
  });

  describe('new-best-streak', () => {
    it('does NOT fire during a brand-new task\'s first unbroken climb (regression)', () => {
      // A first-ever streak has bestStreak === currentStreak at every step (no prior closed run
      // to compare against) -- this must not read as "beating a record" on every single day.
      for (let day = 1; day <= 10; day++) {
        const prev = makeTask({}, { currentStreak: day - 1, bestStreak: day - 1 });
        const next = makeTask({}, { currentStreak: day, bestStreak: day });
        const earned = detectCompletionAchievements(prev, next, [next], today, new Set());
        expect(kindsOf(earned)).not.toContain('new-best-streak');
      }
    });

    it('fires exactly once when a new run exceeds a real prior best', () => {
      // A real prior record (5) is on the books, and this run -- which started below it -- just
      // climbed past it.
      const prev = makeTask({}, { currentStreak: 4, bestStreak: 5 });
      const next = makeTask({}, { currentStreak: 6, bestStreak: 6 });
      const earned = detectCompletionAchievements(prev, next, [next], today, new Set());
      expect(kindsOf(earned).filter(k => k === 'new-best-streak')).toHaveLength(1);
    });

    it('does not fire while still climbing toward (not yet past) the old best', () => {
      const prev = makeTask({}, { currentStreak: 2, bestStreak: 5 });
      const next = makeTask({}, { currentStreak: 3, bestStreak: 5 });
      const earned = detectCompletionAchievements(prev, next, [next], today, new Set());
      expect(kindsOf(earned)).not.toContain('new-best-streak');
    });

    it('is never gated by the dedup set, since it is not a one-time kind', () => {
      const prev = makeTask({}, { currentStreak: 4, bestStreak: 5 });
      const next = makeTask({}, { currentStreak: 6, bestStreak: 6 });
      // Even with this exact scope already present in the "already earned" set (as it would be
      // for a one-time kind), new-best-streak isn't in ONE_TIME_KINDS and is never checked
      // against it -- it should still fire.
      const earned = detectCompletionAchievements(prev, next, [next], today, new Set(['new-best-streak:t1']));
      expect(kindsOf(earned)).toContain('new-best-streak');
    });
  });

  describe('streak-N tiers', () => {
    it('fires each tier exactly once at its own threshold', () => {
      const cases: [number, number][] = [[4, 5], [9, 10], [24, 25], [49, 50], [99, 100], [999, 1000]];
      for (const [before, after] of cases) {
        const prev = makeTask({}, { currentStreak: before });
        const next = makeTask({}, { currentStreak: after });
        const earned = detectCompletionAchievements(prev, next, [next], today, new Set());
        expect(kindsOf(earned)).toContain(`streak-${after}`);
      }
    });

    it('does not re-fire a tier already recorded', () => {
      const prev = makeTask({}, { currentStreak: 9 });
      const next = makeTask({}, { currentStreak: 10 });
      // Date-qualified scope (2026-08-13 fix) -- see dedupScopeFor's own comment.
      const earned = detectCompletionAchievements(
        prev, next, [next], today, new Set([`streak-10:t1:${format(today, 'yyyy-MM-dd')}`])
      );
      expect(kindsOf(earned)).not.toContain('streak-10');
    });

    it('is independent of milestone-N', () => {
      // Crossing a streak-length tier shouldn't imply anything about total completions.
      const prev = makeTask({}, { currentStreak: 9, totalCompletions: 9 });
      const next = makeTask({}, { currentStreak: 10, totalCompletions: 10 });
      const earned = detectCompletionAchievements(prev, next, [next], today, new Set());
      expect(kindsOf(earned)).toEqual(expect.arrayContaining(['streak-10', 'milestone-10']));
    });
  });

  // Regression coverage for "achievement spam via undo/redo" (2026-08-13 fix): a repeatable
  // task-scoped kind's threshold crossing (streak-N, new-best-streak, comeback) used to re-fire
  // every time the exact same completion was undone then redone, since each redo is a fresh
  // prev/next transition crossing the identical threshold with nothing genuinely new earned, and
  // the old bare-taskId dedup scope couldn't tell that apart from a real future crossing. Fixed by
  // date-qualifying these kinds' own dedupScope (dedupScopeFor in achievements.ts) plus dropping
  // achievementsStore.ts's own ONE_TIME_KINDS-only filter, so every existing achievement --
  // including these now-date-scoped ones -- genuinely blocks an exact repeat. These tests exercise
  // both halves together by simulating what the store actually does: accumulate every emitted
  // achievement's own dedupScope into the set passed to the *next* call, exactly as
  // achievementsStore.recordCompletionAchievements does across real completions.
  describe('undo/redo replay does not spam a repeatable task-scoped kind', () => {
    const asStore = (earned: EarnedAchievement[]) => new Set(earned.map(e => dedupKey(e.kind, e.dedupScope)));

    it('streak-N: redoing the identical crossing on the same date does not re-record it', () => {
      const prev = makeTask({}, { currentStreak: 9 });
      const next = makeTask({}, { currentStreak: 10 });

      // First press: genuinely earns streak-10.
      const firstPress = detectCompletionAchievements(prev, next, [next], today, new Set());
      expect(kindsOf(firstPress)).toContain('streak-10');

      // Undo, then redo -- the exact same prev/next transition, same date, replayed again. The
      // store would have recorded firstPress's own achievement(s) into `achievements` by now, so
      // the redo's alreadyEarnedScopes set includes their dedupScope(s), same as a real second call.
      const redo = detectCompletionAchievements(prev, next, [next], today, asStore(firstPress));
      expect(kindsOf(redo)).not.toContain('streak-10');
    });

    it('streak-N: a genuine new crossing on a later date still fires, even with an older same-tier record on file', () => {
      const laterDate = new Date(today.getTime() + 2 * 86400000);
      // A different task's streak-10 was already recorded on an earlier date -- should never block
      // an unrelated task's own genuine crossing.
      const already = new Set([`streak-10:other-task:${format(today, 'yyyy-MM-dd')}`]);
      const prev = makeTask({}, { currentStreak: 9 });
      const next = makeTask({}, { currentStreak: 10 });
      const earned = detectCompletionAchievements(prev, next, [next], laterDate, already);
      expect(kindsOf(earned)).toContain('streak-10');
    });

    it('comeback: redoing the identical revival on the same date does not re-record it', () => {
      const prev = makeTask({}, { streakStatus: 'expired' });
      const next = makeTask({}, { currentStreak: 1 });
      const firstPress = detectCompletionAchievements(prev, next, [next], today, new Set());
      expect(kindsOf(firstPress)).toContain('comeback');

      const redo = detectCompletionAchievements(prev, next, [next], today, asStore(firstPress));
      expect(kindsOf(redo)).not.toContain('comeback');
    });

    it('perfect-day: redoing a completion that keeps the day perfect does not re-record it for the same date', () => {
      // isDueOnDate/isCompletedOnDate read real completions/frequency directly, so this needs a
      // genuine two-task, both-completed setup (matching PERFECT_DAY_MIN_DUE_TASKS's own >= 2
      // requirement) rather than pre-set .stats overrides.
      const a = makeTask({ id: 'a', completions: [makeCompletion('a1', today)] });
      const b = makeTask({ id: 'b', completions: [makeCompletion('b1', today)] });
      const firstPress = detectCompletionAchievements(a, a, [a, b], today, new Set());
      expect(kindsOf(firstPress)).toContain('perfect-day');

      // A later completion that same day (e.g. undo+redo of one of the two, or a multi-rep bump)
      // re-evaluates the same already-perfect day -- should not record a second perfect-day.
      const redo = detectCompletionAchievements(b, b, [a, b], today, asStore(firstPress));
      expect(kindsOf(redo)).not.toContain('perfect-day');
    });
  });

  describe('milestone-N tiers', () => {
    it('fires each tier exactly once at its own threshold', () => {
      const cases: [number, number][] = [[9, 10], [49, 50], [99, 100], [999, 1000]];
      for (const [before, after] of cases) {
        const prev = makeTask({}, { totalCompletions: before });
        const next = makeTask({}, { totalCompletions: after });
        const earned = detectCompletionAchievements(prev, next, [next], today, new Set());
        expect(kindsOf(earned)).toContain(`milestone-${after}`);
      }
    });

    it('does not re-fire a tier already recorded', () => {
      const prev = makeTask({}, { totalCompletions: 9 });
      const next = makeTask({}, { totalCompletions: 10 });
      const earned = detectCompletionAchievements(prev, next, [next], today, new Set(['milestone-10:t1']));
      expect(kindsOf(earned)).not.toContain('milestone-10');
    });
  });

  describe('comeback', () => {
    it('fires when a genuinely expired streak is revived', () => {
      const prev = makeTask({}, { currentStreak: 0, streakStatus: 'expired' });
      const next = makeTask({}, { currentStreak: 1, streakStatus: 'up_to_date' });
      const earned = detectCompletionAchievements(prev, next, [next], today, new Set());
      expect(kindsOf(earned)).toContain('comeback');
    });

    it('does not fire for an ordinary (never-lapsed) completion', () => {
      const prev = makeTask({}, { currentStreak: 3, streakStatus: 'up_to_date' });
      const next = makeTask({}, { currentStreak: 4, streakStatus: 'up_to_date' });
      const earned = detectCompletionAchievements(prev, next, [next], today, new Set());
      expect(kindsOf(earned)).not.toContain('comeback');
    });
  });

  describe('perfect-day', () => {
    it('fires when every due, non-archived task is completed that day', () => {
      const t1 = makeTask({ id: 't1', completions: [makeCompletion('c1', today)] }, { currentStreak: 1 });
      const t2 = makeTask({ id: 't2', completions: [makeCompletion('c2', today)] }, { currentStreak: 1 });
      const earned = detectCompletionAchievements(t1, t1, [t1, t2], today, new Set());
      expect(kindsOf(earned)).toContain('perfect-day');
    });

    it('does not fire when only a single task is due, even if completed -- requires PERFECT_DAY_MIN_DUE_TASKS', () => {
      const t1 = makeTask({ id: 't1', completions: [makeCompletion('c1', today)] }, { currentStreak: 1 });
      const earned = detectCompletionAchievements(t1, t1, [t1], today, new Set());
      expect(kindsOf(earned)).not.toContain('perfect-day');
    });

    it('does not fire if any due, non-archived task is incomplete', () => {
      const t1 = makeTask({ id: 't1', completions: [makeCompletion('c1', today)] }, { currentStreak: 1 });
      const t2 = makeTask({ id: 't2', completions: [] }, { currentStreak: 0 });
      const earned = detectCompletionAchievements(t1, t1, [t1, t2], today, new Set());
      expect(kindsOf(earned)).not.toContain('perfect-day');
    });

    it('ignores archived tasks', () => {
      // Two genuinely due, non-archived, completed tasks (PERFECT_DAY_MIN_DUE_TASKS) plus the
      // archived one this test is actually about -- an archived task with nothing due doesn't
      // count toward, or against, the minimum.
      const t1 = makeTask({ id: 't1', completions: [makeCompletion('c1', today)] }, { currentStreak: 1 });
      const t2 = makeTask({ id: 't2', completions: [makeCompletion('c2', today)] }, { currentStreak: 1 });
      const archived = makeTask({ id: 't3', archived: true, completions: [] }, { currentStreak: 0 });
      const earned = detectCompletionAchievements(t1, t1, [t1, t2, archived], today, new Set());
      expect(kindsOf(earned)).toContain('perfect-day');
    });

    it('does not count a day with nothing due for anyone as trivially perfect', () => {
      const t1 = makeTask({
        id: 't1',
        frequency: 'specific_days_of_week',
        daysOfWeek: [], // isDueOnDate treats an empty selection as "always due" -- pick a real non-due case instead
      }, { currentStreak: 0 });
      // Force a genuinely non-due day: due only on a day-of-week that isn't today's.
      const notToday = (today.getDay() + 1) % 7;
      const t1NotDue = { ...t1, frequency: 'specific_days_of_week' as const, daysOfWeek: [notToday] };
      const earned = detectCompletionAchievements(t1NotDue, t1NotDue, [t1NotDue], today, new Set());
      expect(kindsOf(earned)).not.toContain('perfect-day');
    });

    it('dedupes per calendar date', () => {
      const dateString = format(today, 'yyyy-MM-dd');
      const t1 = makeTask({ id: 't1', completions: [makeCompletion('c1', today)] }, { currentStreak: 1 });
      const t2 = makeTask({ id: 't2', completions: [makeCompletion('c2', today)] }, { currentStreak: 1 });
      const earned = detectCompletionAchievements(t1, t1, [t1, t2], today, new Set([`perfect-day:${dateString}`]));
      expect(kindsOf(earned)).not.toContain('perfect-day');
    });

    it('evaluates against the completion\'s own date, not "today", for a backfilled past completion', () => {
      const pastDate = new Date(2020, 0, 1);
      const t1 = makeTask({ id: 't1', completions: [makeCompletion('c1', pastDate)] }, { currentStreak: 1 });
      const t2 = makeTask({ id: 't2', completions: [makeCompletion('c2', pastDate)] }, { currentStreak: 1 });
      const earned = detectCompletionAchievements(t1, t1, [t1, t2], pastDate, new Set());
      const perfectDay = earned.find(e => e.kind === 'perfect-day');
      expect(perfectDay?.dedupScope).toBe(format(pastDate, 'yyyy-MM-dd'));
    });
  });

  describe('perfect-week', () => {
    const makeDailyTask = (id: string, completions: TaskCompletion[]) =>
      makeTask({ id, completions }, { currentStreak: completions.length });

    const completionsFor = (id: string, dates: Date[]) => dates.map((d, i) => makeCompletion(`${id}-${i}`, d));

    // Every test here needs at least PERFECT_DAY_MIN_DUE_TASKS due+completed tasks per day, not
    // just one -- t2 mirrors t1's own completions exactly so both are always "perfect" together.
    it('fires for a perfect Sunday-Saturday calendar week on Saturday', () => {
      const saturday = new Date(2026, 7, 22);
      const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 7, 16 + i));
      const t1 = makeDailyTask('t1', completionsFor('t1', days));
      const t2 = makeDailyTask('t2', completionsFor('t2', days));
      const earned = detectCompletionAchievements(t1, t1, [t1, t2], saturday, new Set());
      expect(kindsOf(earned)).toContain('perfect-week');
    });

    it('does not fire on day 6 of a perfect run', () => {
      const days = Array.from({ length: 6 }, (_, i) => new Date(today.getTime() - (5 - i) * 86400000));
      const t1 = makeDailyTask('t1', completionsFor('t1', days));
      const t2 = makeDailyTask('t2', completionsFor('t2', days));
      const earned = detectCompletionAchievements(t1, t1, [t1, t2], today, new Set());
      expect(kindsOf(earned)).not.toContain('perfect-week');
    });

    it('does not evaluate the range on a non-Saturday even when seven trailing days are perfect', () => {
      const friday = new Date(2026, 7, 21);
      const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 7, 15 + i));
      const t1 = makeDailyTask('t1', completionsFor('t1', days));
      const t2 = makeDailyTask('t2', completionsFor('t2', days));
      const earned = detectCompletionAchievements(t1, t1, [t1, t2], friday, new Set());
      expect(kindsOf(earned)).not.toContain('perfect-week');
    });

    it('does not fire if any of the 7 days had an incomplete due task', () => {
      const saturday = new Date(2026, 7, 22);
      const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 7, 16 + i));
      const t1 = makeDailyTask('t1', completionsFor('t1', days).filter((_, i) => i !== 3)); // day 4 missed
      const t2 = makeDailyTask('t2', completionsFor('t2', days));
      const earned = detectCompletionAchievements(t1, t1, [t1, t2], saturday, new Set());
      expect(kindsOf(earned)).not.toContain('perfect-week');
    });
  });

  describe('fixed calendar-range achievements', () => {
    const taskWithDates = (id: string, dates: Date[], overrides: Partial<Task> = {}) =>
      makeTask({
        id,
        completions: dates.map((date, index) => makeCompletion(`${id}-${index}`, date)),
        ...overrides,
      }, { currentStreak: dates.length, streakStatus: 'up_to_date' });

    it('awards Weekend Warrior only from the closing Sunday when every due weekend habit is done', () => {
      const saturday = new Date(2026, 7, 22);
      const sunday = new Date(2026, 7, 23);
      const tasks = ['a', 'b', 'c', 'd'].map(id => taskWithDates(id, [saturday, sunday]));

      expect(kindsOf(detectCompletionAchievements(tasks[0], tasks[0], tasks, saturday, new Set())))
        .not.toContain('weekend-warrior');
      expect(kindsOf(detectCompletionAchievements(tasks[0], tasks[0], tasks, sunday, new Set())))
        .toContain('weekend-warrior');
    });

    it('awards Clocked In for a complete Monday-Friday window on Friday', () => {
      const weekdays = Array.from({ length: 5 }, (_, index) => new Date(2026, 7, 17 + index));
      const friday = weekdays[4];
      const tasks = ['a', 'b', 'c', 'd'].map(id => taskWithDates(id, weekdays));
      const earned = detectCompletionAchievements(tasks[0], tasks[0], tasks, friday, new Set());
      expect(kindsOf(earned)).toContain('weekday-hero');
    });

    it('requires four distinct scheduled habits for both range sweeps', () => {
      const saturday = new Date(2026, 7, 22);
      const sunday = new Date(2026, 7, 23);
      const weekendTasks = ['a', 'b', 'c'].map(id => taskWithDates(id, [saturday, sunday]));
      expect(kindsOf(detectCompletionAchievements(weekendTasks[0], weekendTasks[0], weekendTasks, sunday, new Set())))
        .not.toContain('weekend-warrior');

      const weekdays = Array.from({ length: 5 }, (_, index) => new Date(2026, 7, 17 + index));
      const weekdayTasks = ['a', 'b', 'c'].map(id => taskWithDates(id, weekdays));
      expect(kindsOf(detectCompletionAchievements(weekdayTasks[0], weekdayTasks[0], weekdayTasks, weekdays[4], new Set())))
        .not.toContain('weekday-hero');
    });

    it('requires the schedule to touch every day in each range', () => {
      const saturday = new Date(2026, 7, 22);
      const sunday = new Date(2026, 7, 23);
      const saturdayOnly = ['a', 'b', 'c', 'd'].map(id => taskWithDates(id, [saturday], {
        frequency: 'specific_days_of_week', daysOfWeek: [6],
      }));
      expect(kindsOf(detectCompletionAchievements(saturdayOnly[0], saturdayOnly[0], saturdayOnly, sunday, new Set())))
        .not.toContain('weekend-warrior');

      const mondayToThursday = Array.from({ length: 4 }, (_, index) => new Date(2026, 7, 17 + index));
      const friday = new Date(2026, 7, 21);
      const weekdayTasks = ['a', 'b', 'c', 'd'].map(id => taskWithDates(id, mondayToThursday, {
        frequency: 'specific_days_of_week', daysOfWeek: [1, 2, 3, 4],
      }));
      expect(kindsOf(detectCompletionAchievements(weekdayTasks[0], weekdayTasks[0], weekdayTasks, friday, new Set())))
        .not.toContain('weekday-hero');
    });

    it('awards Perfect Month only on the actual final day of a fully perfect month', () => {
      const february = Array.from({ length: 28 }, (_, index) => new Date(2026, 1, index + 1));
      const a = taskWithDates('a', february);
      const b = taskWithDates('b', february);

      expect(kindsOf(detectCompletionAchievements(a, a, [a, b], new Date(2026, 1, 27), new Set())))
        .not.toContain('perfect-month');
      expect(kindsOf(detectCompletionAchievements(a, a, [a, b], new Date(2026, 1, 28), new Set())))
        .toContain('perfect-month');
    });

    it('awards Unstoppable to a specific-days habit completed on all seven calendar days', () => {
      const week = Array.from({ length: 7 }, (_, index) => new Date(2026, 7, 16 + index));
      const task = taskWithDates('specific', week, {
        frequency: 'specific_days_of_week',
        daysOfWeek: [1, 3, 5],
      });
      const earned = detectCompletionAchievements(task, task, [task], week[6], new Set());
      expect(kindsOf(earned)).toContain('unstoppable');
    });
  });

  describe('quota overachievers', () => {
    it('requires ceil(150% of a weekly quota)', () => {
      const dates = Array.from({ length: 5 }, (_, index) => new Date(2026, 7, 16 + index));
      const completions = dates.map((date, index) => makeCompletion(`w-${index}`, date));
      const task = makeTask({
        frequency: 'days_per_week',
        daysPerWeek: 3,
        completions,
      }, { totalCompletions: 5, currentStreak: 5, streakStatus: 'up_to_date' });
      const earned = detectCompletionAchievements(task, task, [task], dates[4], new Set());
      expect(earned.find(item => item.kind === 'weekly-overachiever')?.value).toBe(5);
    });

    it('requires ceil(150% of a monthly quota)', () => {
      const dates = Array.from({ length: 15 }, (_, index) => new Date(2026, 7, index + 1));
      const completions = dates.map((date, index) => makeCompletion(`m-${index}`, date));
      const task = makeTask({
        frequency: 'days_per_month',
        daysPerMonth: 10,
        completions,
      }, { totalCompletions: 15, currentStreak: 15, streakStatus: 'up_to_date' });
      const earned = detectCompletionAchievements(task, task, [task], dates[14], new Set());
      expect(earned.find(item => item.kind === 'monthly-overachiever')?.value).toBe(15);
    });
  });

  describe('streak-addict', () => {
    it('awards six simultaneous up-to-date or expiring streaks', () => {
      // currentStreak starts at 2, not 1 -- a bare 1-day streak doesn't count as "active" here
      // (see isGenuineActiveStreak's own comment): a pile of same-day first completions alone
      // shouldn't be able to earn this.
      const tasks = Array.from({ length: 6 }, (_, index) => makeTask(
        { id: `streak-${index}` },
        { currentStreak: index + 2, streakStatus: index % 2 ? 'expiring' : 'up_to_date' },
      ));
      const earned = detectCompletionAchievements(tasks[0], tasks[0], tasks, today, new Set());
      expect(kindsOf(earned)).toContain('streak-addict');
    });

    it('does not count a fresh 1-day streak toward the total, even alongside otherwise-enough real ones', () => {
      const tasks = [
        ...Array.from({ length: 5 }, (_, index) => makeTask(
          { id: `streak-${index}` },
          { currentStreak: index + 2, streakStatus: 'up_to_date' },
        )),
        makeTask({ id: 'streak-fresh' }, { currentStreak: 1, streakStatus: 'up_to_date' }),
      ];
      const earned = detectCompletionAchievements(tasks[0], tasks[0], tasks, today, new Set());
      expect(kindsOf(earned)).not.toContain('streak-addict');
    });

    it('does not count an expired habit even when its cached streak length is nonzero', () => {
      const tasks = Array.from({ length: 6 }, (_, index) => makeTask(
        { id: `streak-${index}` },
        { currentStreak: 3, streakStatus: index === 5 ? 'expired' : 'up_to_date' },
      ));
      const earned = detectCompletionAchievements(tasks[0], tasks[0], tasks, today, new Set());
      expect(kindsOf(earned)).not.toContain('streak-addict');
    });

    it('does not count a habit whose "up to date" today is only because today was explicitly skipped, not completed', () => {
      const todayString = format(today, 'yyyy-MM-dd');
      const tasks = [
        ...Array.from({ length: 5 }, (_, index) => makeTask(
          { id: `streak-${index}` },
          { currentStreak: index + 2, streakStatus: 'up_to_date' },
        )),
        // Real streak history (currentStreak 4), but today itself is a skip -- no active
        // completion actually happened today, just a pass per Task.skippedDates.
        makeTask({ id: 'streak-skipped-today', skippedDates: [todayString] }, { currentStreak: 4, streakStatus: 'up_to_date' }),
      ];
      const earned = detectCompletionAchievements(tasks[0], tasks[0], tasks, today, new Set());
      expect(kindsOf(earned)).not.toContain('streak-addict');
    });

    it('does not count a habit whose "up to date" today is only because today is a non-due pass-through day', () => {
      const notDueDay = (today.getDay() + 1) % 7;
      const tasks = [
        ...Array.from({ length: 5 }, (_, index) => makeTask(
          { id: `streak-${index}` },
          { currentStreak: index + 2, streakStatus: 'up_to_date' },
        )),
        // specific_days_of_week, due on a day that isn't today -- today reads 'up_to_date' purely
        // because nothing is required today, not because of an actual completion today.
        makeTask(
          { id: 'streak-not-due-today', frequency: 'specific_days_of_week', daysOfWeek: [notDueDay] },
          { currentStreak: 5, streakStatus: 'up_to_date' },
        ),
      ];
      const earned = detectCompletionAchievements(tasks[0], tasks[0], tasks, today, new Set());
      expect(kindsOf(earned)).not.toContain('streak-addict');
    });

    it('still counts a habit that is genuinely due today and was actually completed today', () => {
      const todayString = format(today, 'yyyy-MM-dd');
      const completedToday: TaskCompletion = { id: 'c1', taskId: 'streak-due-today', date: todayString, completedAt: today.toISOString(), timesCompleted: 1 };
      const tasks = [
        ...Array.from({ length: 5 }, (_, index) => makeTask(
          { id: `streak-${index}` },
          { currentStreak: index + 2, streakStatus: 'up_to_date' },
        )),
        makeTask(
          { id: 'streak-due-today', completions: [completedToday] },
          { currentStreak: 4, streakStatus: 'up_to_date' },
        ),
      ];
      const earned = detectCompletionAchievements(tasks[0], tasks[0], tasks, today, new Set());
      expect(kindsOf(earned)).toContain('streak-addict');
    });
  });

  describe('century-club (four tiers: 100/500/1000/10000)', () => {
    it('adds the absurd 10,000-completion global tier', () => {
      const prev = makeTask({}, { totalCompletions: 9999 });
      const next = makeTask({}, { totalCompletions: 10000 });
      const earned = detectCompletionAchievements(prev, next, [next], today, new Set([
        dedupKey('century-club-100', 'global'),
        dedupKey('century-club-500', 'global'),
        dedupKey('century-club-1000', 'global'),
      ]));
      expect(kindsOf(earned)).toContain('century-club-10000');
    });
    it('fires century-club-1000 once the lifetime sum of totalCompletions across all active tasks crosses 1000', () => {
      const t1 = makeTask({ id: 't1' }, { totalCompletions: 400 });
      const prevT2 = makeTask({ id: 't2' }, { totalCompletions: 599 });
      const nextT2 = makeTask({ id: 't2' }, { totalCompletions: 600 }); // 400 + 600 = 1000
      const earned = detectCompletionAchievements(prevT2, nextT2, [t1, nextT2], today, new Set());
      expect(kindsOf(earned)).toContain('century-club-1000');
      expect(kindsOf(earned)).not.toContain('century-club-100');
      expect(kindsOf(earned)).not.toContain('century-club-500');
    });

    it('does not fire any tier while the sum is still short of the lowest one', () => {
      const t1 = makeTask({ id: 't1' }, { totalCompletions: 40 });
      const prevT2 = makeTask({ id: 't2' }, { totalCompletions: 40 });
      const nextT2 = makeTask({ id: 't2' }, { totalCompletions: 41 });
      const earned = detectCompletionAchievements(prevT2, nextT2, [t1, nextT2], today, new Set());
      expect(kindsOf(earned)).not.toContain('century-club-100');
      expect(kindsOf(earned)).not.toContain('century-club-500');
      expect(kindsOf(earned)).not.toContain('century-club-1000');
    });

    it('fires century-club-100, independent of the higher tiers', () => {
      // Also legitimately crosses this same task's own milestone-100 (a per-task tier sharing the
      // identical round-number target) -- toContain/not.toContain per tier, not an exact-array
      // match, same reasoning as the "fires all three tiers" test above.
      const prevT1 = makeTask({ id: 't1' }, { totalCompletions: 99 });
      const nextT1 = makeTask({ id: 't1' }, { totalCompletions: 100 });
      const earned = detectCompletionAchievements(prevT1, nextT1, [nextT1], today, new Set());
      const kinds = kindsOf(earned);
      expect(kinds).toContain('century-club-100');
      expect(kinds).not.toContain('century-club-500');
      expect(kinds).not.toContain('century-club-1000');
    });

    it('fires century-club-500 (and not -100, already earned) once past 500', () => {
      const prevT1 = makeTask({ id: 't1' }, { totalCompletions: 499 });
      const nextT1 = makeTask({ id: 't1' }, { totalCompletions: 500 });
      const alreadyEarned100 = new Set([dedupKey('century-club-100', 'global')]);
      const earned = detectCompletionAchievements(prevT1, nextT1, [nextT1], today, alreadyEarned100);
      expect(kindsOf(earned)).toEqual(['century-club-500']);
    });

    it('fires all three tiers at once when a single jump crosses every threshold together', () => {
      // A single task's own totalCompletions jump this big also happens to cross that same task's
      // own milestone-100/milestone-1000 tiers (a coincidence of the two families sharing several
      // identical round-number targets, not a bug) -- kindsOf is checked with toContain per tier
      // rather than an exact-array toEqual, so this test isn't coupled to exactly which other
      // kinds also legitimately fire alongside century-club here.
      const prevT1 = makeTask({ id: 't1' }, { totalCompletions: 50 });
      const nextT1 = makeTask({ id: 't1' }, { totalCompletions: 1200 });
      const earned = detectCompletionAchievements(prevT1, nextT1, [nextT1], today, new Set());
      const kinds = kindsOf(earned);
      expect(kinds).toContain('century-club-100');
      expect(kinds).toContain('century-club-500');
      expect(kinds).toContain('century-club-1000');
    });

    it('carries no task identity -- a global, cross-task sum', () => {
      const prev = makeTask({ id: 't1' }, { totalCompletions: 999 });
      const next = makeTask({ id: 't1' }, { totalCompletions: 1000 });
      const earned = detectCompletionAchievements(prev, next, [next], today, new Set());
      const centuryClub = earned.find(e => e.kind === 'century-club-1000');
      expect(centuryClub?.taskId).toBeUndefined();
      expect(centuryClub?.dedupScope).toBe('global');
    });
  });

  describe('habit-collector creation trigger', () => {
    it('fires once the active task count reaches the cap', () => {
      const tasks = Array.from({ length: 6 }, (_, i) => makeTask({ id: `t${i}` }));
      const earned = detectTaskCreatedAchievements(tasks, new Set());
      expect(kindsOf(earned)).toContain('habit-collector');
    });

    it('does not fire with fewer active tasks than the cap', () => {
      const tasks = Array.from({ length: 5 }, (_, i) => makeTask({ id: `t${i}` }));
      const earned = detectTaskCreatedAchievements(tasks, new Set());
      expect(kindsOf(earned)).not.toContain('habit-collector');
    });

    it('excludes archived tasks from the active count', () => {
      const tasks = [
        ...Array.from({ length: 5 }, (_, i) => makeTask({ id: `t${i}` })),
        makeTask({ id: 't5', archived: true }),
      ];
      const earned = detectTaskCreatedAchievements(tasks.filter(task => !task.archived), new Set());
      expect(kindsOf(earned)).not.toContain('habit-collector');
    });

    it('does not evaluate Habit Collector during an ordinary completion', () => {
      const tasks = Array.from({ length: 6 }, (_, i) => makeTask({ id: `t${i}` }));
      const earned = detectCompletionAchievements(tasks[0], tasks[0], tasks, today, new Set());
      expect(kindsOf(earned)).not.toContain('habit-collector');
    });
  });

  describe('detectTipAchievements', () => {
    it('maps each tip tier to its own achievement kind', () => {
      expect(kindsOf(detectTipAchievements('tip_small', new Set()))).toEqual(['tip-coffee']);
      expect(kindsOf(detectTipAchievements('tip_medium', new Set()))).toEqual(['tip-generous']);
      expect(kindsOf(detectTipAchievements('tip_large', new Set()))).toEqual(['tip-legend']);
    });

    it('is global-scoped, not tied to any task', () => {
      const [earned] = detectTipAchievements('tip_small', new Set());
      expect(earned.dedupScope).toBe('global');
      expect(earned.taskId).toBeUndefined();
    });

    it('does not re-earn an already-earned tier', () => {
      const alreadyEarned = new Set([dedupKey('tip-coffee', 'global')]);
      expect(detectTipAchievements('tip_small', alreadyEarned)).toEqual([]);
    });

    it('tipping a different tier still earns that tier\'s own kind independently', () => {
      const alreadyEarned = new Set([dedupKey('tip-coffee', 'global')]);
      expect(kindsOf(detectTipAchievements('tip_medium', alreadyEarned))).toEqual(['tip-generous']);
    });
  });

  describe('early-bird / night-owl', () => {
    const completionAt = (id: string, hour: number): TaskCompletion => {
      const d = new Date(today);
      d.setHours(hour, 0, 0, 0);
      return makeCompletion(id, d);
    };

    it('early-bird fires when at least half of the recent window completed before the hour', () => {
      const completions = [
        ...Array.from({ length: 6 }, (_, i) => completionAt(`e${i}`, 5)), // before 7am
        ...Array.from({ length: 4 }, (_, i) => completionAt(`l${i}`, 20)), // not
      ];
      const task = makeTask({ id: 't1', completions });
      const earned = detectCompletionAchievements(task, task, [task], today, new Set());
      expect(kindsOf(earned)).toContain('early-bird');
      expect(kindsOf(earned)).not.toContain('night-owl');
    });

    it('night-owl fires when at least half of the recent window completed at/after the hour', () => {
      const completions = [
        ...Array.from({ length: 6 }, (_, i) => completionAt(`l${i}`, 20)), // at the 8pm boundary
        ...Array.from({ length: 4 }, (_, i) => completionAt(`e${i}`, 8)), // not
      ];
      const task = makeTask({ id: 't1', completions });
      const earned = detectCompletionAchievements(task, task, [task], today, new Set());
      expect(kindsOf(earned)).toContain('night-owl');
      expect(kindsOf(earned)).not.toContain('early-bird');
    });

    it('does not fire below the minimum sample size, even if every completion so far qualifies', () => {
      const completions = Array.from({ length: 3 }, (_, i) => completionAt(`e${i}`, 5));
      const task = makeTask({ id: 't1', completions });
      const earned = detectCompletionAchievements(task, task, [task], today, new Set());
      expect(kindsOf(earned)).not.toContain('early-bird');
    });

    it('does not fire when the ratio is under half', () => {
      const completions = [
        ...Array.from({ length: 4 }, (_, i) => completionAt(`e${i}`, 5)),
        ...Array.from({ length: 6 }, (_, i) => completionAt(`m${i}`, 13)),
      ];
      const task = makeTask({ id: 't1', completions });
      const earned = detectCompletionAchievements(task, task, [task], today, new Set());
      expect(kindsOf(earned)).not.toContain('early-bird');
      expect(kindsOf(earned)).not.toContain('night-owl');
    });
  });

  // The two `options` fields (added 2026-08-12) are purely a performance mirror of the same
  // default behavior -- detectRetroactiveAchievements' own replay loop passes precomputed data
  // instead of letting this function re-derive it from scratch on every call, but the actual rule
  // (a day counts once its completion count meets timesPerDay; the trailing window is the most
  // recent N completions) has to stay identical either way. These tests exist specifically to
  // catch any drift between the two paths.
  describe('detectCompletionAchievements options (completionCountsByTaskId / recentCompletionsOverride)', () => {
    it('perfect-day fires identically whether completionCountsByTaskId is supplied or omitted', () => {
      const t1 = makeTask({ id: 't1', completions: [makeCompletion('c1', today)] }, { currentStreak: 1 });
      const t2 = makeTask({ id: 't2', completions: [makeCompletion('c2', today)] }, { currentStreak: 1 });
      const withoutMap = detectCompletionAchievements(t1, t1, [t1, t2], today, new Set());

      const dateStr = format(today, 'yyyy-MM-dd');
      const completionCountsByTaskId = new Map<string, Map<string, number>>([
        ['t1', new Map([[dateStr, 1]])],
        ['t2', new Map([[dateStr, 1]])],
      ]);
      const withMap = detectCompletionAchievements(t1, t1, [t1, t2], today, new Set(), { completionCountsByTaskId });

      expect(kindsOf(withMap)).toEqual(kindsOf(withoutMap));
      expect(kindsOf(withMap)).toContain('perfect-day');
    });

    it('early-bird fires identically whether recentCompletionsOverride is supplied or omitted', () => {
      const completionAt = (id: string, hour: number): TaskCompletion => {
        const d = new Date(today);
        d.setHours(hour, 0, 0, 0);
        return makeCompletion(id, d);
      };
      const completions = [
        ...Array.from({ length: 6 }, (_, i) => completionAt(`e${i}`, 5)),
        ...Array.from({ length: 4 }, (_, i) => completionAt(`m${i}`, 13)),
      ];
      const task = makeTask({ id: 't1', completions });
      const withoutOverride = detectCompletionAchievements(task, task, [task], today, new Set());

      const recentCompletionsOverride = [...completions].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
      const withOverride = detectCompletionAchievements(task, task, [task], today, new Set(), { recentCompletionsOverride });

      expect(kindsOf(withOverride)).toEqual(kindsOf(withoutOverride));
      expect(kindsOf(withOverride)).toContain('early-bird');
    });
  });

  describe('multiple achievements from one completion', () => {
    it('returns every achievement earned in a single call', () => {
      const prev = makeTask({}, { currentStreak: 9, totalCompletions: 9, bestStreak: 9 });
      const next = makeTask({}, { currentStreak: 10, totalCompletions: 10, bestStreak: 10 });
      const earned = detectCompletionAchievements(prev, next, [next], today, new Set());
      // streak-10 and milestone-10 both cross their threshold on this exact completion; the run
      // is still climbing toward its own first ceiling (bestStreak already matches currentStreak
      // pre-completion), so new-best-streak correctly stays out of this particular batch.
      expect(kindsOf(earned).sort()).toEqual(['milestone-10', 'streak-10'].sort());
    });
  });
});

const makeAchievement = (kind: AchievementKind, overrides: Partial<Achievement> = {}): Achievement => ({
  id: `${kind}-${Math.random()}`,
  kind,
  taskId: 't1',
  taskName: 'Read',
  taskColor: '#4285F4',
  dedupScope: 't1',
  earnedAt: new Date().toISOString(),
  ...overrides,
});

// detectRetroactiveAchievements (2026-08-12 rewrite) replays real completion history, in
// completedAt order, rather than checking a single current-stats snapshot -- so, unlike every
// test above, its own fixtures need genuine `completions` arrays (dates the underlying streak
// math can actually walk through), not just pre-set `.stats` overrides. `daysAgo`/
// `consecutiveCompletions` build those against a fixed reference date so the tests stay
// deterministic regardless of when they're run. Note `completedAt` (not `date`) drives both replay
// order and the asOfDate used for stats -- see detectRetroactiveAchievements' own comment for why
// that distinction matters for a genuine backfill (a completion whose completedAt lands well after
// the calendar day it's actually for).
describe('detectRetroactiveAchievements', () => {
  const REF_TODAY = new Date('2026-01-20T12:00:00.000Z');
  const daysAgo = (n: number) => new Date(REF_TODAY.getTime() - n * 86400000);
  const consecutiveCompletions = (idPrefix: string, startDaysAgo: number, count: number): TaskCompletion[] =>
    Array.from({ length: count }, (_, i) => makeCompletion(`${idPrefix}${i}`, daysAgo(startDaysAgo - i)));

  it('replays a real unbroken streak and awards every fixed-threshold tier it actually crossed, stopping at the highest reached', () => {
    // 15 consecutive daily completions ending today (REF_TODAY) -- a clean, unbroken streak.
    const task = makeTask({ id: 't1', completions: consecutiveCompletions('c', 14, 15) });
    const earned = detectRetroactiveAchievements([], [task], REF_TODAY);
    const kinds = kindsOf(earned);
    expect(kinds).toEqual(expect.arrayContaining(['first-completion', 'streak-2', 'streak-5', 'streak-10']));
    expect(kinds).not.toContain('streak-25');
  });

  it('never re-awards a (kind, scope) pair that already has an earned record, regardless of repeatability', () => {
    const task = makeTask({ id: 't1', completions: consecutiveCompletions('c', 14, 15) });
    const already = makeAchievement('streak-10', { taskId: 't1', dedupScope: 't1' });
    const earned = detectRetroactiveAchievements([already], [task], REF_TODAY);
    expect(kindsOf(earned)).not.toContain('streak-10');
    // Still catches the other, not-yet-earned tiers this same task's history also crossed.
    expect(kindsOf(earned)).toEqual(expect.arrayContaining(['streak-5', 'streak-2']));
  });

  it('awards the global first-completion once, even with multiple currently-qualifying tasks, with no task identity attached', () => {
    const a = makeTask({ id: 'a', completions: [makeCompletion('a1', daysAgo(5))] });
    const b = makeTask({ id: 'b', completions: [makeCompletion('b1', daysAgo(3))] });
    const earned = detectRetroactiveAchievements([], [a, b], REF_TODAY);
    const firstCompletionEntries = earned.filter(e => e.kind === 'first-completion');
    expect(firstCompletionEntries).toHaveLength(1);
    expect(firstCompletionEntries[0].taskId).toBeUndefined();
    expect(firstCompletionEntries[0].earnedAt).toBe(a.completions[0].completedAt);
  });

  it('dates Habit Collector at the task-creation event that completed the roster', () => {
    const tasks = Array.from({ length: 6 }, (_, i) => makeTask({
      id: `habit-${i}`,
      createdAt: new Date(`2026-01-0${i + 1}T09:00:00.000Z`).toISOString(),
    }));
    const earned = detectRetroactiveAchievements([], tasks, REF_TODAY);
    const collector = earned.find(e => e.kind === 'habit-collector');
    expect(collector?.earnedAt).toBe('2026-01-06T09:00:00.000Z');
  });

  it('dates a global completion club at the exact completion that crossed its threshold', () => {
    const start = new Date('2026-01-10T08:00:00.000Z');
    const completions = Array.from({ length: 100 }, (_, i): TaskCompletion => {
      const completedAt = new Date(start.getTime() + i * 60000);
      return makeCompletion(`club-${i}`, completedAt);
    });
    const task = makeTask({
      createdAt: '2026-01-01T00:00:00.000Z',
      completions,
    });
    const earned = detectRetroactiveAchievements([], [task], REF_TODAY);
    const club = earned.find(e => e.kind === 'century-club-100');
    expect(club?.earnedAt).toBe(completions[99].completedAt);
  });

  it('awards new-best-streak for a real backfill-bridged jump past an old record, and not for an unrelated task', () => {
    // Mirrors the demo dataset's own proven "New Best Streak" construction (see
    // generate-achievements-test-data.py): a 6-day closed run (days 8..3 ago, ordinary same-day
    // taps) sets a bestStreak of 6; days 1..0 ago (today) form a separate, already-open 2-day run
    // (also ordinary same-day taps). Day 2 ago is the gap -- backfilled here (`completedAt` set to
    // REF_TODAY, well after its own `date`, simulating a real Calendar-tab backfill performed
    // *today*) rather than left empty, which is what actually bridges the two runs into one
    // continuous 9-day streak in a single jump. This distinction matters: live completion always
    // evaluates stats against real "now" at press time regardless of which day the press if *for*
    // (see detectRetroactiveAchievements' own top comment) -- an ordinary same-day completion of
    // day 2 ago (completedAt === date) would NOT bridge anything, since by the time that day's own
    // event replays, the not-yet-existing days 1..0 ago haven't happened yet. Only a genuine
    // backfill, recorded after the open run already exists, produces the jump.
    const bridgeDate = daysAgo(2);
    const bridge: TaskCompletion = {
      id: 'bridge', taskId: 't1', date: format(bridgeDate, 'yyyy-MM-dd'), completedAt: REF_TODAY.toISOString(), timesCompleted: 1,
    };
    const bridged = makeTask({
      id: 'a',
      completions: [...consecutiveCompletions('r1-', 8, 6), ...consecutiveCompletions('r2-', 1, 2), bridge],
    });
    // An unrelated task with a plain, never-broken streak -- no prior closed run to ever beat.
    const neverBroken = makeTask({ id: 'b', completions: consecutiveCompletions('r3-', 4, 5) });
    const earned = detectRetroactiveAchievements([], [bridged, neverBroken], REF_TODAY);
    const newBest = earned.filter(e => e.kind === 'new-best-streak');
    expect(newBest).toHaveLength(1);
    expect(newBest[0].taskId).toBe('a');
    expect(newBest[0].value).toBe(9); // the full bridged run: 6 (old) + 1 (bridge) + 2 (open run)
  });

  it('now also detects comeback retroactively -- a real capability the old snapshot-only scan could not reach', () => {
    // A genuine 5-day run (days 6..2 ago), then EXACTLY one missed day (1 day ago -- daily
    // frequency, so a genuine missed due day), then a reviving completion today. Exactly one
    // trailing miss is required for streakStatus to read 'expired' rather than decaying all the
    // way to 'never_started' (see achievements.ts's own note on this, and demo-data/README.md's
    // "Comeback Demo" task, which works around the identical constraint).
    const task = makeTask({
      id: 'a',
      completions: [...consecutiveCompletions('r1-', 6, 5), makeCompletion('revive', daysAgo(0))],
    });
    const earned = detectRetroactiveAchievements([], [task], REF_TODAY);
    expect(kindsOf(earned)).toContain('comeback');
  });

  it('now also detects perfect-day retroactively -- same reasoning', () => {
    // createdAt must predate REF_TODAY explicitly -- makeTask's own default (real "now" at test
    // run time) would otherwise exclude both tasks from the replay's "did this task exist yet"
    // filter, since REF_TODAY is a fixed date in the past relative to whenever this actually runs.
    const createdAt = new Date('2025-01-01T00:00:00.000Z').toISOString();
    const perfectDate = daysAgo(3);
    const p1 = makeTask({ id: 'p1', createdAt, completions: [makeCompletion('p1c', perfectDate)] });
    const p2 = makeTask({ id: 'p2', createdAt, completions: [makeCompletion('p2c', perfectDate)] });
    const earned = detectRetroactiveAchievements([], [p1, p2], REF_TODAY);
    expect(kindsOf(earned)).toContain('perfect-day');
  });

  it('produces nothing on a second run against the same, unchanged history -- duplication rules hold across repeated scans', () => {
    const task = makeTask({ id: 't1', completions: consecutiveCompletions('c', 14, 15) });
    const firstRun = detectRetroactiveAchievements([], [task], REF_TODAY);
    expect(firstRun.length).toBeGreaterThan(0);
    const recorded: Achievement[] = firstRun.map((a, i) => ({ ...a, id: `r${i}` }));
    const secondRun = detectRetroactiveAchievements(recorded, [task], REF_TODAY);
    expect(secondRun).toEqual([]);
  });

  it('awards anniversary for a task already over a year old, catching history that predates the feature', () => {
    const today = new Date('2026-01-01T00:00:00.000Z');
    const oldTask = makeTask({ id: 'old', createdAt: new Date('2024-01-01T00:00:00.000Z').toISOString() });
    const newTask = makeTask({ id: 'new', createdAt: new Date('2025-06-01T00:00:00.000Z').toISOString() });
    const earned = detectRetroactiveAchievements([], [oldTask, newTask], today);
    const anniversaries = earned.filter(e => e.kind === 'anniversary');
    expect(anniversaries).toHaveLength(1);
    expect(anniversaries[0].taskId).toBe('old');
    expect(anniversaries[0].earnedAt).toBe('2024-12-31T00:00:00.000Z');
  });
});

describe('getAchievementCardStatus', () => {
  describe('fixed-threshold kinds (first-completion / streak-N / milestone-N)', () => {
    it('is locked with no progress when there are no active tasks', () => {
      const status = getAchievementCardStatus('streak-10', [], []);
      expect(status.unlocked).toBe(false);
      expect(status.progress).toBeUndefined();
    });

    it('reports live progress from the closest not-yet-earned task, capped at the target', () => {
      const near = makeTask({ id: 'near', name: 'Near' }, { currentStreak: 7 });
      const far = makeTask({ id: 'far', name: 'Far' }, { currentStreak: 2 });
      const overshooting = makeTask({ id: 'over', name: 'Over' }, { currentStreak: 15 });
      const status = getAchievementCardStatus('streak-10', [], [near, far, overshooting]);
      expect(status.unlocked).toBe(false);
      // The overshooting task's own 15 is capped at the 10 target, but the "closest" pick still
      // has to be re-derived from the (already-capped) value -- 10 (capped) > 7 -- so it wins.
      expect(status.progress).toEqual({ current: 10, target: 10, taskName: 'Over', taskColor: '#4285F4' });
    });

    it('excludes tasks that have already earned this specific kind from progress', () => {
      const alreadyEarned = makeTask({ id: 't1', name: 'Already' }, { currentStreak: 9 });
      const stillWorking = makeTask({ id: 't2', name: 'Working' }, { currentStreak: 3 });
      const achievements = [makeAchievement('streak-10', { taskId: 't1' })];
      const status = getAchievementCardStatus('streak-10', achievements, [alreadyEarned, stillWorking]);
      expect(status.unlocked).toBe(true);
      expect(status.progress).toEqual({ current: 3, target: 10, taskName: 'Working', taskColor: '#4285F4' });
    });

    it('reports the most recently earned instance as latest, and counts every instance', () => {
      const older = makeAchievement('streak-10', { taskId: 't1', earnedAt: '2026-01-01T00:00:00.000Z' });
      const newer = makeAchievement('streak-10', { taskId: 't2', taskName: 'Second', earnedAt: '2026-06-01T00:00:00.000Z' });
      const status = getAchievementCardStatus('streak-10', [older, newer], []);
      expect(status.unlocked).toBe(true);
      expect(status.timesEarned).toBe(2);
      expect(status.latest?.taskName).toBe('Second');
    });

    it('orders earners by each task\'s own FIRST earn of this kind, not whichever re-earn is most recent', () => {
      // Task 'first' unlocked this kind earliest (Jan); task 'second' unlocked it later (Feb).
      // 'first' then re-earns it again later still (Apr, e.g. after a streak reset) -- the most
      // recent event in this whole fixture -- but that must NOT let 'first' outrank 'second':
      // 'second's own first (and only) earn (Feb) is more recent than 'first's real first unlock
      // (Jan), so 'second' still ranks ahead of 'first' in the earners row.
      const firstTaskFirstEarn = makeAchievement('streak-10', { taskId: 'first', taskName: 'First', earnedAt: '2026-01-01T00:00:00.000Z' });
      const secondTaskEarn = makeAchievement('streak-10', { taskId: 'second', taskName: 'Second', earnedAt: '2026-02-01T00:00:00.000Z' });
      const firstTaskReEarn = makeAchievement('streak-10', { taskId: 'first', taskName: 'First', earnedAt: '2026-04-01T00:00:00.000Z' });
      const status = getAchievementCardStatus('streak-10', [firstTaskFirstEarn, secondTaskEarn, firstTaskReEarn], []);
      expect(status.earners.map(e => e.taskId)).toEqual(['second', 'first']);
    });

    it('reads totalCompletions (not currentStreak) for milestone-N kinds', () => {
      const task = makeTask({ id: 't1', name: 'Reader' }, { currentStreak: 1, totalCompletions: 7 });
      const status = getAchievementCardStatus('milestone-10', [], [task]);
      expect(status.progress).toEqual({ current: 7, target: 10, taskName: 'Reader', taskColor: '#4285F4' });
    });

    it('still finds the closest task for a global kind (first-completion), same as any per-task one', () => {
      // Progress computation doesn't care about scope -- it's still just "fixed-threshold", the
      // same shared handler streak-10/milestone-10 above use. The only thing that differs for a
      // global kind is what happens to the *earned* record (no taskId attached), covered by
      // detectCompletionAchievements's own tests above.
      const near = makeTask({ id: 'near', name: 'Near' }, { totalCompletions: 1 });
      const far = makeTask({ id: 'far', name: 'Far' }, { totalCompletions: 0 });
      const status = getAchievementCardStatus('first-completion', [], [near, far]);
      expect(status.progress).toEqual({ current: 1, target: 1, taskName: 'Near', taskColor: '#4285F4' });
    });
  });

  describe('new-best-streak', () => {
    it('picks the task closest to tying its own record', () => {
      const closeToRecord = makeTask({ id: 'a', name: 'Close' }, { currentStreak: 8, bestStreak: 10 });
      const farFromRecord = makeTask({ id: 'b', name: 'Far' }, { currentStreak: 1, bestStreak: 20 });
      const status = getAchievementCardStatus('new-best-streak', [], [closeToRecord, farFromRecord]);
      expect(status.progress).toEqual({ current: 8, target: 10, taskName: 'Close', taskColor: '#4285F4' });
    });

    it('excludes tasks with no real best (bestStreak 0) or already tied/passed it', () => {
      const neverHadABest = makeTask({ id: 'a' }, { currentStreak: 3, bestStreak: 0 });
      const tied = makeTask({ id: 'b' }, { currentStreak: 5, bestStreak: 5 });
      const status = getAchievementCardStatus('new-best-streak', [], [neverHadABest, tied]);
      expect(status.progress).toBeUndefined();
    });
  });

  describe('anniversary (task-age)', () => {
    it('reports the closest not-yet-earned task\'s own age in days, capped at the target', () => {
      const today = new Date('2026-01-01T00:00:00.000Z');
      const young = makeTask({ id: 'young', name: 'Young', createdAt: new Date('2025-11-01T00:00:00.000Z').toISOString() });
      const old = makeTask({ id: 'old', name: 'Old', createdAt: new Date('2020-01-01T00:00:00.000Z').toISOString() });
      const status = getAchievementCardStatus('anniversary', [], [young, old], today);
      // `old` is already well past 365 days -- capped at the target, same as fixed-threshold's own
      // "overshooting" behavior -- so it still wins over `young`'s uncapped ~61 days.
      expect(status.progress).toEqual({ current: 365, target: 365, taskName: 'Old', taskColor: '#4285F4' });
    });

    it('excludes a task that has already earned this specific kind from progress', () => {
      const today = new Date('2026-01-01T00:00:00.000Z');
      const alreadyEarned = makeTask({ id: 't1', name: 'Already', createdAt: new Date('2020-01-01T00:00:00.000Z').toISOString() });
      const stillYoung = makeTask({ id: 't2', name: 'Young', createdAt: new Date('2025-06-01T00:00:00.000Z').toISOString() });
      const achievements = [makeAchievement('anniversary', { taskId: 't1' })];
      const status = getAchievementCardStatus('anniversary', achievements, [alreadyEarned, stillYoung], today);
      expect(status.unlocked).toBe(true);
      expect(status.progress?.taskName).toBe('Young');
    });
  });

  describe('comeback', () => {
    it('has no numeric progress, only an opportunity flag', () => {
      const expired = makeTask({}, { streakStatus: 'expired' });
      const status = getAchievementCardStatus('comeback', [], [expired]);
      expect(status.progress).toBeUndefined();
      expect(status.opportunityAvailable).toBe(true);
    });

    it('reports no opportunity when nothing is currently lapsed', () => {
      const healthy = makeTask({}, { streakStatus: 'up_to_date' });
      const status = getAchievementCardStatus('comeback', [], [healthy]);
      expect(status.opportunityAvailable).toBe(false);
    });
  });

  describe('perfect-day', () => {
    it('reports today\'s live completed-vs-due fraction regardless of unlocked state', () => {
      const done = makeTask({ id: 't1', completions: [makeCompletion('c1', today)] }, { currentStreak: 1 });
      const notDone = makeTask({ id: 't2', completions: [] }, { currentStreak: 0 });
      const status = getAchievementCardStatus('perfect-day', [], [done, notDone], today);
      expect(status.progress).toEqual({ current: 1, target: 2 });
    });

    it('has no progress when nothing is due today', () => {
      const notToday = (today.getDay() + 1) % 7;
      const notDue = makeTask({
        frequency: 'specific_days_of_week',
        daysOfWeek: [notToday],
      }, { currentStreak: 0 });
      const status = getAchievementCardStatus('perfect-day', [], [notDue], today);
      expect(status.progress).toBeUndefined();
    });
  });

  describe('perfect-week (fixed calendar window)', () => {
    it('reports completed due opportunities within the current Sunday-Saturday week', () => {
      const saturday = new Date(2026, 7, 22);
      const days = Array.from({ length: 3 }, (_, i) => new Date(2026, 7, 16 + i));
      const completions = days.map((d, i) => makeCompletion(`c${i}`, d));
      // Two tasks (PERFECT_DAY_MIN_DUE_TASKS) sharing the exact same completion history, so every
      // one of the 3 days is genuinely "perfect" for both, not just a single-task minimum.
      const task = makeTask({ id: 't1', completions }, { currentStreak: 3 });
      const task2 = makeTask({ id: 't2', completions: completions.map(c => ({ ...c, id: `${c.id}-2` })) }, { currentStreak: 3 });
      const status = getAchievementCardStatus('perfect-week', [], [task, task2], saturday);
      expect(status.progress).toEqual({ current: 6, target: 14 });
    });

    it('stops counting at the first broken day', () => {
      const task = makeTask({ id: 't1', completions: [] }, { currentStreak: 0 });
      const status = getAchievementCardStatus('perfect-week', [], [task], today);
      expect(status.progress).toEqual({ current: 0, target: 7 });
    });
  });

  describe('new achievement progress strategies', () => {
    it('shows weekly quota overage progress against the rounded 150% target', () => {
      const dates = Array.from({ length: 4 }, (_, index) => new Date(2026, 7, 16 + index));
      const task = makeTask({
        frequency: 'days_per_week',
        daysPerWeek: 3,
        completions: dates.map((date, index) => makeCompletion(`q-${index}`, date)),
      });
      const status = getAchievementCardStatus('weekly-overachiever', [], [task], dates[3]);
      expect(status.progress).toEqual({ current: 4, target: 5, taskName: task.name, taskColor: task.color });
    });

    it('shows Unstoppable progress for the closest specific-days habit across Sunday-Saturday', () => {
      const dates = Array.from({ length: 5 }, (_, index) => new Date(2026, 7, 16 + index));
      const task = makeTask({
        frequency: 'specific_days_of_week',
        daysOfWeek: [1, 3, 5],
        completions: dates.map((date, index) => makeCompletion(`u-${index}`, date)),
      });
      const status = getAchievementCardStatus('unstoppable', [], [task], new Date(2026, 7, 22));
      expect(status.progress).toEqual({ current: 5, target: 7, taskName: task.name, taskColor: task.color });
    });

    it('shows healthy concurrent streak progress for Streak Addict', () => {
      const tasks = Array.from({ length: 4 }, (_, index) => makeTask(
        { id: `active-${index}` },
        { currentStreak: 2, streakStatus: 'up_to_date' },
      ));
      expect(getAchievementCardStatus('streak-addict', [], tasks, today).progress)
        .toEqual({ current: 4, target: 6 });
    });
  });

  describe('century-club (total-completions-sum, three tiers)', () => {
    it('sums totalCompletions across every active task, capped at each tier\'s own target', () => {
      // getAchievementCardStatus trusts `activeTasks` is already archive-filtered by the caller
      // (TrophiesScreen passes tasks.filter(t => !t.archived)) -- same convention every other
      // strategy case here already follows, so this doesn't re-test archived-exclusion at this
      // layer (that's covered at the detection layer, above, where the filtering actually happens).
      const t1 = makeTask({ id: 't1' }, { totalCompletions: 600 });
      const t2 = makeTask({ id: 't2' }, { totalCompletions: 600 });
      // Sum is 1200 -- comfortably past all three tiers' own targets, each capped independently.
      expect(getAchievementCardStatus('century-club-100', [], [t1, t2], today).progress).toEqual({ current: 100, target: 100 });
      expect(getAchievementCardStatus('century-club-500', [], [t1, t2], today).progress).toEqual({ current: 500, target: 500 });
      expect(getAchievementCardStatus('century-club-1000', [], [t1, t2], today).progress).toEqual({ current: 1000, target: 1000 });
      expect(getAchievementCardStatus('century-club-10000', [], [t1, t2], today).progress).toEqual({ current: 1200, target: 10000 });
    });
  });

  describe('habit-collector (active-task-count)', () => {
    it('reports the active task count, capped at the cap', () => {
      const tasks = Array.from({ length: 3 }, (_, i) => makeTask({ id: `t${i}` }));
      const status = getAchievementCardStatus('habit-collector', [], tasks, today);
      expect(status.progress).toEqual({ current: 3, target: 6 });
    });
  });

  describe('early-bird / night-owl (time-of-day-ratio)', () => {
    const completionAt = (id: string, hour: number): TaskCompletion => {
      const d = new Date(today);
      d.setHours(hour, 0, 0, 0);
      return makeCompletion(id, d);
    };

    it('has no progress with zero completions', () => {
      const task = makeTask({ id: 't1', completions: [] });
      const status = getAchievementCardStatus('early-bird', [], [task], today);
      expect(status.progress).toBeUndefined();
    });

    it('reports the qualifying fraction of the trailing window', () => {
      // 12 total (>= TIME_OF_DAY_MIN_SAMPLES, so progress actually shows; < window so nothing
      // gets truncated by the trailing-14 cap).
      const completions = [
        ...Array.from({ length: 7 }, (_, i) => completionAt(`e${i}`, 5)),
        ...Array.from({ length: 5 }, (_, i) => completionAt(`m${i}`, 13)),
      ];
      const task = makeTask({ id: 't1', completions });
      const status = getAchievementCardStatus('early-bird', [], [task], today);
      expect(status.progress).toEqual({ current: 7, target: 6 }); // Math.ceil(12 / 2)
    });

    it('shows no progress below the minimum sample size, even with a qualifying fraction (regression)', () => {
      // Same bug this shared helper was extracted to fix: a locked card's progress bar must not
      // show a misleadingly "close"/"done"-looking number from a handful of completions detection
      // itself wouldn't yet consider eligible -- see getTimeOfDayWindow's own comment.
      const completions = Array.from({ length: 5 }, (_, i) => completionAt(`e${i}`, 5)); // all before 7am, but only 5 total
      const task = makeTask({ id: 't1', completions });
      const status = getAchievementCardStatus('early-bird', [], [task], today);
      expect(status.progress).toBeUndefined();
    });

    it('the trailing window is the truly most-recent completions, not just any N of them (regression, bounded-selection correctness)', () => {
      // 20 total, all on the same day: the 6 OLDEST are well before 7am (would qualify for
      // early-bird), the 14 NEWEST are all mid-day (wouldn't). If the bounded top-k selection
      // picked the wrong 14 -- or a regression reintroduced considering the *whole* history
      // instead of just the trailing window -- some of the old early ones would leak in and
      // qualifying would be nonzero.
      const base = new Date(today);
      base.setHours(0, 0, 0, 0);
      const completions: TaskCompletion[] = [
        ...Array.from({ length: 6 }, (_, i) => {
          const d = new Date(base);
          d.setHours(5, i, 0, 0); // 5:00-5:05am -- unambiguously earlier in the day than any below
          return makeCompletion(`old-early-${i}`, d);
        }),
        ...Array.from({ length: 14 }, (_, i) => {
          const d = new Date(base);
          d.setHours(13, i, 0, 0); // 1:00-1:13pm -- unambiguously the most recent 14
          return makeCompletion(`new-mid-${i}`, d);
        }),
      ];
      const task = makeTask({ id: 't1', completions });
      const status = getAchievementCardStatus('early-bird', [], [task], today);
      expect(status.progress).toEqual({ current: 0, target: 7 }); // Math.ceil(14 / 2), none of the 14 most recent qualify
    });

    it('rebuilds only for a replacement completion array and never reuses stale data by task id', () => {
      const originalCompletions = Array.from({ length: 10 }, (_, i) => completionAt(`mid-${i}`, 13));
      const originalTask = makeTask({ id: 'same-task-id', completions: originalCompletions });
      expect(getAchievementCardStatus('early-bird', [], [originalTask], today).progress)
        .toEqual({ current: 0, target: 5 });

      // Same task id, deliberately new immutable array/reference and different values. A cache
      // keyed by task id (or one missing reference invalidation) would incorrectly retain 0 here.
      const replacementCompletions = [
        ...Array.from({ length: 6 }, (_, i) => completionAt(`early-${i}`, 5)),
        ...Array.from({ length: 4 }, (_, i) => completionAt(`later-mid-${i}`, 13)),
      ];
      const replacementTask = makeTask({ id: 'same-task-id', completions: replacementCompletions });
      expect(getAchievementCardStatus('early-bird', [], [replacementTask], today).progress)
        .toEqual({ current: 6, target: 5 });

      // Re-reading the old immutable snapshot still returns its own cached answer, proving the
      // two histories coexist without overwriting or contaminating one another.
      expect(getAchievementCardStatus('early-bird', [], [originalTask], today).progress)
        .toEqual({ current: 0, target: 5 });
    });

    it('merges cached per-task windows into the true global newest window', () => {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(5, 0, 0, 0);
      const oldEarly = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(yesterday);
        d.setMinutes(i);
        return makeCompletion(`old-early-${i}`, d);
      });
      const recentMidday = Array.from({ length: 14 }, (_, i) => completionAt(`recent-mid-${i}`, 13));
      const tasks = [
        makeTask({ id: 'old-task', completions: oldEarly }),
        makeTask({ id: 'recent-task', completions: recentMidday }),
      ];

      // Each task contributes a cached top-14 slice, but the final top-14 must still be selected
      // globally. All of yesterday's qualifying records should be displaced by today's records.
      expect(getAchievementCardStatus('early-bird', [], tasks, today).progress)
        .toEqual({ current: 0, target: 7 });
    });
  });
});

describe('getAllAchievementCardStatuses', () => {
  it('returns exactly one status per kind, in catalog order', () => {
    const statuses = getAllAchievementCardStatuses([], []);
    expect(statuses.map(s => s.kind)).toEqual(ACHIEVEMENT_KIND_ORDER);
    // Deliberately not a hardcoded kind count -- always compared against
    // ACHIEVEMENT_KIND_ORDER's own length, so this can't silently drift out of sync with it as
    // the catalog grows (22 kinds as of the 2026-08-12 six-kind addition).
    expect(statuses).toHaveLength(ACHIEVEMENT_KIND_ORDER.length);
  });
});

describe('getGroupedAchievementCardStatuses', () => {
  it('with nothing unlocked or in progress, puts every kind in Locked, in catalog order, and omits the Unlocked group entirely', () => {
    const untouched = makeTask({ id: 't1' }); // every stat 0, never_started -- no progress anywhere
    const groups = getGroupedAchievementCardStatuses([], [untouched]);
    expect(groups.map(g => g.group)).toEqual(['locked']);
    // habit-collector is the one exception: its own progress metric is "how many active tasks
    // exist" (active-task-count), not a task stat -- with one real task present in this fixture it
    // already reads partial progress (1/6), so it's the sole in-progress kind and sorts ahead of
    // every genuinely untouched (not-started) kind within Locked.
    const expectedOrder = ['habit-collector', ...ACHIEVEMENT_KIND_ORDER.filter(k => k !== 'habit-collector')];
    expect(groups[0].statuses.map(s => s.kind)).toEqual(expectedOrder);
  });

  it('sorts the Unlocked group by first-earned date, newest first (no kind here has more than one instance, so this also happens to match "most recently earned")', () => {
    const older = makeAchievement('milestone-10', { taskId: 't1', earnedAt: '2026-01-01T00:00:00.000Z' });
    const newest = makeAchievement('streak-10', { taskId: 't2', earnedAt: '2026-06-01T00:00:00.000Z' });
    const middle = makeAchievement('perfect-day', { dedupScope: '2026-03-01', earnedAt: '2026-03-01T00:00:00.000Z' });
    const groups = getGroupedAchievementCardStatuses([older, newest, middle], []);
    const unlocked = groups.find(g => g.group === 'unlocked');
    expect(unlocked?.statuses.map(s => s.kind)).toEqual(['streak-10', 'perfect-day', 'milestone-10']);
  });

  it('for a kind re-earned multiple times, sorts by its own FIRST-ever earn, not whichever re-earn is most recent', () => {
    // streak-10 was first earned in Jan (earlier than milestone-10's own Feb earn) but re-earned
    // again in Jun (e.g. a streak resetting and climbing back up). Jun is the most recent event in
    // this whole fixture, but it must not bump streak-10 ahead of milestone-10 -- streak-10's real
    // first unlock (Jan) is still earlier than milestone-10's (Feb), so milestone-10 ranks first.
    const streak10First = makeAchievement('streak-10', { taskId: 't1', earnedAt: '2026-01-01T00:00:00.000Z' });
    const milestone10 = makeAchievement('milestone-10', { taskId: 't2', earnedAt: '2026-02-01T00:00:00.000Z' });
    const streak10ReEarn = makeAchievement('streak-10', { taskId: 't1', earnedAt: '2026-06-01T00:00:00.000Z' });
    const groups = getGroupedAchievementCardStatuses([streak10First, milestone10, streak10ReEarn], []);
    const unlocked = groups.find(g => g.group === 'unlocked');
    expect(unlocked?.statuses.map(s => s.kind)).toEqual(['milestone-10', 'streak-10']);
  });

  it('within the Locked group, sorts the in-progress portion by closeness (highest fraction first), ahead of every not-yet-started kind', () => {
    // A single task, its own currentStreak partially crossing several fixed-threshold tiers at
    // once -- each tier's progress is capped independently, so the lower the target relative to
    // this streak, the closer (higher fraction) that tier reads. first-completion and milestone-N
    // (both reading totalCompletions, left at 0) have no progress at all, so they stay in the
    // not-started portion -- appended after every in-progress kind, never interspersed among them.
    const task = makeTask({ id: 't1' }, { currentStreak: 3, bestStreak: 3, totalCompletions: 0 });
    const groups = getGroupedAchievementCardStatuses([], [task]);
    const locked = groups.find(g => g.group === 'locked');
    expect(locked).toBeDefined();
    const kinds = locked!.statuses.map(s => s.kind);
    // streak-2 (target 2) is already at its cap (3 -> capped 2/2 = 1.0), ranking above streak-5
    // (3/5 = 0.6), which ranks above streak-10 (3/10 = 0.3), which in turn ranks ahead of both
    // not-started kinds (first-completion, milestone-10 -- both 0 progress).
    const indexOfStreak5 = kinds.indexOf('streak-5');
    const indexOfStreak10 = kinds.indexOf('streak-10');
    const indexOfMilestone10 = kinds.indexOf('milestone-10');
    const indexOfFirstCompletion = kinds.indexOf('first-completion');
    expect(kinds.indexOf('streak-2')).toBeLessThan(indexOfStreak5);
    expect(indexOfStreak5).toBeLessThan(indexOfStreak10);
    expect(indexOfStreak10).toBeLessThan(indexOfFirstCompletion);
    expect(indexOfStreak10).toBeLessThan(indexOfMilestone10);
  });

  it('treats a readiness kind with an opportunity available as maximally close, sorting ahead of every not-started kind within Locked', () => {
    const lapsed = makeTask({ id: 't1' }, { streakStatus: 'expired' });
    const groups = getGroupedAchievementCardStatuses([], [lapsed]);
    const locked = groups.find(g => g.group === 'locked');
    const kinds = locked!.statuses.map(s => s.kind);
    // A lapsed task's other stats are all still 0, so comeback (opportunityAvailable -> fraction
    // 1) is the *only* kind with any progress here -- it lands first in the concatenated list,
    // ahead of every zero-progress, not-started kind that follows it.
    expect(kinds.indexOf('comeback')).toBe(0);
  });
});

describe('getFirstEarnedAchievements', () => {
  it('collapses a repeatable kind re-earned multiple times down to its own first instance', () => {
    const first = makeAchievement('streak-2', { id: 'a', taskId: 't1', earnedAt: '2026-01-01T00:00:00.000Z' });
    const secondEarn = makeAchievement('streak-2', { id: 'b', taskId: 't1', earnedAt: '2026-03-01T00:00:00.000Z' });
    const result = getFirstEarnedAchievements([first, secondEarn]);
    expect(result).toEqual([first]);
  });

  it('sorts by each identity\'s own first-earned date, not by whichever re-earn is most recent', () => {
    // streak-2 was FIRST earned on 2026-01-01 -- earlier than milestone-10's own single earn on
    // 2026-01-15. streak-2 is later re-earned on 2026-03-01, the most recent event in the whole
    // list -- but that re-earn must NOT let it jump ahead of milestone-10 in the sort:
    // milestone-10 still ranks first, since its own (only) unlock is more recent than streak-2's
    // real first unlock, which is what the sort actually keys on.
    const streak2First = makeAchievement('streak-2', { id: 'a', taskId: 't1', earnedAt: '2026-01-01T00:00:00.000Z' });
    const milestone10 = makeAchievement('milestone-10', { id: 'b', taskId: 't1', earnedAt: '2026-01-15T00:00:00.000Z' });
    const streak2ReEarn = makeAchievement('streak-2', { id: 'c', taskId: 't1', earnedAt: '2026-03-01T00:00:00.000Z' });
    const result = getFirstEarnedAchievements([streak2First, milestone10, streak2ReEarn]);
    expect(result.map(a => a.id)).toEqual(['b', 'a']);
  });

  it('collapses the same kind earned by two different tasks into one entry -- whichever task earned it first', () => {
    // Identity is kind alone, not kind+task -- per explicit user direction, two different habits
    // both hitting a 2-day streak should still read as one "2-Day Streak" trophy on an unfiltered,
    // multi-task list, not two. The earlier of the two instances (task t1's) wins as the
    // representative.
    const taskAEarn = makeAchievement('streak-2', { id: 'a', taskId: 't1', earnedAt: '2026-01-01T00:00:00.000Z' });
    const taskBEarn = makeAchievement('streak-2', { id: 'b', taskId: 't2', earnedAt: '2026-02-01T00:00:00.000Z' });
    const result = getFirstEarnedAchievements([taskAEarn, taskBEarn]);
    expect(result.map(a => a.id)).toEqual(['a']);
  });

  it('groups global (taskless) kinds by kind alone', () => {
    const firstPerfectDay = makeAchievement('perfect-day', { id: 'a', taskId: undefined, earnedAt: '2026-01-01T00:00:00.000Z' });
    const laterPerfectDay = makeAchievement('perfect-day', { id: 'b', taskId: undefined, earnedAt: '2026-02-01T00:00:00.000Z' });
    const result = getFirstEarnedAchievements([firstPerfectDay, laterPerfectDay]);
    expect(result.map(a => a.id)).toEqual(['a']);
  });

  it('an empty list produces an empty result', () => {
    expect(getFirstEarnedAchievements([])).toEqual([]);
  });
});
