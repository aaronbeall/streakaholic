import {
  DEFAULT_TIP_PROMPT_STATE,
  shouldPromptForTip,
  TIP_PROMPT_COOLDOWN_MS,
  TIP_PROMPT_ELIGIBLE_KINDS,
} from '../../app/utils/tipPrompt';

describe('tip prompt eligibility', () => {
  it('fires for a curated "big" achievement kind', () => {
    expect(shouldPromptForTip('streak-100', DEFAULT_TIP_PROMPT_STATE, false)).toBe(true);
  });

  it('does not fire for an early/easy kind not on the allowlist', () => {
    expect(shouldPromptForTip('first-completion', DEFAULT_TIP_PROMPT_STATE, false)).toBe(false);
    expect(shouldPromptForTip('streak-2', DEFAULT_TIP_PROMPT_STATE, false)).toBe(false);
    expect(TIP_PROMPT_ELIGIBLE_KINDS).not.toContain('first-completion');
  });

  it('does not fire for habit-collector -- too easy to reach to read as a "big" moment', () => {
    expect(shouldPromptForTip('habit-collector', DEFAULT_TIP_PROMPT_STATE, false)).toBe(false);
    expect(TIP_PROMPT_ELIGIBLE_KINDS).not.toContain('habit-collector');
  });

  it('never fires once the user has already tipped, regardless of kind or cooldown', () => {
    expect(shouldPromptForTip('streak-1000', DEFAULT_TIP_PROMPT_STATE, true)).toBe(false);
  });

  it('enforces a cooldown since the last prompt, independent of app version', () => {
    const lastRequestAt = '2026-08-05T12:00:00.000Z';
    const eligibleState = { lastRequestAt };

    expect(shouldPromptForTip(
      'streak-100', eligibleState, false,
      new Date(new Date(lastRequestAt).getTime() + TIP_PROMPT_COOLDOWN_MS - 1)
    )).toBe(false);
    expect(shouldPromptForTip(
      'streak-100', eligibleState, false,
      new Date(new Date(lastRequestAt).getTime() + TIP_PROMPT_COOLDOWN_MS)
    )).toBe(true);
  });
});
