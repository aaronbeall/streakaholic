#!/usr/bin/env python3
"""
Generates a test dataset specifically poised to hit every one of the 12 "congratulation stinger"
achievement kinds (see app/utils/achievements.ts) via ONE simple action per task, taken *after*
import -- achievements only ever fire off a real completeTask press (see CLAUDE.md's "No
historical backfill" design decision), never retroactively from imported history alone. So unlike
streakaholic-demo-data.json (which aims for realism), every task here is deliberately engineered to
sit exactly one action away from crossing a specific achievement's threshold.

Import via Settings -> Import Data (merges) or Import & Replace All Data (clean slate), then work
through demo-data/README.md's "What to do after importing" checklist -- completing all 12 tasks'
one-tap actions (in any order) will also trigger perfect-day as a bonus on whichever one you
happen to complete last, since by then every due task is completed for today.

Re-run any time to regenerate with fresh dates relative to "today", same reasoning as the sibling
generate-demo-data.py.
"""

import json
from datetime import datetime, timedelta

TODAY = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)


def d(days_ago: int) -> datetime:
    return TODAY - timedelta(days=days_ago)


def date_str(dt: datetime) -> str:
    return dt.strftime('%Y-%m-%d')


def iso_at(dt: datetime, hour: int, minute: int = 0) -> str:
    return dt.replace(hour=hour, minute=minute, second=0, microsecond=0).isoformat() + 'Z'


_next_id = [0]


def next_id(prefix: str) -> str:
    _next_id[0] += 1
    return f'{prefix}-{_next_id[0]}'


def make_completion(task_id: str, dt: datetime, hour: int = 9) -> dict:
    return {
        'id': next_id('achv-comp'),
        'taskId': task_id,
        'date': date_str(dt),
        'completedAt': iso_at(dt, hour),
        'timesCompleted': 1,
    }


def base_task(task_id, name, icon, color, created_days_ago, **overrides):
    task = {
        'id': task_id,
        'name': name,
        'icon': icon,
        'color': color,
        'frequency': 'daily',
        'daysOfWeek': [],
        'daysPerWeek': 3,
        'daysPerMonth': 10,
        'timesPerDay': 1,
        'createdAt': iso_at(d(created_days_ago), 8),
        'updatedAt': iso_at(TODAY, 8),
        'completions': [],
    }
    task.update(overrides)
    return task


def consecutive_run(task_id: str, start_offset: int, end_offset: int) -> list:
    """Completions for every day from `start_offset` down to `end_offset` days ago, inclusive
    (start_offset >= end_offset), one per day -- a plain unbroken run."""
    return [make_completion(task_id, d(i)) for i in range(start_offset, end_offset - 1, -1)]


tasks = []

# ---------------------------------------------------------------------------
# 1. First Completion Demo -- created 2 days ago, zero completions so far. Since first-completion
#    fires the first time ANY task's own totalCompletions crosses 0 -> 1 (see achievements.ts --
#    this kind replaced the original first-streak, which was redundant with streak-2), this is the
#    only task in the whole dataset that still has zero completions -- every other task below
#    already has some history from import, so none of THEIR first taps can cross that same 0 -> 1
#    boundary. Tapping "complete today" here is guaranteed to be this dataset's first-ever
#    completion, regardless of what order the tasks are tapped in.
# ---------------------------------------------------------------------------
first_id = next_id('achv-task')
first_completion = base_task(first_id, 'First Completion Demo', 'shoe-print', '#FF6B6B', 2)
tasks.append(first_completion)

# ---------------------------------------------------------------------------
# 2. New Best Streak Demo -- an old, separate closed run of 6 days (day -8..-3) sets the
#    historical ceiling. Day -2 is deliberately left MISSED. The currently-open run (day -1..today,
#    2 days, TODAY ALREADY completed) sits below that ceiling. Tapping day -2 on the Calendar tab
#    to backfill it bridges old-run + gap-day + current-run into one continuous 9-day streak,
#    jumping straight past the old 6-day ceiling in a single action -- the only way this
#    achievement can fire at all (see CLAUDE.md/achievements.ts: bestStreak tracks currentStreak so
#    tightly that a plain +1/day increment can never cross it, only a backfill-bridged jump can).
#    Deliberately kept small (final streak of 9, total completions of 9) so it stays clear of every
#    other threshold (streak-10, milestone-10) and fires in true isolation. Since TODAY is already
#    completed here, this task needs no extra tap to count toward Perfect Day.
# ---------------------------------------------------------------------------
best_id = next_id('achv-task')
new_best_streak = base_task(best_id, 'New Best Streak Demo', 'trophy-award', '#FFD700', 10)
new_best_streak['completions'] = (
    consecutive_run(best_id, 8, 3) +  # old closed run: 6 days
    # day -2 deliberately skipped -- the gap to backfill
    consecutive_run(best_id, 1, 0)  # current open run, through today: 2 days
)
tasks.append(new_best_streak)

