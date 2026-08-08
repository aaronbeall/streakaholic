#!/usr/bin/env python3
"""
Generates a realistic demo dataset for Streakaholic -- a handful of tasks spanning every
frequency type, streak state, and badge the app can show, with backfilled completion
history (not just today) so streaks/charts/dashboard all look real on first import.

Import via Settings -> Import Data (merges) or Import & Replace All Data (clean slate) in
the app, pointing at the sibling streakaholic-demo-data.json this script produces.

Re-run this script any time to regenerate with fresh dates relative to "today" -- the
story (which days are hit/missed) is fixed, but it's always anchored to the current date
so a streak that's supposed to be "live today" actually is, whenever you import it.
"""

import json
import random
from datetime import datetime, timedelta

random.seed(42)  # reproducible output -- same story every run, just re-anchored to today

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


def make_completion(task_id: str, dt: datetime, times_completed: int, hour: int, minute: int = 0) -> dict:
    return {
        'id': next_id('demo-comp'),
        'taskId': task_id,
        'date': date_str(dt),
        'completedAt': iso_at(dt, hour, minute),
        'timesCompleted': times_completed,
    }


def jitter_hour(base_hour: int, spread: int = 1) -> int:
    return max(0, min(23, base_hour + random.randint(-spread, spread)))


