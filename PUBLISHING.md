# Publishing

How to ship Streakaholic to the Google Play Store, plus guides for two features that
matter for launch: **Rate this app** and **Tip jar**. For setup/dev workflow see
[DEVELOPMENT.md](DEVELOPMENT.md); for architecture see [CLAUDE.md](CLAUDE.md).

## Readiness audit (as of 2026-08-08, updated same day)

Ran `npx expo-doctor` and reviewed `app.json`/`eas.json`/`assets/` against Play Store
requirements. Of the original 8 gaps, 4 are fully closed and 4 more are prepped (assets
built, copy drafted, answers worked out) with only the parts that genuinely require your
own Google/Play Console login left undone — see below for exactly what those are.

### Already in good shape
- EAS project linked (`app.json` → `extra.eas.projectId`), `eas.json` has `development`/
  `preview`/`production` build profiles and a `submit.production` profile scaffolded,
  including an Android `serviceAccountKeyPath` (see "Prepped" #7 below for what still
  has to happen before that path resolves to a real file).
- Unique Android package name set: `com.metamodernmonkey.Streakaholic`.
- `appVersionSource: "remote"` + `autoIncrement: true` on the production build profile —
  EAS manages the Android `versionCode` for you; no manual bumping per release.
- `newArchEnabled: true` — current architecture, keeps pace with Expo's own requirements.
- App icon (`icon.png`, 1024×1024), splash icon (`splash-icon.png`, 1024×1024), and now
  the adaptive icon foreground (`adaptive-icon.png`, upscaled 500×500 → 1024×1024 — see
  "Fixed" #1) are all correctly sized.
- `npx expo-doctor`: **17/17 checks pass.**
- `@types/jest` pinned to the expected `29.5.14`; the five dependencies that were never
  actually imported anywhere in `app/` (`react-native-circular-progress`,
  `react-native-circular-progress-indicator`, `react-native-confetti-cannon`,
  `react-native-particle-system`, `react-native-progress`) have been removed.
- **Privacy Policy is hosted and live**: https://www.metamodernmonkey.com/privacy/streakaholic
  — a dedicated page (not a shared/generic URL — each Metamodern Monkey app gets its own
  under `/privacy/<slug>`, matching the `id` slugs already used in that site's
  `data/projects.json`), built in the `metamodernmonkey/website` repo to match its
  existing Next.js/Tailwind "synthwave" design system, mirroring the About screen's
  Privacy Policy/Terms of Service text word-for-word. Committed and pushed to that repo's
  `main` (commit `99af5bf`), which deploys to Netlify automatically — confirmed live.

### Fixed (fully done, nothing left to do)
1. **Adaptive icon foreground upscaled** 500×500 → 1024×1024 via a high-quality Lanczos
   resample of the *existing, already-approved* artwork (not regenerated — same image,
   just correctly sized source resolution). Worth a quick on-device look once you build,
   since any upscale is still an upscale, but this removes the resolution gap without
   touching the actual design.
2. **`@types/jest` version mismatch** — pinned to `29.5.14`.
3. **Unused dependencies bloating the bundle** — all five removed via `npm uninstall`.
4. **Hosted Privacy Policy URL** — live at
   https://www.metamodernmonkey.com/privacy/streakaholic (see above). Ready to paste into
   Play Console's store listing. The `privacy-policy.html` scaffold this repo briefly had
   at its root has been removed now that the real hosted version exists — that website
   page is the single source of truth going forward, not this repo.

### Prepped — ready for you, but finishing needs your Play Console/Google login
5. **Store listing assets**, mostly closed:
   - **512×512 hi-res icon**: turns out this already existed and just hadn't been found in
     the earlier audit — `logo/AppIcons/playstore.png`, correctly sized, matches the
     current icon design. Nothing to do here.
   - **1024×500 feature graphic**: built at `logo/store-assets/feature-graphic.png` — a
     clean banner (icon + name + tagline on the brand purple, `#463D5E`, sampled directly
     from the approved logo) using only the existing, already-approved icon art — no new
     illustration. Treat this as a solid first pass, not the final word — swapping in real
     in-app screenshots once you have them would likely make it more compelling than a
     logo card alone.
   - **Short/full description**: drafted below, ready to paste into Play Console.
   - **Screenshots (≥2 required)**: still need to be captured on an actual device — see
     the shot list below. This is the one asset item that's still genuinely on you, since
     it means running the real app.
6. **Data Safety form & content rating questionnaire**: the cheat sheet below has the
   actual answers worked out from the app's real behavior, but clicking through Play
   Console's forms themselves needs your login.
7. **`submit.production`'s `serviceAccountKeyPath` points to a file that doesn't exist
   yet** (`google-play-service-account.json`, gitignored so a real key never accidentally
   gets committed). `eas submit --platform android` will fail with a clear "file not
   found" until you actually generate that key — see
   [Setting up automated submission](#optional-set-up-automated-submission) below. Also
   still true regardless: **the very first release must go through the Play Console web
   UI manually** — `eas submit` can push builds to an app that already exists in Play
   Console, but can't create the store listing itself.
8. **Closed testing requirement** — new Play Console developer accounts currently must
   run a closed test (some number of testers over some number of days) before being
   allowed to publish to production. Google's exact policy here has shifted over time —
   check the current requirement in Play Console when you get to this step. Nothing to
   prep for this one, just a heads-up.

**On the app icon itself**: the current `icon.png`/`adaptive-icon.png` art (upscaled in
place, not redesigned) is still the original design. A separate attempt this session to
explore alternative color treatments for the logo mark (circle/checkmark/flame) via
hand-authored SVG didn't meet the bar and was abandoned — that remains open, and needs
either real source art from whatever tool made the original, a proper design tool/human
designer, or an actual image-generation model this assistant doesn't have access to.

### Store listing copy (ready to paste into Play Console)

**Short description** (80 char max, this is 72):
> A playful habit & streak tracker — private by design, no account needed.

**Full description** (4000 char max, this is ~1,400):
> Streakaholic is a playful habit and streak tracker that helps you build consistency
> without the guilt trips.
>
> **Why Streakaholic**
> - Flexible schedules — track habits daily, on specific days of the week, X days per
>   week, or X days per month
> - Multiple completions per day — for habits you do more than once, like water intake or
>   exercise sets
> - Streak tracking that's actually fair — miss a non-due day and your streak doesn't
>   break; catch up early and it counts right away
> - Satisfying animations — a press-and-hold to complete, a streak ring that fills in, and
>   a flame celebration when you hit a new best streak
> - Flip any task card to see its full calendar history or detailed stats, right from the
>   home screen
> - A Dashboard with aggregate stats and charts across every habit — completion trends,
>   best days, and more
> - Filter your tasks by streak status to see what needs attention today
> - Customize every task with its own icon and color
> - Light and dark mode, matching your system theme
>
> **Your data stays yours**
> Streakaholic doesn't require an account, doesn't use the cloud, and doesn't track you.
> Every task, streak, and completion is stored only on your device. Export your data
> anytime as a backup, and import it back whenever you need to.
>
> Whether you're building a workout habit, a reading habit, or just trying to drink more
> water, Streakaholic keeps you honest without keeping your data.

### Screenshot shot list (for you to capture on-device)

Play requires at least 2 phone screenshots; these 5–6 cover the app's actual range
without needing any staged/fake data — just use your own real tasks:

1. **Home screen**, a handful of tasks with a mix of states (some complete, some not, at
   least one multi-rep task showing its split ring) — this is the first thing anyone sees.
2. **Dashboard → Stats tab** — the aggregate charts, ideally with a few weeks of real data
   behind them so the charts aren't empty.
3. **Dashboard → Calendar tab**, Bars mode — the stacked-bar timeline is one of the more
   visually distinct things in the app.
4. **Task detail → Streaks tab** — the hero "Best Streak" callout plus history list.
5. **A task card mid-celebration** (the flame particle burst on a new best streak) —
   timing-dependent to capture, but the most "alive" moment the app has.
6. **Settings or Add Task**, showing the icon/color customization — communicates
   personalization without needing words.

### Data Safety & content rating cheat sheet

**Data Safety** (Play Console → App content → Data safety): since Streakaholic collects,
stores, and transmits nothing off-device, this is the simplest version of this form —
answer **"No"** to "Does your app collect or share any of the required user data types?"
and you're done with that section. (If analytics is ever added later, this answer changes
and both Privacy Policy copies — in-app and the hosted page — need updating to match; a
mismatch between disclosed and actual behavior is a real policy risk, not just a copy
nitpick.)

**Content rating questionnaire** (Play Console → App content → Content ratings): a habit
tracker with no user-generated content, no violence, no gambling references, and no
sexual content — expect this to land on the lowest rating tier (Everyone / PEGI 3).
Google's IARC questionnaire is dynamic, so just answer each question honestly; there's
nothing here to prepare for beyond knowing you're not hiding anything mature.

---

## 0. Test on a real device before publishing

**Don't rely on Expo Go for this pass.** Two concrete reasons specific to this app:
- Expo Go is one pre-built shell app shared by everyone — it can't compile this project's
  own `AndroidManifest.xml`, so native-level `app.json` config doesn't apply inside it.
  `android.edgeToEdgeEnabled: true` is exactly this kind of setting, and a fair amount of
  the safe-area/status-bar work documented in `CLAUDE.md` depends on it actually taking
  effect — Expo Go can't confirm any of that.
- IAP (the planned tip jar, section 3 below) already requires a custom dev client and
  can't run in Expo Go at all — `expo-dev-client` is already installed for this reason, so
  there's no cost to switching to this workflow now rather than later.

Build a real client instead:
```bash
eas build --platform android --profile development   # keeps Metro/fast-refresh, for day-to-day iteration
eas build --platform android --profile preview        # standalone APK/AAB, no dev menu -- closest to what ships
```
Install the `development`-profile build once, then keep using `npx expo start --dev-client`
for the normal fast-refresh loop. Do at least one full pass through the checklist below on
a `preview`-profile build specifically, since that's the artifact structure (no Metro, no
dev menu) that actually matches what Play Store users will run.