# ---------------------------------------------------------------------------
# 3-7. Streak 10/25/50/100/1000 Demo -- each sits at (tier - 1) consecutive days ending
#      yesterday, today not yet completed. Tapping "complete today" crosses that exact tier.
# ---------------------------------------------------------------------------
STREAK_TIERS = [
    (10, '#FF9F43'),
    (25, '#FF6B00'),
    (50, '#FF4500'),
    (100, '#E74C3C'),
    (1000, '#C0392B'),
]
for tier, color in STREAK_TIERS:
    run_length = tier - 1
    task_id = next_id('achv-task')
    task = base_task(task_id, f'Streak {tier} Demo', 'fire', color, run_length + 2)
    task['completions'] = consecutive_run(task_id, run_length, 1)
    tasks.append(task)

# ---------------------------------------------------------------------------
# 8-11. Milestone 10/50/100/1000 Demo -- (tier - 1) *non-consecutive* qualifying dates (every other
#       day, starting 2 days ago so today AND yesterday both stay empty) -- totalCompletions sits
#       one below the tier, but currentStreak stays trivially small (0, since yesterday's empty),
#       so tapping "complete today" cleanly crosses only the milestone tier, never a streak-N tier
#       (current streak only reaches 1) or first-completion (each of these tasks already has
#       tier-1 >= 1 completions from import, so its own totalCompletions never crosses 0 -> 1).
#       (milestone-50 added 2026-08-12, alongside its own new Silver theme -- see achievements.ts.)
# ---------------------------------------------------------------------------
MILESTONE_TIERS = [
    (10, '#4ECDC4'),
    (50, '#45B7D1'),
    (100, '#5B6EE1'),
    (1000, '#9B59B6'),
]
for tier, color in MILESTONE_TIERS:
    count = tier - 1
    task_id = next_id('achv-task')
    max_offset = 2 + (count - 1) * 2
    task = base_task(task_id, f'Milestone {tier} Demo', 'medal-outline' if tier == 10 else 'medal', color, max_offset + 2)
    task['completions'] = [make_completion(task_id, d(2 + i * 2)) for i in range(count)]
    tasks.append(task)

# ---------------------------------------------------------------------------
# 11. Comeback Demo -- a real closed run (10 days, day -11..-2), then EXACTLY ONE missed day
#     (day -1) before today. This one-day gap matters a great deal: the streak engine's
#     "streakStatus" only reads as 'expired' when there's exactly one trailing empty day/period
#     connecting back to a still-positive prior run -- more than one consecutive miss makes the
#     status decay all the way to 'never_started' instead (every subsequent missed day is its own
#     zero-length closed segment, burying the real run -- see CLAUDE.md's note on the demo dataset's
#     Meditate task hitting this same mechanic). comeback's own condition requires
#     streakStatus === 'expired' specifically, so this task is intentionally NOT left silent for
#     a long stretch the way a "realistic" lapsed task would be. Tapping "complete today" revives
#     it from 'expired' straight to a live 1-day streak, firing comeback.
# ---------------------------------------------------------------------------
comeback_id = next_id('achv-task')
comeback = base_task(comeback_id, 'Comeback Demo', 'restore', '#2ECC71', 13)
comeback['completions'] = consecutive_run(comeback_id, 11, 2)
tasks.append(comeback)

# ---------------------------------------------------------------------------
export = {
    'schemaVersion': 1,
    'exportId': 'achievements-test-data-' + TODAY.strftime('%Y%m%d'),
    'exportedAt': TODAY.isoformat() + 'Z',
    'appVersion': '1.0.0',
    'taskCount': len(tasks),
    'tasks': tasks,
}

out_path = __file__.rsplit('/', 1)[0] + '/streakaholic-achievements-test-data.json'
with open(out_path, 'w') as f:
    json.dump(export, f, indent=2)

total_completions = sum(len(t['completions']) for t in tasks)
print(f'Wrote {out_path}')
print(f'{len(tasks)} tasks, {total_completions} completions, anchored to {date_str(TODAY)}')
