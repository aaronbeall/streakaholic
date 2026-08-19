# Publishing

How to ship Streakaholic to the Google Play Store, plus the implementation record for
**Rate this app** and **Tip jar**. For setup/dev workflow see [DEVELOPMENT.md](DEVELOPMENT.md);
for the chronological development-to-release runbook see [RELEASE_GUIDE.md](RELEASE_GUIDE.md);
for architecture see [CLAUDE.md](CLAUDE.md).

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
5. **Store listing assets**, mostly closed — the actual copy/assets moved to a dedicated
   doc, [STORE_LISTING.md](STORE_LISTING.md), so they don't drift out of sync with a
   second draft here. Current status:
   - **512×512 hi-res icon**: done, `design/AppIcons/playstore.png`.
   - **1024×500 feature graphic**: done (first pass), `design/store-assets/feature-graphic.png`.
   - **Short/full description**: drafted, ready to paste into Play Console.
   - **Screenshots (≥2 required)**: still need to be captured on an actual device — see
     STORE_LISTING.md's shot list. This is the one asset item that's still genuinely on
     you, since it means running the real app.
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

**On the app icon itself**: resolved 2026-08-19 — real source art ("logo4") was provided and
is now the canonical mark; every icon/store/in-app asset was regenerated from it. See BRAND.md's
"Visual identity status" for the full record.

### Store listing copy and assets

Moved to [STORE_LISTING.md](STORE_LISTING.md) — title, short/full description, screenshot
shot list, feature graphic, hi-res icon, and category/content-rating notes all live there
now, ready to paste into Play Console. Kept out of this file so there's exactly one place
that copy can drift out of date.

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
- [ ] Edit habit → Archive habit: confirm modal appears, Cancel and Archive both behave,
      Undo toast restores the habit.
- [ ] Edit habit → Delete habit: same, and Undo restores the habit *with* its completion
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

**Sharing**
- [ ] Settings → Share Streakaholic opens the native share sheet with the HTTPS store URL.
- [ ] Share an achievement from both a fresh celebration and a Trophy Case replay; confirm the
      preview matches the PNG received by Messages/social apps.
- [ ] Share habit Stats with "Include habit name" both on and off; confirm the hidden-name image
      contains no habit name.
- [ ] Share Dashboard Stats and confirm the image is sharp, correctly cropped, and has no screen
      navigation or share-preview controls in it.

**Gestures & haptics**
- [ ] Toast swipe-to-dismiss (either direction) actually dismisses it.
- [ ] Haptic feedback fires at each documented point (see `CLAUDE.md`'s Haptics section):
      long-press acknowledgment, completion success, destructive-action confirm, calendar
      day-toggle, Undo tap.
- [ ] Press-and-hold to complete a habit: ring fill, icon pop/overshoot/settle, and the
      streak badge's celebration pop all read as intended — this animation went through
      many rounds of on-device-only tuning (spring damping/stiffness, hold duration).
- [ ] A new best streak's particle celebration (swirl, staggered spawn, glow, color shift)
      renders smoothly with no dropped frames, and actually replays on a second streak in
      the same session (a real recurrence bug here was fixed by a `celebrationKey`).

**Layout & theming**
- [ ] Every screen's content clears the status bar and gesture nav bar (edge-to-edge) —
      Home, Dashboard, Settings, Archived habits, habit detail, About.
- [ ] Dark mode: no white flash when navigating (Dashboard ↔ Home, task-detail ↔ Home).
- [ ] Toggling light/dark in Settings updates every screen immediately.
- [ ] Home's habit grid: an incomplete last row of cards is centered, not stretched to fill
      the row.
- [ ] The "Progress over time" chart toggle (Dashboard Stats and per-habit Stats) renders
      as a clean, fully-rounded pill in both states — a real Android-only border-radius
      rendering bug was found and fixed here, worth a specific look.

**Onboarding**
- [ ] All 10 hints appear/dismiss correctly on a fresh install (or after Settings → Show tips
      again): hold-to-complete, multi-completion progress, tap-to-cycle, hold-to-expand,
      needs-attention filter, reorder, Dashboard, Dashboard habit filter, Dashboard calendar
      views, and habit-calendar tap-a-day.
- [ ] Each hint's pointer/ring targets the correct element with no visual offset (this
      class of bug — status-bar-relative measurement being wrong — was real and fixed).