### Manual QA checklist

Everything below either can't be verified via `tsc`/`eslint`/`jest` (no component/render
tests in this repo — see `CLAUDE.md`'s Testing section) or was explicitly noted as
"verified via tooling only, not yet confirmed on-device" at the point it was built. Work
through this once on a `preview` build before the first Play Console upload, and again
after any change that touches these areas.

**Confirmations & Undo** (`Alert.alert` is a no-op on web — this is the first time these
paths run for real)
- [ ] Edit Task → Archive Task: confirm modal appears, Cancel and Archive both behave,
      Undo toast restores the task.
- [ ] Edit Task → Delete Task: same, and Undo restores the task *with* its completion
      history intact.

**Import / Export**
- [ ] Settings → Export Data → share sheet appears, produces a valid file.
- [ ] Settings → Import Data (merge) → toast reports the right count, Undo restores the
      prior state.
- [ ] Re-import the same file → toast includes "already imported before."
- [ ] Settings → Import & Replace All Data → confirms replace behavior + Undo.
- [ ] If your export file lives in a cloud provider (Dropbox, Drive, etc.), confirm the
      file picker actually lets you select it (a real Dropbox-specific MIME-type bug was
      fixed here — worth reconfirming after any picker-related change).

**Gestures & haptics**
- [ ] Toast swipe-to-dismiss (either direction) actually dismisses it.
- [ ] Haptic feedback fires at each documented point (see `CLAUDE.md`'s Haptics section):
      long-press acknowledgment, completion success, destructive-action confirm, calendar
      day-toggle, Undo tap.
- [ ] Press-and-hold to complete a task: ring fill, icon pop/overshoot/settle, and the
      streak badge's celebration pop all read as intended — this animation went through
      many rounds of on-device-only tuning (spring damping/stiffness, hold duration).
- [ ] A new best streak's particle celebration (swirl, staggered spawn, glow, color shift)
      renders smoothly with no dropped frames, and actually replays on a second streak in
      the same session (a real recurrence bug here was fixed by a `celebrationKey`).

**Layout & theming**
- [ ] Every screen's content clears the status bar and gesture nav bar (edge-to-edge) —
      Home, Dashboard, Settings, Archived Tasks, task-detail, About.
- [ ] Dark mode: no white flash when navigating (Dashboard ↔ Home, task-detail ↔ Home).
- [ ] Toggling light/dark in Settings updates every screen immediately.
- [ ] Home's task grid: an incomplete last row of cards is centered, not stretched to fill
      the row.
- [ ] The "Completions Over Time" chart toggle (Dashboard Stats and per-task Stats) renders
      as a clean, fully-rounded pill in both states — a real Android-only border-radius
      rendering bug was found and fixed here, worth a specific look.

**Onboarding**
- [ ] All 5 hints appear/dismiss correctly on a fresh install (or after Settings → Replay
      Onboarding Hints): hold-to-complete, tap-to-cycle, hold-to-expand, Dashboard's
      task-filter hint, task-detail Calendar's tap-a-day hint.
- [ ] Each hint's pointer/ring targets the correct element with no visual offset (this
      class of bug — status-bar-relative measurement being wrong — was real and fixed).

