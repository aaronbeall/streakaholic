import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Task } from '../../app/types';
import {
  AchievementKind,
  dedupKey,
  detectCompletionAchievements,
  detectRetroactiveAchievements,
} from '../../app/utils/achievements';
import { parseTasksImport } from '../../app/utils/importExport';
import { calculateTaskStats, getCompletionCount } from '../../app/utils/streaks';

const demoPath = path.join(__dirname, '../../demo-data/streakaholic-demo-data.json');
const parsed = parseTasksImport(fs.readFileSync(demoPath, 'utf8'));
const anchor = new Date(parsed.meta!.exportedAt);
const tasks = parsed.tasks.map((task): Task => ({
  ...task,
  stats: calculateTaskStats(task, task.completions ?? [], anchor),
}));
const byName = (name: string) => tasks.find(task => task.name === name)!;

const generateFor = (today: string): Task[] => {
  const output = path.join(os.tmpdir(), `streakaholic-demo-${process.pid}-${today}.json`);
  try {
    execFileSync('python3', [
      path.join(__dirname, '../../demo-data/generate-demo-data.py'),
      '--today', today,
      '--output', output,
    ]);
    const generated = parseTasksImport(fs.readFileSync(output, 'utf8'));
    const generatedAnchor = new Date(generated.meta!.exportedAt);
    return generated.tasks.map((task): Task => ({
      ...task,
      stats: calculateTaskStats(task, task.completions ?? [], generatedAnchor),
    }));
  } finally {
    if (fs.existsSync(output)) fs.unlinkSync(output);
  }
};

