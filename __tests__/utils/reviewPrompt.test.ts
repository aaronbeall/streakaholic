import {
  DEFAULT_REVIEW_PROMPT_STATE,
  recordReviewCompletion,
  REVIEW_MIN_COMPLETION_ACTIONS,
  REVIEW_REQUEST_COOLDOWN_MS,
  shouldRequestReview,
} from '../../app/utils/reviewPrompt';

describe('review prompt eligibility', () => {
  it('requires enough completions across five distinct active days', () => {
    let state = DEFAULT_REVIEW_PROMPT_STATE;
    const dates = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05'];

    for (let index = 0; index < REVIEW_MIN_COMPLETION_ACTIONS; index += 1) {
      state = recordReviewCompletion(state, dates[index % dates.length]);
    }

    expect(state.completionActions).toBe(REVIEW_MIN_COMPLETION_ACTIONS);
    expect(state.activeDates).toEqual(dates);
    expect(shouldRequestReview(state, '1.0.0', new Date('2026-08-05T12:00:00Z'))).toBe(true);
  });

  it('does not count repeated completions as additional active days', () => {
    let state = DEFAULT_REVIEW_PROMPT_STATE;
    for (let index = 0; index < REVIEW_MIN_COMPLETION_ACTIONS; index += 1) {
      state = recordReviewCompletion(state, '2026-08-01');
    }

    expect(state.activeDates).toEqual(['2026-08-01']);
    expect(shouldRequestReview(state, '1.0.0')).toBe(false);
  });

  it('allows at most one request per version and enforces a cross-version cooldown', () => {
    const lastRequestAt = '2026-08-05T12:00:00.000Z';
    const eligibleState = {
      completionActions: REVIEW_MIN_COMPLETION_ACTIONS,
      activeDates: ['1', '2', '3', '4', '5'],
      lastRequestAt,
      lastRequestVersion: '1.0.0',
    };

    expect(shouldRequestReview(eligibleState, '1.0.0', new Date('2027-08-05'))).toBe(false);
    expect(shouldRequestReview(eligibleState, '1.1.0', new Date(new Date(lastRequestAt).getTime() + REVIEW_REQUEST_COOLDOWN_MS - 1))).toBe(false);
    expect(shouldRequestReview(eligibleState, '1.1.0', new Date(new Date(lastRequestAt).getTime() + REVIEW_REQUEST_COOLDOWN_MS))).toBe(true);
  });

  it('caps persisted engagement counters once their thresholds are met', () => {
    let state = {
      ...DEFAULT_REVIEW_PROMPT_STATE,
      completionActions: REVIEW_MIN_COMPLETION_ACTIONS,
      activeDates: ['1', '2', '3', '4', '5'],
    };

    const next = recordReviewCompletion(state, '6');
    expect(next).toBe(state);
  });
});