**Free-tier habit cap**
- [ ] Creating a 7th active habit is blocked with a clear inline message + disabled Save;
      archiving one re-enables Save.
- [ ] Restoring an archived habit while already at 6 active habits is blocked with a toast.
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

## 2. Rate this app (implemented)

Two complementary pieces — a contextual native prompt, and a manual settings row.

### a. Contextual in-app review prompt

`expo-store-review` is installed. `settingsStore` persists bounded engagement metadata and
makes a native request eligible after 10 genuine current-day completion actions across 5
distinct active days. Imports, retroactive calendar edits, undo, and restore operations do not
count. `ReviewPromptCoordinator` in `_layout.tsx` waits until the app is active on Home, all
achievement celebrations/alerts have cleared, React Native interactions have settled, and a
further two-second pause has elapsed before calling the native API.

An attempt is recorded before entering the native API because the stores can silently suppress
their sheet and do not expose whether it appeared or whether a rating was submitted. Requests are
limited to once per app version with a 90-day cross-version cooldown. Eligibility rules live in
`app/utils/reviewPrompt.ts` with focused unit coverage.

### b. Manual "Rate this app" row in Settings

The Help section's explicit **Rate This App** row does not call the quota-controlled native API,
which could make a user-tapped button silently do nothing. Android opens the Play Store review
listing via `market://`, falling back to its HTTPS listing; `app.json` also records that Play Store
URL. iOS uses its configured App Store URL with `action=write-review` once an App Store product URL
has been assigned.

---

## 3. Tip jar (implemented)

The purchase layer chosen here is also intended to support the later Pro unlock and
Commitment Mode's consumable Streak Saves. The latter has additional transaction
recovery, integrity, and trust requirements beyond a low-stakes tip; do not generalize
the tip jar's client-only simplifications to it. See
[COMMITMENT_MODE.md](COMMITMENT_MODE.md).

### Library: `expo-iap`, not `react-native-iap`

