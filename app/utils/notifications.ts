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
const REMINDER_IDENTIFIER_PREFIX = 'reminder:';
const REMINDER_INTENT_DATA_KEY = 'reminderIntentKey';
const REMINDER_INTENT_VERSION = 1;

interface ReminderIntent {
  identifier: string;
  intentKey: string;
  content: Notifications.NotificationContentInput;
  trigger: Notifications.DateTriggerInput;
}

interface ReminderSnapshot {
  scheduledIntentById: Map<string, string | undefined>;
  presentedIds: Set<string>;
}

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

const buildIntentKey = (
  task: Task,
  identifier: string,
  scheduledFor: Date,
  level: number
): string => JSON.stringify([
  REMINDER_INTENT_VERSION,
  identifier,
  task.id,
  task.name,
  scheduledFor.getTime(),
  level,
]);

// Pure description of exactly what should be installed for one task. Its compact intent key is
// stored in each native notification's data, avoiding comparisons against platform-normalized
// trigger objects (whose Android/iOS shapes differ after Expo reads them back). Fields that don't
// affect notification content or timing -- task color, icon, stats, a partial multi-rep completion
// -- deliberately don't enter the key, so those mutations no longer churn identical reminders.
export const getReminderIntents = (task: Task, now: Date): ReminderIntent[] => {
  const nextOccurrence = getNextReminderOccurrence(task, now);
  if (!nextOccurrence || !task.notifications || task.notifications.level === 0 || task.archived) return [];

  const level = task.notifications.level;
  const isOngoing = level >= 3;
  const channelId = level === 4 ? ALARM_CHANNEL_ID : REMINDER_CHANNEL_ID;
  const mainId = mainIdentifier(task.id);
  const mainIntentKey = buildIntentKey(task, mainId, nextOccurrence, level);
  const intents: ReminderIntent[] = [{
    identifier: mainId,
    intentKey: mainIntentKey,
    content: {
      title: `Time for "${task.name}"`,
      body: isOngoing
        ? `"${task.name}" is still waiting on you today.`
        : `Don't forget to complete "${task.name}" today.`,
      sticky: isOngoing,
      autoDismiss: !isOngoing,
      data: { taskId: task.id, [REMINDER_INTENT_DATA_KEY]: mainIntentKey },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nextOccurrence, channelId },
  }];

  if (level === 2) {
    const intervalMinutes = task.notifications.nagIntervalMinutes ?? DEFAULT_NAG_INTERVAL_MINUTES;
    for (let n = 1; n <= NAG_MAX_REPEATS; n++) {
      const scheduledFor = new Date(nextOccurrence.getTime() + n * intervalMinutes * 60 * 1000);
      const identifier = nagIdentifier(task.id, n);
      const intentKey = buildIntentKey(task, identifier, scheduledFor, level);
      intents.push({
        identifier,
        intentKey,
        content: {
          title: `Still haven't done "${task.name}"?`,
          body: `A friendly nudge -- "${task.name}" is still on today's list.`,
          sticky: false,
          autoDismiss: true,
          data: { taskId: task.id, [REMINDER_INTENT_DATA_KEY]: intentKey },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: scheduledFor, channelId },
      });
    }
  }

  return intents;
};

let channelsEnsured = false;
let observedPermissionGranted: boolean | null = null;

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
  if (current.granted) {
    observedPermissionGranted = true;
    return true;
  }
  if (!current.canAskAgain) {
    observedPermissionGranted = false;
    return false;
  }
  const requested = await Notifications.requestPermissionsAsync();
  observedPermissionGranted = requested.granted;
  return requested.granted;
};

let observedSnapshot: ReminderSnapshot | null = null;
let notificationWorkQueue: Promise<void> = Promise.resolve();

// Native notification mutation is serialized. Besides making the in-memory snapshot trustworthy,
// this prevents a rapid complete -> undo (or two quick edits) from letting an older asynchronous
// cancel/schedule operation finish after the newer desired state and overwrite it.
const enqueueNotificationWork = <T>(work: () => Promise<T>): Promise<T> => {
  const result = notificationWorkQueue.then(work, work);
  notificationWorkQueue = result.then(() => undefined, () => undefined);
  return result;
};

const isReminderIdentifier = (identifier: string): boolean => identifier.startsWith(REMINDER_IDENTIFIER_PREFIX);

const intentKeyFrom = (request: Notifications.NotificationRequest): string | undefined => {
  const value = request.content.data?.[REMINDER_INTENT_DATA_KEY];
  return typeof value === 'string' ? value : undefined;
};

const readNativeSnapshot = async (): Promise<ReminderSnapshot> => {
  const [scheduled, presented] = await Promise.all([
    Notifications.getAllScheduledNotificationsAsync(),
    Notifications.getPresentedNotificationsAsync(),
  ]);
  return {
    scheduledIntentById: new Map(
      scheduled
        .filter(request => isReminderIdentifier(request.identifier))
        .map(request => [request.identifier, intentKeyFrom(request)] as const)
    ),
    presentedIds: new Set(
      presented
        .map(notification => notification.request.identifier)
        .filter(isReminderIdentifier)
    ),
  };
};

const getObservedSnapshot = async (refresh = false): Promise<ReminderSnapshot> => {
  if (refresh || !observedSnapshot) observedSnapshot = await readNativeSnapshot();
  return observedSnapshot;
};

