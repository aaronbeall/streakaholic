# Monetization

A plan for how Streakaholic makes money, and just as importantly, how it doesn't. For
the technical implementation of the tip jar (and "Rate this app"), see
[PUBLISHING.md](PUBLISHING.md). This doc is the product/business shape; that one is the
how-to-build-it guide.

## Philosophy

No subscription, no ads. Everything the app stores lives on-device with no server, so a
recurring subscription would look like exactly what it'd be — charging monthly for
something with no ongoing cost to provide — and would directly contradict the app's own
"no cloud, no account, no tracking" pitch. Ads are similarly a bad fit: this is an app
people open several times a day for a quick, satisfying ritual (check off a habit, watch
a streak tick up), and both the interruption and the behavioral-targeting baggage most ad
networks carry cut against that experience and the privacy positioning alike.

Instead: a one-time "Pro" unlock (matching how Streaks itself is sold), plus two small
complementary IAPs that don't require gating anything. All three can share the same IAP
plumbing — see PUBLISHING.md's tip jar section for the `react-native-iap` vs. RevenueCat
decision, which applies to all of this, not just the tip jar.

## Free tier (forever, no nagging)

Everything that makes the app actually work stays free, permanently:
- Creating, completing, and archiving tasks
- All frequency types (daily, specific days, X/week, X/month) and multi-rep tracking
- Streak tracking, the Dashboard's aggregate stats and charts, per-task Calendar/Stats/Streaks views
- Light/dark mode
- **Data export and import** — deliberately never gated. Paywalling access to a user's
  own data would undermine the app's core "your data is yours" promise; if anything,
  making export easy is a *retention* feature, not a monetization lever.

A **soft cap on active (non-archived) tasks** is the one free-tier limit — see below.
**Implemented 2026-08-08**, capped at 6, ahead of the Pro unlock itself (see `CLAUDE.md`'s
"Free-tier task cap" section for the enforcement details) — deliberately shipped before
there's anything to buy, so the limit is never something existing free users lose, only
ever something they've always had. Data export/import stay uncapped, per the "your data is
yours" principle above — see CLAUDE.md for why.

## Pro tier (one-time unlock, not a subscription)

A single non-consumable IAP that removes the task cap and unlocks the smaller
customization/polish features. Candidates, roughly in order of how compelling each is as
a reason to actually pay:

1. **Unlimited active tasks** — free tier capped at 6 (implemented). This is the main lever: casual
   users tracking one or two habits never hit it and never need to pay; people who've
   actually built the habit of using the app for a bunch of things are exactly the users
   who've gotten the most value from it already.
2. **Widgets** (already on the roadmap, MMP tier) — a natural premium feature once built:
   high visible value, doesn't affect the core in-app experience for free users.
3. **Extra icon/color customization** beyond the current picker — low-stakes delight, the
   kind of thing that's nice to pay for but nobody feels cheated without.

Explicitly **not** behind Pro: anything that's really "the app working correctly"
(reminders/notifications, when built, should probably be free — they're closer to core
functionality than decoration).

### Pricing (rough starting point, not a strong opinion)

A one-time unlock in this app category typically lands somewhere in **$2.99–$5.99** — low
enough to be an easy impulse purchase for someone who's already hit the task cap, high
enough to be worth Play's cut and your time. Start on the lower end; raising a price later
is much easier than lowering one that launched too high.

## Complementary IAPs (no feature gating, no Pro requirement)

These work standalone, for free-tier users too — they're not trying to upsell Pro, they're
separate small transactions:

- **Tip jar** — a few consumable tiers (e.g. $0.99 / $2.99 / $4.99), no strings attached,
  purely for users who want to say thanks. See PUBLISHING.md for the implementation guide.
- **Streak unfreeze** — a small consumable (~$0.99–$1.99) that restores a broken streak.
  Well-precedented (Duolingo's streak freeze), emotionally well-targeted — people get
  genuinely attached to streak counts and a missed day due to travel/illness/etc. is
  exactly the moment someone would pay a dollar not to lose months of progress. Doesn't
  require gating anything, just needs the actual "restore a lapsed streak" logic built
  (currently doesn't exist — this is a real feature to design and build, not just a
  billing hookup).

## Sequencing

Don't build all of this before launching. A reasonable order:
1. **Launch free**, no IAP at all yet, per the existing `PUBLISHING.md` plan — get the app
   out and see if the free experience actually holds up for real users first.
2. **Add the tip jar** as a fast follow — smallest lift (no feature-gating logic, no task
   cap to design around), lets you validate the IAP plumbing (purchase flow, consumption,
   Play Console products) on the lowest-stakes possible transaction before building
   anything users are more likely to be annoyed about being asked to pay for.
3. **Add the Pro unlock** once the task cap and at least one other Pro feature (widgets is
   the obvious one) actually exist to justify it — selling "unlimited tasks" before the
   cap exists, or "Pro" before it does anything, isn't a real product yet.
4. **Streak unfreeze** whenever the underlying "restore a lapsed streak" feature gets
   built — it's a feature-design task before it's a monetization task.

## What we're explicitly not doing (and why)

| Option | Why not |
|---|---|
| Subscription | No ongoing cost to justify recurring charges; contradicts the app's own local-only/no-account pitch |
| Ads | Interrupts a several-times-a-day ritual; most ad networks' targeting conflicts with the privacy positioning |
| Paywalling data export | Undermines the "your data is yours" promise that's core to the app's identity |
| Paywalling core tracking (creating/completing tasks, streaks) | Kills trust and retention in a category where people churn fast if the basics feel held hostage |
