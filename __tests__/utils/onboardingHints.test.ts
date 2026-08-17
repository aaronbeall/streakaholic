import {
  ONBOARDING_HINT_CATALOG,
  ONBOARDING_HINT_IDS,
  OnboardingHintCandidate,
  selectOnboardingHint,
} from '../../app/utils/onboardingHints';

const candidate = (
  id: OnboardingHintCandidate['id'],
  priority: number,
  registrationOrder: number,
  enabled = true
): OnboardingHintCandidate => ({ id, priority, registrationOrder, enabled });

describe('onboarding hint coordination', () => {
  it('keeps every catalog entry addressable by one unique persisted id', () => {
    expect(new Set(ONBOARDING_HINT_IDS).size).toBe(ONBOARDING_HINT_IDS.length);
    expect(Object.keys(ONBOARDING_HINT_CATALOG).sort()).toEqual([...ONBOARDING_HINT_IDS].sort());
  });

  it('selects only the highest-priority eligible unseen hint', () => {
    const selected = selectOnboardingHint([
      candidate('home-dashboard', 50, 0),
      candidate('tap-to-cycle', 20, 1),
      candidate('hold-to-complete', 10, 2),
    ], {});

    expect(selected?.id).toBe('hold-to-complete');
  });

  it('advances past dismissed, disabled, and otherwise ineligible hints', () => {
    const selected = selectOnboardingHint([
      candidate('hold-to-complete', 10, 0),
      candidate('tap-to-cycle', 20, 1, false),
      candidate('home-reorder', 40, 2),
    ], { 'hold-to-complete': true });

    expect(selected?.id).toBe('home-reorder');
  });

  it('uses stable registration order as the tie-breaker', () => {
    const selected = selectOnboardingHint([
      candidate('home-dashboard', 10, 4),
      candidate('home-reorder', 10, 3),
    ], {});

    expect(selected?.id).toBe('home-reorder');
  });

  it('returns no hint when none is eligible and unseen', () => {
    expect(selectOnboardingHint([
      candidate('home-dashboard', 10, 0, false),
      candidate('home-reorder', 20, 1),
    ], { 'home-reorder': true })).toBeNull();
  });
});
