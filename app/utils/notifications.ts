import { addDays, set, startOfDay } from 'date-fns';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Task } from '../types';
import { isDueOnDate, isTaskCompleted } from './streaks';

// Escalation levels, matching TODO.md's own wording exactly:
// 0=none, 1=one dismissible notification, 2=repeated dismissible notifications,
// 3=ongoing (non-dismissable) notification, 4=alarm-style + ongoing.
//
// Only level 4 gets its own Android channel -- `sticky`/`autoDismiss` are per-notification
// content flags (already vary freely within one channel), but importance/vibration are
// channel-level and fixed at channel-creation time, so level 4's louder/more insistent
// treatment genuinely needs a separate channel from 1-3's shared one.
const REMINDER_CHANNEL_ID = 'reminders';
const ALARM_CHANNEL_ID = 'reminders-alarm';

// Level 2's follow-up nags: this many, this far apart by default. The interval itself is a
// per-task, user-editable setting (TaskNotificationSettings.nagIntervalMinutes) -- this is only
// the fallback for a task that hasn't set one (and the value AddTaskScreen prefills for a new task).
const NAG_MAX_REPEATS = 3;
export const DEFAULT_NAG_INTERVAL_MINUTES = 30;

// How many days ahead to look for the next due day -- 8 is enough for any specific_days_of_week
// selection (the worst case is "due every 7th day"); daily/quota frequencies resolve on day 0 or 1.
const LOOKAHEAD_DAYS = 8;

// Deterministic identifiers mean nothing needs to be persisted to know what's currently scheduled
// for a task -- cancelling/dismissing a nonexistent identifier is a safe no-op, so a task's own id
// is always enough to find and clear everything it might have scheduled.
const mainIdentifier = (taskId: string): string => `reminder:${taskId}`;
const nagIdentifier = (taskId: string, n: number): string => `reminder:${taskId}:nag${n}`;
const allIdentifiersFor = (taskId: string): string[] => [
  mainIdentifier(taskId),
  ...Array.from({ length: NAG_MAX_REPEATS }, (_, i) => nagIdentifier(taskId, i + 1)),
];

// Pure and unit-tested (mirrors streaks.ts/achievements.ts's no-native-imports testability
// constraint) -- everything below this point touches the native Notifications API and can only be
// verified on-device.
//
// Returns the next moment this task should remind, or null if it shouldn't remind at all right
// now (off, archived, or nothing due within the lookahead window). Reuses isDueOnDate/
// isTaskCompleted (streaks.ts) rather than re-deriving due-ness, so a reminder's schedule always
// agrees with what the rest of the app already considers "due."
//
// Deliberate simplification: if today is due, not yet completed, but the configured time has
// already passed, this rolls to the next due day rather than firing "right now" -- avoids a
// surprise buzz the instant the app happens to be opened later in the day. The tradeoff is a
// reminder that's silent for the rest of an already-past-time day, which reads as more predictable
// ("reminds me at 9am") than "nags me whenever I next open the app."
export const getNextReminderOccurrence = (task: Task, now: Date): Date | null => {
  if (!task.notifications || task.notifications.level === 0 || task.archived) return null;

  const [hoursStr, minutesStr] = task.notifications.time.split(':');
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  for (let dayOffset = 0; dayOffset < LOOKAHEAD_DAYS; dayOffset++) {
    const candidateDay = addDays(startOfDay(now), dayOffset);
    if (!isDueOnDate(task, candidateDay)) continue;

    const reminderTime = set(candidateDay, { hours, minutes, seconds: 0, milliseconds: 0 });

    if (dayOffset === 0) {
      // Known, accepted simplification: for days_per_week/days_per_month tasks, isDueOnDate
      // already returns true unconditionally (its own existing, documented behavior) -- a
      // reminder can still fire on a day after that period's quota is already met. Matches how
      // "due" already works everywhere else in this app; not worth a new special case here.
      if (isTaskCompleted(task, now)) continue;
      if (reminderTime <= now) continue;
    }

    return reminderTime;
  }

  return null;
};