This doc originally weighed `react-native-iap` against RevenueCat. That plan changed
once building actually started: **`react-native-iap` moved to a Nitro-Modules-based
rewrite (v14+) that explicitly dropped Expo support entirely** — its own docs list both
"Expo Go" and "Expo Dev Client" as unsupported, pointing instead to a sibling package,
[`expo-iap`](https://openiap.dev), built by the same team specifically for Expo/EAS
projects. That's what's actually installed (`npx expo install expo-iap`, config plugin
registered in `app.json`'s `plugins` array) — RevenueCat was never evaluated against
`expo-iap` specifically, so that tradeoff table is gone; if a future maintainer wants to
reconsider it, `expo-iap` vs. RevenueCat is the real comparison now, not the stale one
above used to describe.

`expo-iap` still needs a custom dev client / EAS Build — IAP requires native modules and
can't run in plain Expo Go (`expo-dev-client` is already installed). No backend/receipt
validation is used — a deliberate simplification appropriate for a $1–5 tip specifically
(per the OpenIAP spec's own client-side purchase confirmation), not a pattern to reuse for
anything gating real paid features later.

### What's built

- **`app/constants/tipJar.ts`** — the three tier SKUs (`tip_small`/`tip_medium`/
  `tip_large`) and their display metadata (icon, label, one-line description), in a fixed
  display order. No price is ever hardcoded here — always the store's own localized
  `displayPrice`.
- **`app/hooks/useTipJar.ts`** — wraps `expo-iap`'s `useIAP()` hook: fetches the three
  products once the store connection is live, exposes purchasing state per tier, and
  calls `finishTransaction({purchase, isConsumable: true})` on every successful purchase
  so Google doesn't auto-refund an unconsumed purchase after **3 days**. Also runs a
  best-effort recovery pass on connect (`getAvailablePurchases()` → finish anything still
  unconsumed for our SKUs) to cover the "app was killed mid-purchase" case — this only
  fires the next time the Tip Jar screen itself is opened, not from a background task, so
  a purchase that's interrupted *and* never revisited still relies on Google's own
  eventual auto-refund as the final fallback.
- **`app/screens/TipJarScreen.tsx`** + **`app/tip-jar.tsx`** — the screen (header, an
  intro card framing this as fully optional with no ads/subscription either way, the
  three tiers as rows with localized pricing, a connection-error banner + retry) and its
  thin route re-export, registered in `_layout.tsx`'s `Stack`.
- **Settings entry point** — a "Tip jar" row in `SettingsScreen`'s Help section, next to
  Rate this app / Share Streakaholic.
- **Feedback** — a tier-specific thank-you toast on success (existing `useToast()`, no
  custom success modal, matching this app's established toast-based feedback pattern).
- **Achievements** — three global, one-time Supporter kinds (`tip-coffee`/`tip-generous`/
  `tip-legend`, one per tier) recorded via a new `achievementsStore.recordTipAchievements`
  entry point, fully outside the habit-tracking completion path. Recognized on both a
  live purchase and the orphaned-purchase recovery pass above, so an interrupted-but-real
  purchase still earns its trophy the next time the Tip Jar screen loads. See
  `app/utils/achievements.ts`'s `detectTipAchievements`/`external-event` progress
  strategy — the first achievement kind in this app with no numeric progress to show at
  all (Trophy Case just renders these locked/unlocked).

### Play Console configuration (you still need to do this)

1. Your app must already exist in Play Console (see "1. Publishing to Google Play"
   above) — in-app products can't be created before that.
2. **Monetize → Products → In-app products → Create product**, three times, with these
   exact Product IDs (must match `app/constants/tipJar.ts` verbatim):
   - `tip_small` — e.g. $0.99, name "Buy me a coffee"
   - `tip_medium` — e.g. $2.99, name "You're the best!"
   - `tip_large` — e.g. $4.99, name "Streak legend"
3. Each one: **Product type = Managed product** is Play Console's only option for
   in-app products (there's no separate "consumable" toggle at creation time) — the
   consumable behavior is entirely client-side, via this app's own
   `finishTransaction({isConsumable: true})` call. Set each **Status → Active** once
   pricing is set, or it won't be purchasable even in testing.
4. Fill in each product's title/description (shown in the real purchase sheet) — the
   values above are a starting point, not final copy.

### Testing (no real money spent)

1. **Play Console → Setup → License testing**: add your own Google account's email as a
   **license tester**. Purchases made by a license tester show a real Play purchase
   sheet but are automatically cancelled/refunded — no real charge ever happens.
2. Test purchases **only work on a build installed through a Play Store testing track**
   (Internal testing is enough) — a local `development`-profile dev-client build
   installed by sideloading, without going through Play Store at all, cannot process
   real Play Billing purchases regardless of license-tester status. See "Using the app
   yourself, day-to-day" above for how to get onto the Internal testing track.
3. Build and install: `eas build --platform android --profile production` (or
   `preview`), upload it to the Internal testing track, install via that track's opt-in
   link.
4. On-device: Settings → Tip jar. Confirm all three tiers load with real localized
   prices (not stuck on the row's loading spinner — if they never resolve, double-check
   the Product IDs match exactly and each product's Status is Active). Purchase one —
   the real Play purchase sheet appears, confirm through it, expect the tier-specific
   thank-you toast and no charge on your actual payment method.
5. **Test the "killed mid-purchase" recovery path specifically**: start a purchase,
   force-quit the app *before* the thank-you toast appears (e.g. right after confirming
   in the Play sheet), then reopen the app and revisit Settings → Tip jar. The recovery
   pass in `useTipJar` should silently finish that purchase on this next visit — you
   won't see a second toast (that only fires from `onPurchaseSuccess`, not the recovery
   path), but confirm via Play Console → your app → Monetize → Products → the specific
   product's own order history that it wasn't left dangling toward the 3-day
   auto-refund.
6. As a license tester, you can also just cancel out of the purchase sheet to confirm
   the screen returns to normal (no error banner — user cancellation is deliberately
   silent, see `useTipJar`'s `ErrorCode.UserCancelled` check) rather than only ever
   testing the happy path.
