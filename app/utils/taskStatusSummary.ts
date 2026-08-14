import { format, parseISO } from 'date-fns';
import { MaterialCommunityIconName, Task } from '../types';
import { formatFrequencySentence } from './formatFrequency';
import { getCompletionCount, isDueOnDate } from './streaks';

// Three deliberately separate elements (2026-08-14, per explicit user direction after an earlier
// single-paragraph version) for the task-details status popover -- Schedule (redundant with
// TaskHeader's own frequency badge, repeated here for convenience), Status (whether today is due,
// and today's own completion/risk state -- the genuinely branching part), and Best (a standalone
// acknowledgment, shown only when currently tied with the task's own record, not a general
// "your record is N days" fact). Kept as three pieces rather than one flowing sentence so the UI
// can give each its own icon/color instead of blending three different kinds of information into
// one paragraph.
export interface TaskStatusBadge {
  icon: MaterialCommunityIconName;
  color: string;
  text: string;
}

export interface TaskStatusInfo {
  // A full sentence (formatFrequencySentence), not just the compact badge label -- plus when the
  // task was actually created, since "how often" alone doesn't say how long it's been running.
  scheduleSentence: string;
  status: TaskStatusBadge;
  // Non-null whenever this task's frequency has a genuinely non-obvious streak-counting rule worth
  // spelling out in plain English -- days_per_week/days_per_month (the streak unit is the whole
  // period, not each individual day) and specific_days_of_week (a non-due day is a free pass, not a
  // miss, and still adds to the streak if completed anyway -- same "bonus day" mechanic the Status
  // row above surfaces case-by-case, stated here as a general rule regardless of today's own state).
  // `daily` never sets this -- every day is due, so there's no bonus-day/quota-period nuance to
  // explain at all.
  frequencyExplainer: string | null;
  // Only present when the task's current streak equals its own best -- not a general "your record
  // is N days" fact, purely a celebratory acknowledgment of the moment.
  best: TaskStatusBadge | null;
}

// Same red/orange/gray language getStreakBadgeStyle (streaks.ts) already established for the
// header's own streak badge -- reused directly rather than inventing a second color scheme for
// what's fundamentally the same "how healthy is this streak right now" signal.
const ACTIVE_COLOR = '#FF6B6B'; // up_to_date / completed today
const AT_RISK_COLOR = '#FFA726'; // expiring / partial progress
const NEUTRAL_COLOR = '#90A4AE'; // not due / lapsed / never started
const BEST_COLOR = '#FFD700'; // this app's own established "best streak" gold

// Shared three-way "completed today" wording (streak just started / continuing / a zero-streak
// edge case) -- used both when today was actually due and when it wasn't (a bonus, non-due
// completion still adds to the running streak, per streaks.ts's own "every day completed -- due or
// not -- adds to the running count" design), so only the lead clause differs between call sites.
// 'fire' (not a generic checkmark) for every branch here, matching getStreakBadgeStyle's own icon
// for the identical active-streak status elsewhere in the app.
const describeCompletedToday = (leadClause: string, currentStreak: number): TaskStatusBadge => {
  if (currentStreak === 1) {
    return { icon: 'fire', color: ACTIVE_COLOR, text: `${leadClause} — streak started!` };
  }
  return currentStreak > 1
    ? { icon: 'fire', color: ACTIVE_COLOR, text: `${leadClause}, keeping your ${currentStreak}-day streak going.` }
    : { icon: 'fire', color: ACTIVE_COLOR, text: `${leadClause}.` };
};

