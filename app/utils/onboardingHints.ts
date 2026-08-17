import { MaterialCommunityIconName } from '../types';

export const ONBOARDING_HINT_IDS = [
  'hold-to-complete',
  'multi-completion-progress',
  'tap-to-cycle',
  'hold-to-expand',
  'home-expiring-filter',
  'home-reorder',
  'home-dashboard',
  'dashboard-task-filter',
  'dashboard-calendar-chart-modes',
  'task-calendar-tap-day',
] as const;

export type OnboardingHintId = typeof ONBOARDING_HINT_IDS[number];
export type OnboardingHintsSeen = Partial<Record<OnboardingHintId, boolean>>;

export interface OnboardingHintDefinition {
  text: string;
  priority: number;
  iconItems?: readonly { icon: MaterialCommunityIconName; text: string }[];
  footer?: string;
}

// Copy and ordering live in one catalog so adding a hint doesn't require another screen-specific
// state machine. Lower priority numbers win when several eligible targets are mounted together.
export const ONBOARDING_HINT_CATALOG: Record<OnboardingHintId, OnboardingHintDefinition> = {
  'hold-to-complete': {
    text: 'Press and hold to complete',
    priority: 10,
  },
  'multi-completion-progress': {
    text: 'Hold again to log each repetition and reach today’s goal',
    priority: 15,
  },
  'tap-to-cycle': {
    text: 'Tap to flip between your habit, calendar & stats',
    priority: 20,
  },
  'hold-to-expand': {
    text: 'Press and hold to open the full screen and make changes',
    priority: 30,
  },
  'home-expiring-filter': {
    text: 'Tap to see habits that need attention today',
    priority: 40,
  },
  'home-reorder': {
    text: 'Tap to reorder and organize your habits',
    priority: 50,
  },
  'home-dashboard': {
    text: 'Tap to see the big picture — progress, trends & streaks',
    priority: 60,
  },
  'dashboard-task-filter': {
    text: 'Tap habits to choose what is included in your dashboard',
    priority: 10,
  },
  'dashboard-calendar-chart-modes': {
    text: 'Switch views:',
    iconItems: [
      { icon: 'view-grid-outline', text: 'See each habit' },
      { icon: 'chart-bar', text: 'Compare daily totals' },
      { icon: 'chart-areaspline-variant', text: 'Reveal trends' },
    ],
    footer: 'Tap any day for details',
    priority: 20,
  },
  'task-calendar-tap-day': {
    text: 'Tap a day to mark it complete, then tap again to clear it',
    priority: 10,
  },
};

export interface OnboardingHintCandidate {
  id: OnboardingHintId;
  enabled: boolean;
  priority: number;
  registrationOrder: number;
}

export const selectOnboardingHint = <T extends OnboardingHintCandidate>(
  candidates: readonly T[],
  seen: OnboardingHintsSeen
): T | null => {
  let selected: T | null = null;
  for (const candidate of candidates) {
    if (!candidate.enabled || seen[candidate.id]) continue;
    if (
      !selected
      || candidate.priority < selected.priority
      || (candidate.priority === selected.priority
        && candidate.registrationOrder < selected.registrationOrder)
    ) {
      selected = candidate;
    }
  }
  return selected;
};
