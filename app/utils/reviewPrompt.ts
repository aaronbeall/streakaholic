export const REVIEW_MIN_COMPLETION_ACTIONS = 10;
export const REVIEW_MIN_ACTIVE_DAYS = 5;
export const REVIEW_REQUEST_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;

export interface ReviewPromptState {
  completionActions: number;
  // Capped at REVIEW_MIN_ACTIVE_DAYS. We only need enough dates to establish eligibility, not an
  // ever-growing usage log.
  activeDates: string[];
  lastRequestAt: string | null;
  lastRequestVersion: string | null;
}

export const DEFAULT_REVIEW_PROMPT_STATE: ReviewPromptState = {
  completionActions: 0,
  activeDates: [],
  lastRequestAt: null,
  lastRequestVersion: null,
};

export const recordReviewCompletion = (
  state: ReviewPromptState,
  date: string
): ReviewPromptState => {
  const completionActions = Math.min(
    REVIEW_MIN_COMPLETION_ACTIONS,
    state.completionActions + 1
  );
  const shouldAddDate = state.activeDates.length < REVIEW_MIN_ACTIVE_DAYS
    && !state.activeDates.includes(date);
  const activeDates = shouldAddDate ? [...state.activeDates, date] : state.activeDates;

  if (completionActions === state.completionActions && activeDates === state.activeDates) {
    return state;
  }

  return { ...state, completionActions, activeDates };
};

export const shouldRequestReview = (
  state: ReviewPromptState,
  appVersion: string,
  now: Date = new Date()
): boolean => {
  if (state.completionActions < REVIEW_MIN_COMPLETION_ACTIONS) return false;
  if (state.activeDates.length < REVIEW_MIN_ACTIVE_DAYS) return false;
  if (state.lastRequestVersion === appVersion) return false;

  if (state.lastRequestAt) {
    const elapsed = now.getTime() - new Date(state.lastRequestAt).getTime();
    if (!Number.isFinite(elapsed) || elapsed < REVIEW_REQUEST_COOLDOWN_MS) return false;
  }

  return true;
};