const buildStatusBadge = (task: Task, today: Date): TaskStatusBadge => {
  const isDue = isDueOnDate(task, today);
  const timesPerDay = task.timesPerDay || 1;
  const completionCount = getCompletionCount(task, today);
  const isCompletedToday = completionCount >= timesPerDay;
  const currentStreak = task.stats?.currentStreak ?? 0;
  const streakStatus = task.stats?.streakStatus ?? 'never_started';
  const isQuotaBased = task.frequency === 'days_per_week' || task.frequency === 'days_per_month';

  if (!isDue) {
    // A non-due day that got completed anyway is still a genuine bonus day for the streak engine
    // (see the shared helper's own comment above) -- worth acknowledging rather than the flat
    // "nothing needed" text, which would otherwise read as if the completion didn't matter. No rep
    // counting here (unlike the due-and-completed branch below) -- reps only matter for judging
    // whether a *due* day met its quota; a non-due day either qualifies as a full completed day for
    // the streak or it doesn't, so there's nothing partial worth surfacing.
    if (isCompletedToday) {
      return describeCompletedToday('Not due today, but you completed it anyway', currentStreak);
    }
    return { icon: 'calendar-blank-outline', color: NEUTRAL_COLOR, text: 'Not scheduled for today — nothing needed right now.' };
  }

  if (isCompletedToday) {
    const doneClause = timesPerDay > 1 ? `Completed all ${timesPerDay} reps today` : 'Completed today';
    // Today's own reps being done doesn't necessarily resolve a quota-based task's whole period --
    // `streakStatus` can still read 'expiring' right after completing today if every remaining day
    // this period is now required to hit quota, which is worth surfacing rather than a flat
    // "Completed" that implies the streak's fully secure. `expired`/`never_started` are excluded
    // here since completing a due day always resolves those back to 'up_to_date' by the time stats
    // recompute -- this switch only needs to distinguish the two states actually reachable
    // alongside a same-day completion.
    if (streakStatus === 'expiring') {
      return { icon: 'clock-outline', color: AT_RISK_COLOR, text: `${doneClause} — but every remaining day this period is still needed.` };
    }
    return describeCompletedToday(doneClause, currentStreak);
  }

  if (completionCount > 0) {
    return { icon: 'progress-clock', color: AT_RISK_COLOR, text: `${completionCount} of ${timesPerDay} done today — keep going.` };
  }

  switch (streakStatus) {
    case 'expiring':
      return { icon: 'clock-outline', color: AT_RISK_COLOR, text: 'Complete today to keep your streak alive!' };
    case 'up_to_date':
      // A due, incomplete day on a daily/specific-days task always reads 'expiring' by the streak
      // engine's own design (calculateDueDayStats), not 'up_to_date' -- this branch is really only
      // reachable for quota-based tasks that already met this period's goal before today. Kept
      // defensive for the non-quota case anyway rather than assuming that invariant can't change.
      return isQuotaBased
        ? { icon: 'calendar-check-outline', color: NEUTRAL_COLOR, text: 'Already met this period’s goal — today is optional.' }
        : { icon: 'calendar-check-outline', color: NEUTRAL_COLOR, text: 'No rush yet today.' };
    case 'expired':
      return { icon: 'sleep', color: NEUTRAL_COLOR, text: 'Your streak has lapsed — complete today to start fresh.' };
    case 'never_started':
    default:
      return { icon: 'flag-outline', color: NEUTRAL_COLOR, text: 'Haven’t started a streak yet — today’s a great day to begin.' };
  }
};

// days_per_week/days_per_month tasks only require enough qualifying days within each period, not
// every single day -- worth spelling out explicitly, since "3x weekly" alone doesn't say *which*
// days matter. Leads with the quota requirement itself (per explicit user direction), closing with
// a deliberate clarification that the streak *length* is still a plain day count either way --
// the quota only decides which days count toward it, not a different counting unit (this app's own
// established design, see CLAUDE.md's "every streak, regardless of frequency, is always counted in
// days" note) -- worth stating directly since "tracks by week" phrasing could otherwise be
// misread as the streak itself being counted in weeks.
//
// specific_days_of_week gets a different, but related, explainer (2026-08-14, per explicit user
// direction that this frequency "uses similar logic and counts streaks by days" too): the schedule
// sentence above already lists *which* days are due, but not the actual streak rule -- a missed due
// day breaks the streak, while a non-due day is simply skipped (never counted as a miss), and still
// adds to the streak as a bonus if completed anyway (the same mechanic buildStatusBadge's own
// non-due-and-completed branch surfaces case-by-case, here stated as a standing rule independent of
// today). No explainer at all for a selection that collapses to "Daily" (empty or all 7 days) --
// every day is due there, so there's no non-due/bonus-day nuance to explain, matching
// getFrequencyBaseLabel's own identical "Daily" collapse rule.
//
// No task name in either branch -- the popover's own header already names the task, so repeating
// it here read as redundant (per explicit user direction).
const buildFrequencyExplainer = (task: Task): string | null => {
  if (task.frequency === 'days_per_week') {
    return `Needs ${task.daysPerWeek} days a week. As long as you reach that, your streak — always counted in days — stays alive.`;
  }
  if (task.frequency === 'days_per_month') {
    return `Needs ${task.daysPerMonth} days a month. As long as you reach that, your streak — always counted in days — stays alive.`;
  }
  if (task.frequency === 'specific_days_of_week') {
    const daysOfWeek = task.daysOfWeek ?? [];
    const isGenuineSubset = daysOfWeek.length > 0 && daysOfWeek.length < 7;
    if (!isGenuineSubset) return null;
    return 'Missing a due day breaks your streak — but completing it on any other day still counts as a bonus.';
  }
  return null;
};

export const getTaskStatusInfo = (task: Task, today: Date = new Date()): TaskStatusInfo => {
  const currentStreak = task.stats?.currentStreak ?? 0;
  const bestStreak = task.stats?.bestStreak ?? 0;
  const isOnBestStreak = bestStreak > 0 && currentStreak === bestStreak;
  const createdAtLabel = format(parseISO(task.createdAt), 'MMM d, yyyy');

  return {
    scheduleSentence: `${formatFrequencySentence(task)} Started ${createdAtLabel}.`,
    status: buildStatusBadge(task, today),
    frequencyExplainer: buildFrequencyExplainer(task),
    // No streak count here -- Status above already states it (e.g. "keeping your 5-day streak
    // going"), so repeating it here would just be the same number said twice.
    best: isOnBestStreak
      ? { icon: 'trophy', color: BEST_COLOR, text: 'This is your best streak yet!' }
      : null,
  };
};
