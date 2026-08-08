# Publishing

How to ship Streakaholic to the Google Play Store, plus guides for two features that
matter for launch: **Rate this app** and **Tip jar**. For setup/dev workflow see
[DEVELOPMENT.md](DEVELOPMENT.md); for architecture see [CLAUDE.md](CLAUDE.md).

## Readiness audit (as of 2026-08-08)

Ran `npx expo-doctor` and reviewed `app.json`/`eas.json`/`assets/` against Play Store
requirements. Summary: the project is close — EAS is already wired up — but a handful of
things need attention before/during submission.

### Already in good shape
- EAS project linked (`app.json` → `extra.eas.projectId`), `eas.json` has `development`/
  `preview`/`production` build profiles and a `submit.production` profile scaffolded.
- Unique Android package name set: `com.metamodernmonkey.Streakaholic`.
- `appVersionSource: "remote"` + `autoIncrement: true` on the production build profile —
  EAS manages the Android `versionCode` for you; no manual bumping per release.
- `newArchEnabled: true` — current architecture, keeps pace with Expo's own requirements.
- App icon (`icon.png`, 1024×1024) and splash icon (`splash-icon.png`, 1024×1024) are
  correctly sized.
- `npx expo-doctor`: 16/17 checks pass.

### Gaps to close
1. **Adaptive icon foreground is only 500×500** (`adaptive-icon.png`). Expo/Android
   recommend **1024×1024** source art for adaptive icons — at 500×500 it'll get upscaled
   for the highest-density screens (xxxhdpi), which can look soft. Not a hard blocker, but
   worth regenerating from higher-res source before this becomes the permanent Play Store
   icon.
2. **No hosted Privacy Policy URL.** Play Console requires a real URL in the store
   listing — the in-app About screen's Privacy Policy text doesn't satisfy this. Publish
   it somewhere reachable, e.g. `metamodernmonkey.com/privacy` (the About screen's
   existing copy is a fine starting point, just needs a public home).
3. **`submit.production` has no `serviceAccountKeyPath`.** `eas submit --platform android`
   needs a Google Play service account JSON key to submit non-interactively — see
   [Setting up automated submission](#3-optional-set-up-automated-submission) below.
   Also: **the very first release must go through the Play Console web UI manually** —
   `eas submit` can push builds to an app that already exists in Play Console, but can't
   create the store listing itself.
4. **`@types/jest` version mismatch** (expected `29.5.14`, found `30.0.0`) — dev-only,
   not a shipping blocker. Fix with `npx expo install --check` when convenient.
5. **Unused dependencies bloating the bundle**: `react-native-circular-progress`,
   `react-native-circular-progress-indicator`, `react-native-confetti-cannon`,
   `react-native-particle-system`, `react-native-progress` are in `package.json` but never
   imported anywhere in `app/`. Worth `npm uninstall`-ing before a production build —
   smaller bundle, simpler dependency tree, one less thing `expo-doctor` has to reason
   about.
6. **Store listing assets don't exist yet**: 512×512 hi-res icon export, 1024×500 feature
   graphic, phone screenshots (≥2), short description (80 char), full description
   (4000 char). Asset/copywriting work, not code — budget real time for this.
7. **Data Safety form & content rating questionnaire** — filled out in Play Console, not
   in the repo. Today's honest answer to "what data does this app collect" is "none,"
   which is the easiest version of this form to fill out. If usage analytics is ever
   added (a separate, previously-discussed task), this form *and* the in-app Privacy
   Policy both need updating to match — a mismatch between disclosed and actual behavior
   is a real policy risk, not just a copy nitpick.
8. **Closed testing requirement** — new Play Console developer accounts currently must
   run a closed test (some number of testers over some number of days) before being
   allowed to publish to production. Google's exact policy here has shifted over time —
   check the current requirement in Play Console when you get to this step.

---

## 1. Publishing to Google Play

1. **Create a Google Play Console developer account** ($25 one-time fee) if you don't
   have one: https://play.google.com/console/signup
2. **Prepare store listing assets** (see gap #6 above): hi-res icon, feature graphic,
   screenshots, short/full description.
3. **Host the Privacy Policy** at a real URL (gap #2) — adapt the About screen's existing
   text.
4. **Create the app in Play Console**: app name, default language, package name
   `com.metamodernmonkey.Streakaholic`, free (or paid — note: switching a free app to
   paid later is far more restricted than the reverse, so decide this deliberately), and
   declare it as an app (not a game).
5. **Fill out Data Safety and content rating questionnaires** (gap #7).
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
   Play's current policy requires for a new developer account (gap #8).

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
