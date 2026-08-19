# Store Listing

Working doc for actual store-listing copy and assets — the words and images that go
directly into Play Console (and, eventually, App Store Connect). This is the single
source of truth for that copy; don't let it drift into duplicate/divergent drafts in
other docs.

- For the submission *process* (Play Console steps, IAP setup, manual QA checklist), see
  [PUBLISHING.md](PUBLISHING.md).
- For the broader campaign (testers, social clips, launch schedule, community outreach),
  see [MARKETING.md](MARKETING.md).
- For voice/terminology rules this copy must follow, and the canonical mark/color assets,
  see [BRAND.md](BRAND.md).
- For why this copy says what it says — competitor comparison, defensible claims, what to
  avoid claiming — see [COMPETITIVE_ANALYSIS.md](COMPETITIVE_ANALYSIS.md).

Everything below is the current draft, ready to paste into Play Console unless marked as
an open question.

## Positioning (the guardrail for everything below)

> **The playfully motivating, privacy-first streak tracker for Android:** daily streaks
> worth celebrating and collectible achievements that help the habit actually stick,
> without turning your life into an RPG — or your habits into data to be mined.

Message order: **streak motivation first, light gamification second, flexible tracking
third, progress views fourth, privacy last** (as trust-building proof, not the lead
story). See COMPETITIVE_ANALYSIS.md's "Positioning map" for the full reasoning.

