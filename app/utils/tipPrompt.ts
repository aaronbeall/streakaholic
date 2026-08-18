import { AchievementKind } from './achievements';

// Shorter than the review prompt's own 90-day cooldown, and deliberately not also gated to "once
// per app version" the way that one is (there's no OS-level quota reason to add that restriction
// here -- it was only mirroring reviewPrompt.ts's shape). A toast is easy to miss entirely (it
// auto-dismisses in ~8s, no persistent badge) -- a missed one deserves another shot meaningfully
// sooner than potentially waiting for the next release, per explicit user direction ("slightly
// more persistent... risk the user doesn't even notice").
export const TIP_PROMPT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

// A curated allowlist, not "every achievement" -- matches the review prompt's own philosophy of
// only asking after real, substantial engagement. Deliberately excludes early/easy kinds
// (first-completion, streak-2, perfect-day, etc.) that haven't earned the right to ask yet; only
// kinds that represent a genuinely big, sustained accomplishment make the cut. habit-collector
// (building a full 6-habit roster) was cut per explicit user direction -- too easy to reach to
// read as a "big" moment.
export const TIP_PROMPT_ELIGIBLE_KINDS: AchievementKind[] = [
  'streak-25', 'streak-50', 'streak-100', 'streak-1000',
  'milestone-100', 'milestone-1000',
  'century-club-100', 'century-club-500', 'century-club-1000', 'century-club-10000',
  'anniversary',
];

export interface TipPromptState {
  lastRequestAt: string | null;
}

export const DEFAULT_TIP_PROMPT_STATE: TipPromptState = {
  lastRequestAt: null,
};

// Whether earning `kind` right now should queue a friendly tip-jar nudge. Called once per newly
// earned achievement at the moment it's recorded (see achievementsStore's own
// recordCompletionAchievements/recordTaskCreatedAchievements) -- unlike review eligibility, this
// doesn't accumulate a count across many actions; it's meant to ride one specific celebratory
// moment, so there's nothing to track except "has this already been asked recently."
export const shouldPromptForTip = (
  kind: AchievementKind,
  state: TipPromptState,
  hasEverTipped: boolean,
  now: Date = new Date()
): boolean => {
  // Someone who's already tipped has already been thanked (see the tip-jar Supporter
  // achievements) -- asking again reads as ignoring that they already gave, not as a fresh
  // opportunity.
  if (hasEverTipped) return false;
  if (!TIP_PROMPT_ELIGIBLE_KINDS.includes(kind)) return false;

  if (state.lastRequestAt) {
    const elapsed = now.getTime() - new Date(state.lastRequestAt).getTime();
    if (!Number.isFinite(elapsed) || elapsed < TIP_PROMPT_COOLDOWN_MS) return false;
  }

  return true;
};