def base_task(task_id, name, icon, color, frequency, created_days_ago, **overrides):
    task = {
        'id': task_id,
        'name': name,
        'icon': icon,
        'color': color,
        'frequency': frequency,
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


tasks = []

# ---------------------------------------------------------------------------
# 1. Morning Workout -- daily, 1x/day. A long-since-broken best streak (~50 days),
#    a 5-day gap ("life happened"), then a genuinely live current streak (~34 days,
#    shorter than the best) -- demonstrates the fire badge WITHOUT a trophy, since
#    current != best.
# ---------------------------------------------------------------------------
workout_id = next_id('demo-task')
workout = base_task(workout_id, 'Morning Workout', 'dumbbell', '#FF6B6B', 'daily', 89)
for i in range(89, 39, -1):  # day -89 .. -40, unbroken run (best streak)
    workout['completions'].append(make_completion(workout_id, d(i), 1, jitter_hour(7)))
# days -39 .. -35: missed (the gap)
for i in range(34, -1, -1):  # day -34 .. today, unbroken run (current streak)
    workout['completions'].append(make_completion(workout_id, d(i), 1, jitter_hour(7)))
tasks.append(workout)

# ---------------------------------------------------------------------------
# 2. Drink Water -- daily, 4x/day. Consistently full for ~89 days (big streak), but
#    only 2 of 4 logged *today* -- demonstrates the segmented ring's partial-solid
#    state and the "expiring" badge on an otherwise strong streak.
# ---------------------------------------------------------------------------
water_id = next_id('demo-task')
water = base_task(water_id, 'Drink Water', 'cup-water', '#4ECDC4', 'daily', 89, timesPerDay=4)
for i in range(89, 0, -1):
    water['completions'].append(make_completion(water_id, d(i), 4, jitter_hour(20, 2)))
water['completions'].append(make_completion(water_id, d(0), 2, 13))  # today: 2 of 4 so far
tasks.append(water)

# ---------------------------------------------------------------------------
# 3. Read Before Bed -- specific days (Sun/Mon/Wed/Fri), 1x/day. Spotty/realistic
#    (~60% hit rate on due days), today due and not yet done -- a modest, at-risk
#    streak rather than a showcase one.
# ---------------------------------------------------------------------------
read_id = next_id('demo-task')
read = base_task(read_id, 'Read Before Bed', 'book-open-page-variant', '#9B59B6',
                  'specific_days_of_week', 89, daysOfWeek=[0, 1, 3, 5])
for i in range(89, 0, -1):  # leave only today itself unlogged; yesterday is a fair roll too
    day = d(i)
    if day.weekday() in (6, 0, 2, 4):  # Python Mon=0..Sun=6; Sun=6,Mon=0,Wed=2,Fri=4
        if random.random() < 0.6:
            read['completions'].append(make_completion(read_id, day, 1, jitter_hour(22, 1)))
tasks.append(read)

# ---------------------------------------------------------------------------
# 4. Meal Prep -- 3x/week. Consistent most weeks, one weak week mid-history, this
#    week only 2 of 3 so far -- "expiring" on a period-based streak.
# ---------------------------------------------------------------------------
meal_id = next_id('demo-task')
meal = base_task(meal_id, 'Meal Prep', 'chef-hat', '#2ECC71', 'days_per_week', 89, daysPerWeek=3)
# Stop the regular weekly loop well clear of the current week (>=13 days back) so the two
# manual "this week" completions below are the *only* ones in the app's own current-week
# window, whatever exact day that boundary falls on.
for week_start in range(89, 13, -7):
    is_weak_week = 40 <= week_start <= 46  # one deliberately-short week
    hits = 2 if is_weak_week else random.choice([3, 3, 4])
    offsets = random.sample(range(0, 7), min(hits, 7))
    for off in offsets:
        day_i = week_start - off
        if day_i > 0:
            meal['completions'].append(make_completion(meal_id, d(day_i), 1, jitter_hour(11, 2)))
# this week: exactly 2 done so far, deliberately short of the 3x quota
meal['completions'].append(make_completion(meal_id, d(3), 1, 11))
meal['completions'].append(make_completion(meal_id, d(1), 1, 12))
tasks.append(meal)

# ---------------------------------------------------------------------------
# 5. Deep Clean -- 4x/month. Hits quota most months, comfortably ahead this month
#    ("up_to_date", not urgent) -- a period-based streak in the calm state.
# ---------------------------------------------------------------------------
clean_id = next_id('demo-task')
clean = base_task(clean_id, 'Deep Clean', 'broom', '#E67E22', 'days_per_month', 89, daysPerMonth=4)
for month_start in range(89, 5, -30):
    is_weak_month = 55 <= month_start <= 85
    hits = 3 if is_weak_month else random.choice([4, 4, 5])
    offsets = sorted(random.sample(range(0, 29), min(hits, 29)), reverse=True)
    for off in offsets:
        day_i = month_start - off
        if day_i > 3:
            clean['completions'].append(make_completion(clean_id, d(day_i), 1, jitter_hour(14, 2)))
# this month so far: comfortably ahead of quota
clean['completions'].append(make_completion(clean_id, d(3), 1, 15))
clean['completions'].append(make_completion(clean_id, d(1), 1, 13))
tasks.append(clean)

# ---------------------------------------------------------------------------
# 6. Guitar Practice -- daily, 1x/day, brand new (created 3 days ago). Every day
#    since creation is completed, including today -- current == best, trophy shows.
# ---------------------------------------------------------------------------
guitar_id = next_id('demo-task')
guitar = base_task(guitar_id, 'Guitar Practice', 'guitar-acoustic', '#E74C3C', 'daily', 3)
for i in range(3, -1, -1):
    guitar['completions'].append(make_completion(guitar_id, d(i), 1, jitter_hour(19)))
tasks.append(guitar)

# ---------------------------------------------------------------------------
# 7. Meditate -- 5x/week (not daily): a daily-frequency task that goes quiet for
#    a few weeks collapses all the way to "never started" (each silent day closes
#    its own trivial zero-length segment, burying the real peak) rather than
#    staying "dormant" -- a period-based streak is much more forgiving of a real
#    gap, correctly keeping the prior weeks' run as lastStreak. Hits quota well for
#    ~10 weeks, then totally silent for the last 3 -- currentStreak 0, lastStreak >
#    0, the dormant gray "sleep" badge.
# ---------------------------------------------------------------------------
meditate_id = next_id('demo-task')
meditate = base_task(meditate_id, 'Meditate', 'meditation', '#5B6EE1', 'days_per_week', 89, daysPerWeek=5)
for week_start in range(89, 13, -7):
    offsets = random.sample(range(0, 7), 5)
    for off in offsets:
        day_i = week_start - off
        if day_i > 13:
            meditate['completions'].append(make_completion(meditate_id, d(day_i), 1, jitter_hour(6)))
# days -12..0 (the last ~2 weeks): nothing at all -- lapsed
tasks.append(meditate)

# ---------------------------------------------------------------------------
# 8. No Sugar -- archived. Some real history from before it was archived, so the
#    Archived Tasks screen / restore flow has something to show off.
# ---------------------------------------------------------------------------
sugar_id = next_id('demo-task')
sugar = base_task(sugar_id, 'No Sugar', 'close-octagon', '#95A5A6', 'daily', 89, archived=True)
for i in range(89, 55, -1):
    if random.random() < 0.7:
        sugar['completions'].append(make_completion(sugar_id, d(i), 1, jitter_hour(12, 3)))
tasks.append(sugar)

# ---------------------------------------------------------------------------
# 9. Learn Spanish -- daily, 1x/day, created today, zero completions -- the fresh
#    "never started" state, empty ring, no badge at all.
# ---------------------------------------------------------------------------
spanish_id = next_id('demo-task')
spanish = base_task(spanish_id, 'Learn Spanish', 'translate', '#F39C12', 'daily', 0)
tasks.append(spanish)

# ---------------------------------------------------------------------------
export = {
    'schemaVersion': 1,
    'exportId': 'demo-data-' + TODAY.strftime('%Y%m%d'),
    'exportedAt': TODAY.isoformat() + 'Z',
    'appVersion': '1.0.0',
    'taskCount': len(tasks),
    'tasks': tasks,
}

out_path = __file__.rsplit('/', 1)[0] + '/streakaholic-demo-data.json'
with open(out_path, 'w') as f:
    json.dump(export, f, indent=2)

total_completions = sum(len(t['completions']) for t in tasks)
print(f'Wrote {out_path}')
print(f'{len(tasks)} tasks, {total_completions} completions, anchored to {date_str(TODAY)}')
