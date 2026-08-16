#!/usr/bin/env python3
"""Generate a realistic, date-relative Streakaholic demo export.

The output is an ordinary Streakaholic task export. Import it with Settings ->
Import & Replace All Data, then accept the app's "Check for achievements?" prompt
to reconstruct the trophies earned by the generated history.

By default the dataset is anchored to the computer's local calendar date. Use
--today while testing the generator or preparing a demo for another date.
"""

from __future__ import annotations

import argparse
import calendar
import json
import random
from datetime import date, datetime, time, timedelta
from pathlib import Path


DEFAULT_OUTPUT = Path(__file__).with_name("streakaholic-demo-data.json")
SEED = 42


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--today",
        type=date.fromisoformat,
        default=date.today(),
        metavar="YYYY-MM-DD",
        help="calendar date to treat as today (default: the local date)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"output file (default: {DEFAULT_OUTPUT})",
    )
    return parser.parse_args()


def build_demo_export(today: date) -> dict:
    rng = random.Random(SEED)

    def days_ago(value: int) -> date:
        return today - timedelta(days=value)

    def iso_at(day: date, hour: int, minute: int = 0) -> str:
        # Deliberately omit a timezone suffix. The dataset describes a user's local
        # routine, so 06:15 should remain 06:15 on whichever demo device imports it.
        return datetime.combine(day, time(hour, minute)).isoformat(timespec="seconds")

    def js_weekday(day: date) -> int:
        # Python: Monday=0. JavaScript/date-fns and Streakaholic: Sunday=0.
        return (day.weekday() + 1) % 7

    def task(
        slug: str,
        name: str,
        icon: str,
        color: str,
        frequency: str,
        created_days_ago: int,
        **overrides: object,
    ) -> dict:
        item = {
            "id": f"demo-task-{slug}",
            "name": name,
            "icon": icon,
            "color": color,
            "frequency": frequency,
            "daysOfWeek": [],
            "daysPerWeek": 3,
            "daysPerMonth": 10,
            "timesPerDay": 1,
            "createdAt": iso_at(days_ago(created_days_ago), 8),
            "updatedAt": iso_at(today, 12),
            "completions": [],
        }
        item.update(overrides)
        return item

    def add_completion(
        item: dict,
        for_day: date,
        count: int = 1,
        hour: int = 9,
        minute: int = 0,
        *,
        recorded_on: date | None = None,
    ) -> None:
        if any(entry["date"] == for_day.isoformat() for entry in item["completions"]):
            raise ValueError(f"Duplicate completion for {item['name']} on {for_day}")
        recorded_day = recorded_on or for_day
        item["completions"].append(
            {
                "id": f"demo-completion-{item['id']}-{for_day.isoformat()}",
                "taskId": item["id"],
                "date": for_day.isoformat(),
                "completedAt": iso_at(recorded_day, hour, minute),
                "timesCompleted": count,
            }
        )

    tasks: list[dict] = []

    # 1. The flagship habit: old enough for One Year Strong, with a 120-day
    # historical run, an intentionally backfilled gap that creates a new 132-day
    # record, realistic misses, and a clean 35-day live streak through today.
    workout = task(
        "morning-workout",
        "Morning Workout",
        "dumbbell",
        "#FF5A5F",
        "daily",
        420,
        notifications={"level": 2, "time": "06:30", "nagIntervalMinutes": 30},
    )
    for offset in range(420, 300, -1):  # 120-day original best
        add_completion(workout, days_ago(offset), hour=6, minute=15)
    for offset in range(295, 225, -1):  # 70 days after a visible five-day break
        add_completion(workout, days_ago(offset), hour=6, minute=20)
    for offset in range(224, 163, -1):  # 61 days on the other side of one gap
        add_completion(workout, days_ago(offset), hour=6, minute=10)
    # Recorded later than the surrounding entries: the real historical action that
    # lets the achievement replay discover New Best Streak.
    add_completion(
        workout,
        days_ago(225),
        hour=12,
        recorded_on=days_ago(163),
    )
    for offset in range(150, 34, -1):
        # A guaranteed one-day lapse/revival around day -59 demonstrates Welcome
        # Back; the other misses make the year chart look human rather than synthetic.
        should_skip = offset == 35 or offset == 59 or (offset % 11 == 0) or (offset % 17 == 0)
        if should_skip:
            continue
        hour, minute = (23, 0) if 138 <= offset <= 145 else (6, 15 + rng.randint(0, 10))
        add_completion(workout, days_ago(offset), hour=hour, minute=minute)
    for offset in range(34, -1, -1):
        add_completion(workout, days_ago(offset), hour=6, minute=15 + rng.randint(0, 10))
    tasks.append(workout)

    # 2. A multi-completion habit. The first seven days align with Morning Workout
    # so the history contains exactly one clean Perfect Week; later it has a
    # 100-day record, a gap, and a 75-day live streak that is only 2/4 complete today.
    water = task(
        "drink-water",
        "Drink Water",
        "cup-water",
        "#32B5A4",
        "daily",
        420,
        timesPerDay=4,
        notifications={"level": 1, "time": "09:00"},
    )
    for offset in range(420, 413, -1):
        add_completion(water, days_ago(offset), count=4, hour=6, minute=40)
    for offset in range(180, 80, -1):  # exactly 100 full days
        hour, minute = (23, 10) if 138 <= offset <= 145 else (18, rng.randint(0, 40))
        add_completion(water, days_ago(offset), count=4, hour=hour, minute=minute)
    for offset in range(75, 0, -1):
        add_completion(water, days_ago(offset), count=4, hour=18, minute=rng.randint(0, 40))
    add_completion(water, today, count=2, hour=13)  # partial ring; does not extend the streak yet
    tasks.append(water)

    # 3. A selected-weekdays habit. Its schedule is generated so today is always a
    # due day, while the other selected days are spread across the week. Recent due
    # days are complete, making today's empty state an expiring streak rather than a
    # long-dead one. Late timestamps give the time-of-day chart a clear second peak.
    read_days = sorted({js_weekday(days_ago(offset)) for offset in (0, 2, 4, 6)})
    reading = task(
        "read-before-bed",
        "Read Before Bed",
        "book-open-page-variant",
        "#8E5CC2",
        "specific_days_of_week",
        150,
        daysOfWeek=read_days,
        notifications={"level": 1, "time": "21:30"},
    )
    for offset in range(150, 0, -1):
        day = days_ago(offset)
        if js_weekday(day) not in read_days:
            continue
        recent_due_day = offset <= 12
        realistic_hit = ((offset * 7 + 3) % 10) < 7
        if recent_due_day or realistic_hit:
            add_completion(reading, day, hour=22, minute=15 + rng.randint(0, 30))
    tasks.append(reading)

    # 4. A weekly-quota habit. Most weeks hit 3/7, but last week deliberately
    # closed at 2/3 and the current week has no entry, producing a true expired
    # streak with useful historical chains in the Streaks tab.
    meal_prep = task(
        "meal-prep",
        "Meal Prep",
        "chef-hat",
        "#2EAD62",
        "days_per_week",
        210,
        daysPerWeek=3,
    )
    current_week_start = today - timedelta(days=js_weekday(today))
    created_date = days_ago(210)
    for weeks_back in range(30, 0, -1):
        week_start = current_week_start - timedelta(weeks=weeks_back)
        day_offsets = (0, 2) if weeks_back == 1 else (1, 3, 5)
        if weeks_back in (14, 22):
            day_offsets = (1, 4)  # older weak weeks create separate streak chains
        for day_offset in day_offsets:
            day = week_start + timedelta(days=day_offset)
            if created_date <= day < current_week_start:
                add_completion(meal_prep, day, hour=11 + (day_offset % 3), minute=10)
    tasks.append(meal_prep)

    # 5. A monthly-quota habit. Four well-spaced dates per completed month make
    # the year view readable; the current month contains every scheduled date that
    # has arrived so far, so it is comfortably live at any point in the month.
    deep_clean = task(
        "deep-clean",
        "Deep Clean",
        "broom",
        "#F28C28",
        "days_per_month",
        300,
        daysPerMonth=4,
    )
    created_date = days_ago(300)
    month_cursor = date(created_date.year, created_date.month, 1)
    current_month = date(today.year, today.month, 1)
    while month_cursor <= current_month:
        last_day = calendar.monthrange(month_cursor.year, month_cursor.month)[1]
        candidate_days = [2, 8, 16, 24]
        if month_cursor.month % 3 == 0:
            candidate_days.append(27)  # occasional over-achievement varies the bars
        for day_number in candidate_days:
            if day_number > last_day:
                continue
            day = date(month_cursor.year, month_cursor.month, day_number)
            if created_date <= day <= today:
                add_completion(deep_clean, day, hour=14, minute=(day_number * 2) % 60)
        if month_cursor.month == 12:
            month_cursor = date(month_cursor.year + 1, 1, 1)
        else:
            month_cursor = date(month_cursor.year, month_cursor.month + 1, 1)
    tasks.append(deep_clean)

    # 6. The clean starting point: empty history, no badge, and a zeroed analytics
    # screen. It also keeps the active roster at the real free-tier cap of six.
    spanish = task(
        "learn-spanish",
        "Learn Spanish",
        "translate",
        "#E0A11B",
        "daily",
        0,
    )
    tasks.append(spanish)

    # Archived data is kept out of Home/Dashboard calculations but gives the Data
    # section and restore flow something credible to demonstrate.
    no_sugar = task(
        "no-sugar",
        "No Sugar",
        "close-octagon",
        "#7C8796",
        "daily",
        200,
        archived=True,
    )
    for offset in range(200, 119, -1):
        if offset % 4 != 0:
            add_completion(no_sugar, days_ago(offset), hour=12, minute=rng.randint(0, 40))
    tasks.append(no_sugar)

    for item in tasks:
        item["completions"].sort(key=lambda entry: (entry["date"], entry["completedAt"]))

    return {
        "schemaVersion": 1,
        "exportId": f"demo-data-{today.strftime('%Y%m%d')}",
        "exportedAt": iso_at(today, 12),
        "appVersion": "1.0.0",
        "taskCount": len(tasks),
        "tasks": tasks,
    }


def main() -> None:
    args = parse_args()
    export = build_demo_export(args.today)
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(export, indent=2) + "\n", encoding="utf-8")

    active_count = sum(not item.get("archived", False) for item in export["tasks"])
    completion_count = sum(len(item["completions"]) for item in export["tasks"])
    print(f"Wrote {output}")
    print(
        f"{active_count} active + {len(export['tasks']) - active_count} archived habits, "
        f"{completion_count} completion records, anchored to {args.today.isoformat()}"
    )
    print("Import with Settings -> Import & Replace All Data, then choose Check Now.")


if __name__ == "__main__":
    main()