const taskHasNativeReminder = (snapshot: ReminderSnapshot, taskId: string): boolean =>
  allIdentifiersFor(taskId).some(identifier =>
    snapshot.scheduledIntentById.has(identifier) || snapshot.presentedIds.has(identifier)
  );

const intentMatchesSnapshot = (
  snapshot: ReminderSnapshot,
  taskId: string,
  intents: ReminderIntent[]
): boolean => {
  const desiredById = new Map(intents.map(intent => [intent.identifier, intent.intentKey] as const));
  return allIdentifiersFor(taskId).every(identifier =>
    !snapshot.presentedIds.has(identifier) &&
    (desiredById.has(identifier)
      ? snapshot.scheduledIntentById.get(identifier) === desiredById.get(identifier)
      : !snapshot.scheduledIntentById.has(identifier))
  );
};

const removeTaskFromSnapshot = (snapshot: ReminderSnapshot, taskId: string): void => {
  for (const identifier of allIdentifiersFor(taskId)) {
    snapshot.scheduledIntentById.delete(identifier);
    snapshot.presentedIds.delete(identifier);
  }
};

const cancelIdentifier = async (identifier: string): Promise<void> => {
  await Promise.all([
    Notifications.cancelScheduledNotificationAsync(identifier),
    Notifications.dismissNotificationAsync(identifier),
  ]);
};

const cancelTaskNotificationsInternal = async (
  taskId: string,
  snapshot: ReminderSnapshot
): Promise<void> => {
  if (!taskHasNativeReminder(snapshot, taskId)) return;
  await Promise.all(
    allIdentifiersFor(taskId).map(cancelIdentifier)
  );
  removeTaskFromSnapshot(snapshot, taskId);
};

const reconcileTaskNotifications = async (
  task: Task,
  snapshot: ReminderSnapshot,
  now: Date,
  permissionGranted?: boolean
): Promise<void> => {
  let intents = getReminderIntents(task, now);
  if (intents.length > 0) {
    const granted = permissionGranted
      ?? observedPermissionGranted
      ?? (await Notifications.getPermissionsAsync()).granted;
    observedPermissionGranted = granted;
    if (!granted) intents = [];
  }

  if (intentMatchesSnapshot(snapshot, task.id, intents)) return;

  await cancelTaskNotificationsInternal(task.id, snapshot);
  if (intents.length === 0) return;

  await ensureNotificationChannels();
  for (const intent of intents) {
    await Notifications.scheduleNotificationAsync({
      identifier: intent.identifier,
      content: intent.content,
      trigger: intent.trigger,
    });
    snapshot.scheduledIntentById.set(intent.identifier, intent.intentKey);
  }
};

// Cancels only when the native snapshot says this task actually has a scheduled or presented
// reminder. Delete/archive calls therefore remain self-healing without issuing eight native no-op
// calls for tasks that never had notifications installed.
export const cancelTaskNotifications = (taskId: string): Promise<void> =>
  enqueueNotificationWork(async () => {
    const snapshot = await getObservedSnapshot();
    try {
      await cancelTaskNotificationsInternal(taskId, snapshot);
    } catch (error) {
      observedSnapshot = null;
      throw error;
    }
  });

// Reconciles one task against the last observed native state. Ordinary mutations reuse the
// in-memory snapshot populated by hydration/foreground recovery, so an unchanged intent performs
// no native query, cancellation, dismissal, or scheduling call.
export const scheduleTaskNotifications = (task: Task): Promise<void> =>
  enqueueNotificationWork(async () => {
    const snapshot = await getObservedSnapshot();
    try {
      await reconcileTaskNotifications(task, snapshot, new Date());
    } catch (error) {
      observedSnapshot = null;
      throw error;
    }
  });

// Self-healing bulk pass for hydration/app foreground. It refreshes the snapshot from the OS once,
// cleans up orphaned reminder identifiers, then changes only tasks whose desired keys differ from
// what is actually scheduled/presented. This still recovers fired, externally removed, legacy
// (pre-intent-key), permission-revoked, and day-rollover state without blanket native churn.
export const rescheduleAllTaskNotifications = (tasks: Task[]): Promise<void> =>
  enqueueNotificationWork(async () => {
    const snapshot = await getObservedSnapshot(true);
    const validIdentifiers = new Set(tasks.flatMap(task => allIdentifiersFor(task.id)));
    const actualIdentifiers = new Set([
      ...snapshot.scheduledIntentById.keys(),
      ...snapshot.presentedIds,
    ]);

    try {
      for (const identifier of actualIdentifiers) {
        if (validIdentifiers.has(identifier)) continue;
        await cancelIdentifier(identifier);
        snapshot.scheduledIntentById.delete(identifier);
        snapshot.presentedIds.delete(identifier);
      }

      const now = new Date();
      // Refresh permission alongside the OS snapshot on every hydration/foreground recovery. The
      // result is then reused by ordinary mutations, avoiding a permission native call per task
      // update while still noticing grants/revocations made in system settings when focus returns.
      const permissionGranted = (await Notifications.getPermissionsAsync()).granted;
      observedPermissionGranted = permissionGranted;
      for (const task of tasks) {
        await reconcileTaskNotifications(task, snapshot, now, permissionGranted);
      }
    } catch (error) {
      observedSnapshot = null;
      throw error;
    }
  });
