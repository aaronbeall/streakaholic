# Release Guide

This is the chronological runbook for taking Streakaholic from a feature change to a
Google Play release. It covers both the first public release and later updates.

For the detailed device QA checklist, store-listing copy, screenshots, Data Safety
answers, content rating, and service-account setup, see [PUBLISHING.md](PUBLISHING.md).
For local setup and project structure, see [DEVELOPMENT.md](DEVELOPMENT.md).

## Build variants

Streakaholic has three Android variants. Their package IDs keep their installations and
on-device data separate.

| EAS profile | Installed name | Android package ID | Artifact | Purpose |
| --- | --- | --- | --- | --- |
| `development` | Streakaholic Dev | `com.metamodernmonkey.Streakaholic.dev` | APK | Daily development with Metro and fast refresh |
| `preview` | Streakaholic Preview | `com.metamodernmonkey.Streakaholic.preview` | APK | Standalone, production-like device QA |
| `production` | Streakaholic | `com.metamodernmonkey.Streakaholic` | AAB | Google Play testing and public release |

The variants are selected by `APP_VARIANT` in `eas.json` and resolved by
`app.config.js`. With no `APP_VARIANT`, the config deliberately falls back to production.

Development and preview can coexist with the Play Store app and do not share
AsyncStorage data with it. Google Play's Internal, Closed, Open, and Production tracks
all use the production package ID, so those tracks are versions of the same installed
app and share its on-device data across updates.

## 1. Make and test feature changes

### Start the development client

Create a new development build when setting up a device for the first time or after a
change to native dependencies, Expo plugins, permissions, icons, package configuration,
or other native configuration:

```bash
eas build --platform android --profile development
```

Install the APK from the EAS build link, then start Metro:

```bash
npx expo start --dev-client
```

For ordinary TypeScript, JavaScript, styling, asset, and UI changes, reuse the installed
development client. A new EAS build is not normally needed.

### Run the automated checks

Before creating a release candidate, run:

```bash
npm test
npm run lint
npx tsc --noEmit
npx expo-doctor
```

Fix failures rather than treating a preview build as the test for them. Also review the
working tree so the build contains exactly the intended changes:

```bash
git status --short
git diff
```

Record the source revision or otherwise keep track of exactly what was built. A release
build should be reproducible even when it is intentionally built from an uncommitted
working tree.

## 2. Create and test the preview release candidate

Build the standalone preview APK:

```bash
eas build --platform android --profile preview
```

Install it from the link or QR code shown by EAS and launch **Streakaholic Preview**.
Metro is not used for this build.

Use preview for the full production-like manual pass:

- Cold launch, force-quit, relaunch, offline use, and persistence.
- Task creation, completion, editing, archive/delete, and Undo.
- Notifications, permissions, sharing, import/export, and file pickers.
- Onboarding, gestures, haptics, animations, safe areas, and dark mode.
- Free-tier limits and any purchase UI that can be exercised safely.
- Upgrade behavior by installing the new preview APK over an older preview APK.
- A fresh-install pass after exporting any test data, uninstalling preview, and
  reinstalling it.