**Free-tier task cap**
- [ ] Creating a 7th active task is blocked with a clear inline message + disabled Save;
      archiving one re-enables Save.
- [ ] Restoring an archived task while already at 6 active tasks is blocked with a toast.
- [ ] Tapping the FAB while at the cap shows a toast instead of opening a dead-end form.

**Cold start**
- [ ] Force-quit and relaunch — a brief loading screen, then real data appears with no
      flash of empty/default state first.

**Store listing screenshots** (see "Prepped" #5 above) — capture the shot list on this
same device/build while you're already in a realistic, populated state.

---

## 1. Publishing to Google Play

1. **Create a Google Play Console developer account** ($25 one-time fee) if you don't
   have one: https://play.google.com/console/signup
2. **Prepare store listing assets** (see "Prepped" #5 above): hi-res icon, feature
   graphic, screenshots, short/full description.
3. ~~Host the Privacy Policy at a real URL~~ — done:
   https://www.metamodernmonkey.com/privacy/streakaholic. Use that URL directly in Play
   Console's store listing.
4. **Create the app in Play Console**: app name, default language, package name
   `com.metamodernmonkey.Streakaholic`, free (or paid — note: switching a free app to
   paid later is far more restricted than the reverse, so decide this deliberately), and
   declare it as an app (not a game).
5. **Fill out Data Safety and content rating questionnaires** ("Prepped" #6 above).
6. **Build the production AAB**:
   ```bash
   eas build --platform android --profile production
   ```
7. **First upload — do this manually.** Download the `.aab` EAS produces and upload it
   yourself via Play Console → your app → Testing → (Internal or Closed testing) →
   Create new release. This is the one release `eas submit` can't do for you, since the
   app doesn't exist in Play Console until this step.
8. **(Optional) Set up automated submission** for every release after the first — see
   below.
9. **Progress through testing tracks** (Internal → Closed → Production) per whatever
   Play's current policy requires for a new developer account ("Prepped" #8 above).

### (Optional) Set up automated submission

So future releases are just `eas submit --platform android` instead of a manual upload:

1. In Play Console: **Setup → API access** → link (or create) a Google Cloud project.
2. In that Google Cloud project, create a **service account**, grant it access in Play
   Console's API access page (Admin or a scoped "Release manager" role is enough).
3. Create and download a JSON key for that service account.
4. Add the path to `eas.json`:
   ```json
   "submit": {
     "production": {
       "android": {
         "serviceAccountKeyPath": "./path/to/service-account-key.json"
       }
     }
   }
   ```
   Keep that key file **out of git** (add it to `.gitignore`) — it's a real credential.
5. From then on: `eas build --platform android --profile production` then
   `eas submit --platform android --profile production`.

### Using the app yourself, day-to-day

Add yourself as an **internal tester** in Play Console (Setup → your app → Testing →
Internal testing → Testers, add your own Google account's email). That track gives you an
opt-in link — open it once on your phone and accept, and from then on the app installs and
updates through the real Play Store app on your device, same as any published app gets,
including auto-updates whenever you push a new internal-track release. This works before
the app is ever public, and keeps working identically once it is — no separate personal
build to maintain.

The alternative — sideloading a `preview`-profile build directly (skip Play Console
entirely) — still works if you want it, but you lose Play's auto-update: every new version
means re-running `eas build` and manually reinstalling. Reach for that only for quick
pre-release iteration before you've bothered setting up Internal testing at all; once
Internal testing exists, there's no reason to keep doing it that way.

---

## 2. Add "Rate this app"

Two complementary pieces — a contextual native prompt, and a manual settings row.

### a. Contextual in-app review prompt

1. Install the package:
   ```bash
   npx expo install expo-store-review
   ```
2. Trigger it at a meaningful moment — e.g. in `HomeScreen`, when a task's streak hits a
   new best (you already compute `currentStreak === bestStreak` for the trophy badge
   elsewhere, so the signal already exists):
   ```ts
   import * as StoreReview from 'expo-store-review';

   const maybePromptReview = async () => {
     if (await StoreReview.hasAction()) {
       await StoreReview.requestReview();
     }
   };
   ```
3. **Don't** call this on every completion — Android's in-app review API throttles how
   often it'll actually show a prompt regardless of how often you call it, but you should
   still be deliberate about *when* you ask (a happy moment, not mid-task-list-scroll).
   Consider a simple cooldown in `settingsStore` (e.g. a `lastReviewPromptAt` timestamp)
   so you're not calling it every single time the trigger condition is met.
4. Note the API's real limitation: you can't detect whether the prompt was shown, what
   rating was given, or force it to appear — that's by design (Google doesn't want apps
   gaming their own review prompts).

### b. Manual "Rate this app" row in Settings

Gives users an explicit way to do it anytime, and doesn't hit the native API's throttling
since it deep-links straight to the Play Store listing:

```ts
import { Linking } from 'react-native';

const PLAY_STORE_URL = 'market://details?id=com.metamodernmonkey.Streakaholic';
const PLAY_STORE_WEB_FALLBACK = 'https://play.google.com/store/apps/details?id=com.metamodernmonkey.Streakaholic';

const handleRateApp = async () => {
  const canOpen = await Linking.canOpenURL(PLAY_STORE_URL);
  await Linking.openURL(canOpen ? PLAY_STORE_URL : PLAY_STORE_WEB_FALLBACK);
};
```

Add this as a row in `SettingsScreen`'s Help section (alongside "Replay Onboarding
Hints"), following the existing row/card pattern in that file.

---

## 3. Add a tip jar

This is the biggest lift of the three — it's real in-app purchases, which means native
code. There's a real decision to make before writing anything:

The purchase layer chosen here is also intended to support the later Pro unlock and
Commitment Mode's consumable Streak Saves. The latter has additional transaction
recovery, integrity, and trust requirements beyond a low-stakes tip; do not generalize
the tip jar's client-only simplifications to it. See
[COMMITMENT_MODE.md](COMMITMENT_MODE.md).

### Library choice

| | `react-native-iap` | RevenueCat |
|---|---|---|
| What it is | Lower-level wrapper over Play Billing / StoreKit | Purchase-management service + SDK on top of the same native billing APIs |
| Setup effort | More manual purchase-lifecycle code (listening for purchase updates, consuming purchases yourself) | Handles purchase state/consumption for you via their SDK |
| External dependency | None beyond the library | A third-party account/dashboard (free tier available) |
| Good fit when | You want no third-party service in the loop, and don't mind writing more of the purchase flow yourself | You want less purchase-lifecycle code to get right, and don't mind an external dependency |

For a simple, non-subscription tip jar, either is genuinely fine — this is a judgment
call, not a correctness question. Pick one before starting the client work below.

**Either way, this needs a custom dev client / EAS Build** — IAP requires native modules
and can't run in plain Expo Go. You already have `expo-dev-client` installed, so you're
set up for this already.

### Steps

1. **Play Console**: Monetize → Products → In-app products → create a few **consumable**
   products (e.g. `tip_small`, `tip_medium`, `tip_large`). Consumable, not managed — a
   tip should be purchasable more than once, unlike a one-time unlock.
2. **Install and configure** your chosen library:
   - `react-native-iap`: `npx expo install react-native-iap`, then follow its Android
     setup (mostly automatic via its config plugin under managed Expo).
   - RevenueCat: `npx expo install react-native-purchases`, create a RevenueCat account/
     project, link your Play Console products to RevenueCat "offerings," add their config
     plugin.
3. **Client-side flow**:
   - Fetch available products/offerings on mount of a new "Tip Jar" screen (mirror the
     existing screen pattern — header + `useSafeAreaInsets` + `ThemeColors`/`createStyles`,
     same as `SettingsScreen`/`AboutScreen`).
   - Render each tier as a card/row with its localized price (never hardcode a price —
     always show what the store API returns, since Play localizes pricing per region).
   - On purchase: initiate via the library, then on success show a toast via the existing
     `useToast()` (e.g. "Thanks for the tip! ❤️") — no need for a custom success modal,
     this app's whole feedback pattern is already toast-based.
4. **Consume every purchase.** This is the easy-to-miss step: Google auto-refunds a
   purchase that isn't acknowledged/consumed within **3 days**. `react-native-iap` exposes
   `finishTransaction(purchase, true)` for this; RevenueCat handles it for you
   automatically for consumables. If you go with `react-native-iap`, make sure this runs
   even if your app is killed mid-purchase (listen for pending/unfinished transactions on
   app start, not just right after a purchase call).
5. **No backend required** for something this low-stakes — you don't need server-side
   receipt validation for a $1–5 tip; both libraries' client-side purchase confirmation is
   sufficient here. (This is a deliberate simplification appropriate for a tip jar
   specifically — don't extend this reasoning to anything gating real paid features later.)
6. **Testing**: add yourself as a **license tester** in Play Console (Setup → License
   testing) so test purchases in Internal/Closed testing tracks don't charge real money.
   Test purchases only work on a build installed via a testing track, not a local debug
   build.
7. **Settings entry point**: add a "Tip Jar" row in `SettingsScreen`, in its own section
   or under Support, navigating to the new screen — same `router.push('/tip-jar')` +
   thin-re-export-in-`app/` pattern every other route already uses.
