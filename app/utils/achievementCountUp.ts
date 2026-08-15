// The hero count duration scales logarithmically because achievement values span orders of
// magnitude (2 through 1,000+). A linear scale would make nearly every smaller tier look like the
// same one-second animation. Exported separately from the component so timing remains pure and
// unit-testable without loading React Native/Reanimated.
export const COUNT_DURATION_MIN = 1000;
export const COUNT_DURATION_MAX = 3000;
export const COUNT_DURATION_REF_VALUE = 1000;

export const getAchievementCountUpDuration = (value: number): number => {
  const t = Math.min(1, Math.log10(Math.max(1, value)) / Math.log10(COUNT_DURATION_REF_VALUE));
  return COUNT_DURATION_MIN + t * (COUNT_DURATION_MAX - COUNT_DURATION_MIN);
};

// Worklet-safe integer formatting. UI runtimes do not consistently expose the full Intl API, so
// avoid Number.toLocaleString inside animated props. This preserves the existing comma-grouped,
// rounded display for positive achievement values without crossing back to JavaScript.
export const formatAchievementCount = (value: number): string => {
  'worklet';
  const rounded = Math.max(0, Math.round(value));
  const digits = String(rounded);
  let formatted = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) formatted += ',';
    formatted += digits[i];
  }
  return formatted;
};