let channelsEnsured = false;

const ensureNotificationChannels = async (): Promise<void> => {
  if (Platform.OS !== 'android' || channelsEnsured) return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_ID, {
    name: 'Alarm Reminders',
    importance: Notifications.AndroidImportance.MAX,
    enableVibrate: true,
    vibrationPattern: [0, 500, 250, 500, 250, 500],
  });
  channelsEnsured = true;
};

export const ensureNotificationPermissions = async (): Promise<boolean> => {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
};

// Cancels + dismisses every identifier this task could possibly have scheduled or delivered,
// unconditionally -- safe even if fewer than that were actually posted (e.g. a level-1 task never
// had any nag identifiers to begin with).
export const cancelTaskNotifications = async (taskId: string): Promise<void> => {
  await Promise.all(
    allIdentifiersFor(taskId).map(async identifier => {
      await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
      await Notifications.dismissNotificationAsync(identifier).catch(() => undefined);
    })
  );
};

// Always cancels this task's existing scheduled/delivered notifications first, then -- if the task
// still wants one -- schedules only the single next due-and-incomplete occurrence (plus level 2's
// follow-up nags). Called after every task mutation that could affect what should be reminding
// (create/edit/complete/undo/archive/restore) and again in a bulk sweep on app foreground/hydrate,
// so a task's reminders are always recomputed fresh rather than relying on long-lived OS-level
// recurring triggers that are harder to cancel per-day.
export const scheduleTaskNotifications = async (task: Task): Promise<void> => {
  await cancelTaskNotifications(task.id);

  if (!task.notifications || task.notifications.level === 0 || task.archived) return;

  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;

  const nextOccurrence = getNextReminderOccurrence(task, new Date());
  if (!nextOccurrence) return;

  await ensureNotificationChannels();

  const level = task.notifications.level;
  const isOngoing = level >= 3;
  const channelId = level === 4 ? ALARM_CHANNEL_ID : REMINDER_CHANNEL_ID;

  await Notifications.scheduleNotificationAsync({
    identifier: mainIdentifier(task.id),
    content: {
      title: `Time for "${task.name}"`,
      body: isOngoing
        ? `"${task.name}" is still waiting on you today.`
        : `Don't forget to complete "${task.name}" today.`,
      sticky: isOngoing,
      autoDismiss: !isOngoing,
      data: { taskId: task.id },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nextOccurrence, channelId },
  });

  if (level === 2) {
    const intervalMinutes = task.notifications.nagIntervalMinutes ?? DEFAULT_NAG_INTERVAL_MINUTES;
    for (let n = 1; n <= NAG_MAX_REPEATS; n++) {
      const nagTime = new Date(nextOccurrence.getTime() + n * intervalMinutes * 60 * 1000);
      await Notifications.scheduleNotificationAsync({
        identifier: nagIdentifier(task.id, n),
        content: {
          title: `Still haven't done "${task.name}"?`,
          body: `A friendly nudge -- "${task.name}" is still on today's list.`,
          sticky: false,
          autoDismiss: true,
          data: { taskId: task.id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nagTime, channelId },
      });
    }
  }
};

// The self-healing bulk pass -- called alongside taskStore's maybeRefreshStats on hydrate/app
// foreground. Recovers a task's "next occurrence" after a previously-scheduled one has already
// fired while the app was closed (nothing ran to schedule its successor), and self-heals across a
// calendar-day rollover. Cheap enough (cancel+reschedule for a handful of tasks) that it doesn't
// need maybeRefreshStats's own once-per-day dedup guard.
export const rescheduleAllTaskNotifications = async (tasks: Task[]): Promise<void> => {
  await Promise.all(tasks.filter(task => !task.archived).map(task => scheduleTaskNotifications(task)));
};