describe('generated marketing demo data', () => {
  it('covers every schedule type at the real six-habit active cap', () => {
    const active = tasks.filter(task => !task.archived);
    expect(active).toHaveLength(6);
    expect(tasks.filter(task => task.archived)).toHaveLength(1);
    expect(new Set(active.map(task => task.frequency))).toEqual(new Set([
      'daily',
      'specific_days_of_week',
      'days_per_week',
      'days_per_month',
    ]));
  });

  it('stages live, expiring, expired, never-started, partial, and record streak states', () => {
    const workout = byName('Morning Workout');
    const water = byName('Drink Water');
    const reading = byName('Read Before Bed');
    const mealPrep = byName('Meal Prep');
    const deepClean = byName('Deep Clean');
    const spanish = byName('Learn Spanish');

    // 34, not 35 -- one day in the middle of this live streak is a genuine skip
    // (Task.skippedDates), not a completion; it doesn't count toward the streak length,
    // but per the skip feature's own design it doesn't break the streak either.
    expect(workout.stats).toMatchObject({ currentStreak: 34, bestStreak: 132, streakStatus: 'up_to_date' });
    expect(workout.skippedDates).toHaveLength(1);
    expect(water.stats).toMatchObject({ currentStreak: 75, bestStreak: 100, streakStatus: 'expiring' });
    expect(getCompletionCount(water, anchor)).toBe(2);
    expect(reading.stats).toMatchObject({ currentStreak: 1, streakStatus: 'expiring' });
    expect(mealPrep.stats?.streakStatus).toBe('expired');
    expect(mealPrep.stats!.lastStreak).toBeGreaterThan(0);
    expect(deepClean.stats?.streakStatus).toBe('up_to_date');
    expect(spanish.stats).toMatchObject({ currentStreak: 0, bestStreak: 0, streakStatus: 'never_started' });
  });

  // Deliberately includes both Sunday and non-Sunday anchor dates (only 2026-03-01 is a
  // Sunday). Regression coverage for a real bug found 2026-08-19: Morning Workout/Drink
  // Water's shared "first seven days" window used to be pinned to a literal 420-day
  // offset, and 420 % 7 == 0 means `daysAgo(420)` always lands on the *same* weekday as
  // whatever `--today` is -- so the window only actually formed a real Sunday-Saturday
  // week (and only then could Perfect Week unlock) when the generator happened to run on
  // a Sunday. This suite's own `it.each` never caught it because it only checked `.stats`,
  // never which achievements the generated history actually unlocks, for anything but the
  // one date `tasks`/`anchor` above happened to be generated with.
  it.each(['2026-01-01', '2026-02-28', '2026-03-01', '2026-12-31'])(
    'keeps its intended states, and still unlocks Perfect Week, across weekday and month boundaries (%s)',
    generatedDate => {
      const generated = generateFor(generatedDate);
      const generatedByName = (name: string) => generated.find(task => task.name === name)!;
      expect(generatedByName('Morning Workout').stats).toMatchObject({ currentStreak: 34, bestStreak: 132, streakStatus: 'up_to_date' });
      expect(generatedByName('Drink Water').stats).toMatchObject({ currentStreak: 75, bestStreak: 100, streakStatus: 'expiring' });
      expect(generatedByName('Read Before Bed').stats).toMatchObject({ currentStreak: 1, streakStatus: 'expiring' });
      expect(generatedByName('Meal Prep').stats?.streakStatus).toBe('expired');
      expect(generatedByName('Deep Clean').stats?.streakStatus).toBe('up_to_date');
      expect(generatedByName('Learn Spanish').stats?.streakStatus).toBe('never_started');

      const active = generated.filter(task => !task.archived);
      const earned = detectRetroactiveAchievements([], active, new Date(generatedDate));
      expect(earned.some(item => item.kind === 'perfect-week')).toBe(true);
    },
  );

  it('populates analytics and unlocks a representative, intentionally incomplete trophy case', () => {
    const active = tasks.filter(task => !task.archived);
    const qualifyingTotal = active.reduce((sum, task) => sum + (task.stats?.totalCompletions ?? 0), 0);
    expect(qualifyingTotal).toBeGreaterThanOrEqual(500);
    expect(qualifyingTotal).toBeLessThan(1000);

    const earned = detectRetroactiveAchievements([], active, anchor);
    const kinds = new Set(earned.map(item => item.kind));
    const expectedUnlocked: AchievementKind[] = [
      'first-completion',
      'streak-2',
      'streak-5',
      'streak-10',
      'streak-25',
      'streak-50',
      'streak-100',
      'new-best-streak',
      'anniversary',
      'milestone-100',
      'century-club-100',
      'century-club-500',
      'perfect-day',
      'perfect-week',
      'comeback',
      'habit-collector',
      'early-bird',
      'night-owl',
    ];
    expect(expectedUnlocked.filter(kind => !kinds.has(kind))).toEqual([]);
    expect(kinds.has('streak-1000')).toBe(false);
    expect(kinds.has('milestone-1000')).toBe(false);
    expect(kinds.has('century-club-1000')).toBe(false);
    expect(earned.filter(item => item.kind === 'century-club-100')).toHaveLength(1);
    expect(earned.filter(item => item.kind === 'century-club-500')).toHaveLength(1);
    expect(earned.filter(item => item.kind === 'habit-collector')).toHaveLength(1);
  });

  it('stages one live completion that launches the full-screen streak-started achievement', () => {
    const active = tasks.filter(task => !task.archived);
    const reading = byName('Read Before Bed');
    const alreadyEarned = detectRetroactiveAchievements([], active, anchor);
    const date = anchor.toISOString().slice(0, 10);
    const completedReading: Task = {
      ...reading,
      completions: [
        ...(reading.completions ?? []),
        {
          id: 'demo-live-reading-completion',
          taskId: reading.id,
          date,
          completedAt: anchor.toISOString(),
          timesCompleted: 1,
        },
      ],
    };
    completedReading.stats = calculateTaskStats(completedReading, completedReading.completions ?? [], anchor);
    const allTasksAfter = active.map(task => task.id === reading.id ? completedReading : task);
    const alreadyEarnedScopes = new Set(alreadyEarned.map(item => dedupKey(item.kind, item.dedupScope)));

    const liveUnlocks = detectCompletionAchievements(
      reading,
      completedReading,
      allTasksAfter,
      anchor,
      alreadyEarnedScopes,
    );

    expect(completedReading.stats).toMatchObject({ currentStreak: 2, streakStatus: 'up_to_date' });
    expect(liveUnlocks.map(item => item.kind)).toEqual(['streak-2']);
    expect(liveUnlocks[0]).toMatchObject({ taskId: reading.id, value: 2 });
  });
});