Use the complete checklist in [PUBLISHING.md](PUBLISHING.md#manual-qa-checklist).

Installing a newer compatible preview APK over the previous one normally preserves its
data. Uninstalling clears that variant's local data. Preview's share and review actions
may intentionally point to the public production Play listing even though preview has a
different package ID.

If preview exposes a release-blocking problem, fix it, rerun the relevant automated
checks, and make another preview build. Treat the preview build that passes QA as the
release candidate; avoid unrelated changes between that candidate and production.

## 3. Prepare the release version

There are two Android version values:

- `expo.version` in `app.json` is the user-visible version name, such as `1.0.0` or
  `1.1.0`. Update it for a public release when the user-facing version should change.
- Android `versionCode` is the monotonically increasing store build number. The
  production profile uses `appVersionSource: "remote"` and `autoIncrement: true`, so EAS
  increments it automatically for every production build.

Do not manually add an Android `versionCode` to `app.json` unless the EAS versioning
strategy is deliberately changed.

Before building production:

1. Decide and set the user-visible `version` in `app.json`.
2. Draft concise release notes describing user-visible changes.
3. Re-run the automated checks.
4. Confirm the production config resolves to the public package ID:

   ```bash
   APP_VARIANT=production npx expo config --type public
   ```

5. Confirm no secrets, test endpoints, debug screens, or demo data are unintentionally
   enabled.
6. Confirm imports and migrations preserve existing users' data. Streakaholic stores its
   data locally, so a destructive storage change can affect every upgrading user.

## 4. Build the production AAB

Run:

```bash
eas build --platform android --profile production
```

The result is an Android App Bundle (`.aab`) for Google Play. It is not installed
directly like an APK. Save the EAS build URL/ID with the release notes so it is clear
which artifact was tested and released.

Production uses:

```text
com.metamodernmonkey.Streakaholic
```

The final release should be installed from a Google Play testing track. That verifies
Play App Signing, AAB processing, device-specific APK generation, Play delivery, and
the real update path.

## 5A. First Google Play release

The first release includes one-time Play Console setup. Use the current requirements
shown in Play Console; Google can change testing and account eligibility requirements.

1. Create the Streakaholic app in Google Play Console with the production package ID.
2. Complete the main store listing:
   - App name and short/full descriptions.
   - App icon, feature graphic, and phone screenshots.
   - App category and contact details.
   - Hosted privacy policy URL.
3. Complete the required App content sections, including:
   - Data Safety.
   - Content rating.
   - Ads declaration.
   - Target audience and any other declarations Play requests.
4. Configure Play App Signing and protect all upload/signing credentials.
5. Upload the production AAB to **Internal testing** in Play Console.
6. Add testers, publish the internal-testing release, follow the opt-in link, and install
   Streakaholic from Google Play.
7. Run a focused final smoke test on that Play-installed build:
   - Fresh installation and first launch.
   - Core task and persistence flow.
   - Notifications and native permissions.
   - Import/export and sharing.
   - Store review/share destinations.
   - Upgrade behavior if an earlier production-ID test build exists.
8. Complete any Closed testing period or tester-count requirement displayed for the
   developer account, then apply for production access if Play requires it.
9. Create the Production-track release using the tested AAB, add release notes, review
   Play's warnings, and submit it for review.
10. Prefer a staged rollout when Play makes it available. Monitor crashes, ANRs, reviews,
    and support reports before expanding to 100%.

The store-listing assets and questionnaire guidance are documented in
[PUBLISHING.md](PUBLISHING.md#store-listing-copy-ready-to-paste).

## 5B. Release a new version

For every update after the initial release:

1. Finish the feature work and automated checks in section 1.
2. Build and fully test a preview release candidate as described in section 2.
3. Update `expo.version` in `app.json` when appropriate and prepare release notes.
4. Build a new production AAB:

   ```bash
   eas build --platform android --profile production
   ```

5. Upload that AAB to Play Console's Internal testing track.
6. Install or update from the tester opt-in account. Test both:
   - Updating an existing production installation, preserving real local data.
   - A fresh installation with empty storage.
7. Promote the tested release to Closed/Open testing or Production, or create the next
   track release from the same tested artifact.
8. Add release notes, resolve Play Console errors, and submit for review.
9. Use a staged rollout for meaningful or risky changes and monitor quality signals.

Do not test only by uninstalling first: most public users receive an update and retain
their existing AsyncStorage data. Also do not use a preview install to prove production
upgrade safety, because preview has a different package ID and separate storage.

## Optional EAS submission

The repository's production submit profile expects this gitignored file:

```text
google-play-service-account.json
```

Once the Google Play service account is configured as described in
[PUBLISHING.md](PUBLISHING.md#optional-set-up-automated-submission), an existing build
can be submitted with:

```bash
eas submit --platform android --profile production
```

Or build and submit together:

```bash
eas build --platform android --profile production --auto-submit
```

For a high-confidence release, building first, recording the build ID, and then
submitting that known artifact is easier to audit than combining the steps.

## Rollout problems and emergency fixes

- If a staged rollout is unhealthy, halt it in Play Console.
- Do not try to ship an older AAB as a downgrade; Google Play requires a higher
  `versionCode`. Fix forward and create a new production build.
- If a release can corrupt or lose local data, stop rollout immediately. Preserve export
  compatibility wherever possible and validate the fix using a copy of pre-update data.
- Keep release fixes narrowly scoped, repeat the relevant preview checks, upload the new
  production AAB to Internal testing, and only then resume production rollout.

## Short command reference

```bash
# Daily development (after the development APK is installed)
npx expo start --dev-client

# Rebuild after native/config changes
eas build --platform android --profile development

# Standalone production-like APK
eas build --platform android --profile preview

# Store AAB
eas build --platform android --profile production

# Automated checks
npm test
npm run lint
npx tsc --noEmit
npx expo-doctor

# Verify variant resolution
APP_VARIANT=development npx expo config --type public
APP_VARIANT=preview npx expo config --type public
APP_VARIANT=production npx expo config --type public
```

