# Streakaholic marketing website

A static marketing site: plain HTML/CSS/JS, no build step, no framework. It lives in this
subdirectory so brand assets and copy can come straight from [`BRAND.md`](../BRAND.md),
[`STORE_LISTING.md`](../STORE_LISTING.md), and `../design/logo/`. Metro/Expo never sees it.

## Pages

| Path | What it's for |
|---|---|
| `/` | Home: hero with the demo video, then streaks, reminders, achievements, Ironman, sharing, stats, privacy |
| `/privacy/` | Privacy policy. **Use this URL for Play Console's privacy policy field.** |
| `/terms/` | Terms of service |
| `/delete-data/` | How to delete your data. Use for Play Console's Data safety "delete data" URL if asked. |
| `/support/` | Contact email and FAQ. Use as the store listing's website / support URL. |

Each subpage is a folder with an `index.html`, so URLs stay clean (`/privacy/`, not
`/privacy.html`). The header and footer are copied into each page by hand. If you change
the nav or footer links, change them in all five files.

The site is light by default and switches to dark with the visitor's OS setting. Screens use
`<picture>` with a `prefers-color-scheme: dark` source, and `script.js` swaps the hero video.

## Preview locally

```bash
cd website
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

## Hosting: GitHub Pages at streakaholic.app

`.github/workflows/website.yml` publishes this folder to GitHub Pages on every push to
`main` that touches `website/`. It can also be run by hand from the Actions tab. The
`CNAME` file here tells Pages to serve the site at `https://streakaholic.app`.

One-time setup:

1. **DNS at the registrar.** Add the apex records for `streakaholic.app` (host `@`):
   - `A`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `AAAA`: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
   - `CNAME` for `www` → `aaronbeall.github.io`

   Remove any other `A`/`AAAA` records on `@` (e.g. a registrar parking page).
2. **Turn on Pages.** Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Deploy.** Merge to `main` (or run "Deploy website" from the Actions tab).
4. **Custom domain.** In **Settings → Pages**, enter `streakaholic.app` and save. GitHub
   checks DNS; once it shows the domain is verified and the certificate is issued, tick
   **Enforce HTTPS**. `.app` domains only work over HTTPS, so the site won't load until then.
5. (Optional, recommended) **Verify the domain** for your account in GitHub
   **Settings → Pages → Add a domain**, so nobody else can claim it for another Pages site.

Pages-specific files: `CNAME` (custom domain), `404.html` (served for any missing path; it
uses root-absolute links, so it only works at the domain root), `robots.txt` and `sitemap.xml`.
Canonical and Open Graph URLs point at `https://streakaholic.app`. Everything else uses
relative links and also works when previewed locally.

## Before launch

- **Early access CTA.** The buttons go to `#get-access`, a `mailto:` asking to join testing.
  When the app is public, replace that section's button with a Google Play badge/link and
  change the hero eyebrow from "Coming soon to Android".
- **Privacy policy location.** There's an older hosted copy at
  `metamodernmonkey.com/privacy/streakaholic` (see `PUBLISHING.md`). This site's version is
  more complete: it covers notifications, Android device backup, the tip jar, and ratings.
  Pick one URL for Play Console and update the other to match or redirect to it.
- **Legal review.** The privacy policy and terms are written from the app's actual
  behavior, but are worth a lawyer's read before submission (as `TODO.md` notes for the
  in-app copy).

If the app ever adds analytics, sync, or anything that sends data off the device, update
`/privacy/`, `/delete-data/`, the privacy section on `/`, and the in-app About screen
together, before that version ships.

## Screens and video

`assets/screens/*.webp` and `assets/video/*` are real captures of the app, not mockups,
recorded from the web build at a 390×844 phone viewport (2× scale) with
`demo-data/streakaholic-demo-data.json` loaded and Morning Workout set as an Ironman habit.
Each shot has a `-light` and `-dark` version, except the Ironman shots, which are dark only
to match that section's dark band.

The demo video (`demo-*.mp4`, about 12 seconds, no audio) shows a check-in on Drink Water,
then Read Before Bed crossing into a 10-day streak and its celebration.

To recapture after UI changes:

1. Run `npm run demo-data` and start `npx expo start --web`.
2. The web build needs two small workarounds to mount (a `metro.config.js` that serves
   Zustand's CommonJS build, and a web fallback for the native SVG text span in
   `AchievementCelebration.tsx`). These were applied locally for capture and not committed;
   see PR #2's diff for the exact patch.
3. With Playwright, seed `localStorage` keys `tasks`, `appSettings` (onboarding hints marked
   seen) and `achievements` before load, then screenshot each route. Record the video with
   the Chrome DevTools screencast (`Page.startScreencast`) so it keeps the 2× resolution,
   and encode with `ffmpeg -c:v libx264 -crf 27 -movflags +faststart`.
4. Convert stills to WebP at 640px wide.

## Content source of truth

When brand language changes, update the source doc first, then re-sync this site:

- Positioning, tagline, voice, terminology → [`BRAND.md`](../BRAND.md)
- Feature bullets, privacy language → [`STORE_LISTING.md`](../STORE_LISTING.md)
- Colors, mark files → [`BRAND.md`](../BRAND.md)'s "Visual identity status" + `../design/logo/`

`assets/favicon-*`, `apple-touch-icon.png` and `og-image.png` are baked from
`../design/logo/` and `../design/store-assets/`. Regenerate them from those sources rather
than editing them here.