Claims safe to use, and the two claims to actively avoid, live in
[COMPETITIVE_ANALYSIS.md's "Claims that are safe to use in marketing"](COMPETITIVE_ANALYSIS.md#claims-that-are-safe-to-use-in-marketing) —
check new copy against that list before publishing, since some intuitive claims (e.g.
"the only private habit tracker") are false given Loop/HabitNow/Habito overlap.

## App title

Currently just **Streakaholic** (`app.json`'s `expo.name`).

**Open question:** MARKETING.md floated **"Streakaholic: Habit Tracker"** for clearer
search intent — Play Store titles are searchable, and "Streakaholic" alone doesn't
contain the category word a searcher would actually type. Play allows up to 30
characters (`Streakaholic: Habit Tracker` is 28). Not decided — changing this touches
`app.json` and the launcher label, not just store copy, so treat it as a real decision,
not a copy tweak.

## Short description (80 char max)

> Build habit streaks worth celebrating. Private by design, no account needed.

76 characters. Leads with the tagline (motivation), closes with privacy as
trust-building proof — matches the message-order rule above.

## Full description (4000 char max)

> Build streaks worth celebrating. Streakaholic turns everyday habits into motivating
> streaks, satisfying celebrations, meaningful milestones, and a Trophy Case that fills
> as you make progress—all while your data stays on your device and under your control.
>
> **Why Streakaholic**
> - Flexible schedules — track habits daily, on chosen days, or a set number of days per
>   week or month
> - Multiple completions per day — for habits you do more than once, like water intake or
>   exercise sets
> - Streak tracking that's actually fair — miss a non-due day and your streak doesn't
>   break; catch up early and it counts right away; skip a day on purpose (vacation, sick
>   day) without losing your streak
> - A simplified, playful home screen — habit cards give you at-a-glance insight into how
>   you're doing and which habits need attention today, with satisfying animations
>   (press-and-hold to complete, a streak ring that fills in, a flame celebration on a new
>   best) and a flip to reveal full calendar history or stats
> - Collectible achievements and a Trophy Case — milestones, perfect weeks, comebacks, and
>   more, without a complicated game layered on top
> - A Dashboard with aggregate stats and charts across every habit — completion trends,
>   best days, and more
> - Customize every habit with its own icon and color
> - Light and dark mode, matching your system theme
>
> **Your data stays yours**
> Streakaholic doesn't require an account, doesn't use the cloud, and doesn't track you.
> Every habit, streak, and completion is stored only on your device. Export your data
> anytime as a backup, and import it back whenever you need to.
>
> Whether you're building a workout habit, a reading habit, or just trying to drink more
> water, Streakaholic keeps you honest without keeping your data.

~1,825 characters. Opening paragraph is the punchier, feature-forward draft from an
earlier MARKETING.md iteration (chosen 2026-08-19 over a more generic privacy-first
opening) — it folds the privacy promise into the hook itself rather than saving it for
its own closing section, and the "Your data stays yours" section below still earns its
place by elaborating the specifics (no account, no cloud, export/import) rather than
just repeating the opening's tease.

## Category & content rating

- **Category:** Health & Fitness, or Productivity/Lifestyle — not yet decided which Play
  Console category fits best; both are defensible for a habit tracker. Pick one and stay
  consistent (changing category later resets some store-listing history).
- **Content rating:** expect Everyone / PEGI 3 — no user-generated content, violence,
  gambling, or sexual content. See PUBLISHING.md's "Data Safety & content rating cheat
  sheet" for the full walkthrough of that questionnaire.

## Screenshots

Play requires at least 2; this shot list is 6, sequenced as a story (per MARKETING.md's
Phase 4 guidance: "make the first three screenshot captions tell a story"), each with a
proposed on-image caption. None of this needs staged/fake data — the demo dataset
(`demo-data/`) or your own real habits both work; see `demo-data/DEMO_WALKTHROUGH.md` for
a shot-by-shot recording script that hits most of these automatically.

| # | Shot | Caption |
|---|---|---|
| 1 | **Home screen** — a handful of habits with a mix of states (some complete, some not, at least one multi-completion habit showing its split ring). First thing anyone sees. | Turn daily progress into motivating streaks |
| 2 | **A habit mid-celebration** — the flame particle burst on a new best streak, or a full-screen achievement unlock. Timing-dependent to capture, but the most "alive" moment the app has. | Celebrate milestones and collect achievements |
| 3 | **Dashboard → Calendar tab**, Bars or Streamgraph mode — the stacked-bar/streamgraph timeline is one of the more visually distinct things in the app. | See your momentum across calendars and charts |
| 4 | **Habit detail → Streaks tab** — the hero "Best streak" callout plus history list. | Every streak's full story, not just today's number |
| 5 | **Add/Edit habit** — schedule type, icon, and color customization in one frame. | Daily, weekly, monthly — track it your way |
| 6 | **Settings or About**, or an export moment — communicates the privacy promise visually, not just in copy. | No account. No cloud. Your data stays yours. |

Captions are a starting point for whatever caption/frame treatment gets designed — not
required to be baked into the screenshot pixels themselves if Play Console's own listing
supports separate caption text, but written as short, standalone lines either way.

## Feature graphic (1024×500)

Built at `design/store-assets/feature-graphic.png` — mark + name + tagline on the brand
navy (`#01073B`), tagline in the flame's mint-green (`#65FC7C`), using the current
canonical "logo4" mark (see BRAND.md). Treat as a solid first pass — swapping in a real
in-app screenshot once screenshots exist would likely be more compelling than a logo
card alone.

## Hi-res icon (512×512)

`design/AppIcons/playstore.png` — regenerated from the canonical mark, correctly sized.
Nothing outstanding here.

## Privacy Policy URL

Live: https://www.metamodernmonkey.com/privacy/streakaholic — paste directly into Play
Console's store listing. Source of truth is that hosted page, not any copy in this repo;
see PUBLISHING.md for how it's kept in sync with the in-app About screen.

## Future: App Store (not started)

Play Store is the actual target (see CLAUDE.md) — this section exists so a future iOS
push doesn't start from zero. Differences worth knowing when that day comes:
- App Store splits **Name** (30 char) + **Subtitle** (30 char) rather than a single short
  description — the tagline and category line above map naturally to those two fields.
- A dedicated **Keywords** field (100 char, comma-separated, not shown to users) exists on
  iOS with no Play Store equivalent — not drafted yet.
- `design/AppIcons/appstore.png` (1024×1024, opaque) already exists from the same
  regeneration pass as the Play icon, so that asset isn't blocking.
- App Store requires a fully opaque icon (no alpha) — already satisfied, see BRAND.md.
