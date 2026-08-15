import { format } from 'date-fns';
import * as Notifications from 'expo-notifications';
import { Task, TaskCompletion } from '../../app/types';
import {
  getReminderIntents,
  rescheduleAllTaskNotifications,
  scheduleTaskNotifications,
} from '../../app/utils/notifications';

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3, MAX: 5 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  getPresentedNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  dismissNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
}));

const notificationMocks = Notifications as jest.Mocked<typeof Notifications>;
const nativeScheduled = new Map<string, Notifications.NotificationRequest>();
const nativePresented = new Map<string, Notifications.Notification>();

const NOW = new Date(2026, 7, 13, 12, 0, 0);

const makeCompletion = (timesCompleted: number): TaskCompletion => ({
  id: 'completion-1',
  taskId: 'task-1',
  date: format(NOW, 'yyyy-MM-dd'),
  completedAt: NOW.toISOString(),
  timesCompleted,
});

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  name: 'Test Task',
  icon: 'fire',
  color: '#ff0000',
  frequency: 'daily',
  daysOfWeek: [],
  daysPerWeek: 0,
  daysPerMonth: 0,
  timesPerDay: 1,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  completions: [],
  notifications: { level: 1, time: '17:00' },
  ...overrides,
});

describe('notification intent reconciliation', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    nativeScheduled.clear();
    nativePresented.clear();
    jest.clearAllMocks();

    notificationMocks.getPermissionsAsync.mockResolvedValue({ granted: true } as never);
    notificationMocks.getAllScheduledNotificationsAsync.mockImplementation(async () => [...nativeScheduled.values()]);
    notificationMocks.getPresentedNotificationsAsync.mockImplementation(async () => [...nativePresented.values()]);
    notificationMocks.cancelScheduledNotificationAsync.mockImplementation(async identifier => {
      nativeScheduled.delete(identifier);
    });
    notificationMocks.dismissNotificationAsync.mockImplementation(async identifier => {
      nativePresented.delete(identifier);
    });
    notificationMocks.scheduleNotificationAsync.mockImplementation(async request => {
      const identifier = request.identifier!;
      nativeScheduled.set(identifier, {
        identifier,
        content: request.content as Notifications.NotificationContent,
        trigger: request.trigger as Notifications.NotificationTrigger,
      });
      return identifier;
    });
    notificationMocks.setNotificationChannelAsync.mockResolvedValue(null as never);

    // Force the module's process-local snapshot to the empty mocked native state before each test.
    await rescheduleAllTaskNotifications([]);
    jest.clearAllMocks();
  });

  it('keeps the same intent for changes that do not affect reminder content or timing', () => {
    const task = makeTask({ timesPerDay: 2 });
    const original = getReminderIntents(task, NOW);
    const cosmeticEdit = getReminderIntents({ ...task, color: '#00ff00', icon: 'star' }, NOW);
    const partialCompletion = getReminderIntents({ ...task, completions: [makeCompletion(1)] }, NOW);

    expect(cosmeticEdit.map(intent => intent.intentKey)).toEqual(original.map(intent => intent.intentKey));
    expect(partialCompletion.map(intent => intent.intentKey)).toEqual(original.map(intent => intent.intentKey));
  });

  it('changes intent when completion moves the next reminder to another day', () => {
    const before = getReminderIntents(makeTask(), NOW);
    const after = getReminderIntents(makeTask({ completions: [makeCompletion(1)] }), NOW);

    expect(after[0].intentKey).not.toBe(before[0].intentKey);
    expect((after[0].trigger.date as Date).getTime()).toBeGreaterThan((before[0].trigger.date as Date).getTime());
  });

  it('does no native work when an ordinary mutation leaves the installed intent unchanged', async () => {
    const task = makeTask({ timesPerDay: 2 });
    await scheduleTaskNotifications(task);
    jest.clearAllMocks();

    await scheduleTaskNotifications({ ...task, completions: [makeCompletion(1)] });

    expect(notificationMocks.getAllScheduledNotificationsAsync).not.toHaveBeenCalled();
    expect(notificationMocks.getPresentedNotificationsAsync).not.toHaveBeenCalled();
    expect(notificationMocks.getPermissionsAsync).not.toHaveBeenCalled();
    expect(notificationMocks.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(notificationMocks.dismissNotificationAsync).not.toHaveBeenCalled();
    expect(notificationMocks.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('replaces reminders when a completion changes the desired occurrence', async () => {
    const task = makeTask();
    await scheduleTaskNotifications(task);
    jest.clearAllMocks();

    await scheduleTaskNotifications({ ...task, completions: [makeCompletion(1)] });

    expect(notificationMocks.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(4);
    expect(notificationMocks.dismissNotificationAsync).toHaveBeenCalledTimes(4);
    expect(notificationMocks.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('uses a foreground snapshot to repair a reminder removed outside the app', async () => {
    const task = makeTask();
    await scheduleTaskNotifications(task);
    nativeScheduled.clear();
    jest.clearAllMocks();

    await rescheduleAllTaskNotifications([task]);

    expect(notificationMocks.getAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(notificationMocks.getPresentedNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(notificationMocks.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('does not replace a matching reminder during foreground recovery', async () => {
    const task = makeTask();
    await scheduleTaskNotifications(task);
    jest.clearAllMocks();

    await rescheduleAllTaskNotifications([task]);

    expect(notificationMocks.getAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(notificationMocks.getPresentedNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(notificationMocks.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(notificationMocks.dismissNotificationAsync).not.toHaveBeenCalled();
    expect(notificationMocks.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('replaces a legacy reminder that has no intent key', async () => {
    const task = makeTask();
    nativeScheduled.set('reminder:task-1', {
      identifier: 'reminder:task-1',
      content: { title: 'Old reminder', data: { taskId: task.id } } as unknown as Notifications.NotificationContent,
      trigger: { type: 'date', value: NOW.getTime() } as never,
    });

    await rescheduleAllTaskNotifications([task]);

    expect(notificationMocks.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(4);
    expect(notificationMocks.dismissNotificationAsync).toHaveBeenCalledTimes(4);
    expect(notificationMocks.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('clears an installed reminder when permission was revoked while the app was away', async () => {
    const task = makeTask();
    await scheduleTaskNotifications(task);
    jest.clearAllMocks();
    notificationMocks.getPermissionsAsync.mockResolvedValue({ granted: false } as never);

    await rescheduleAllTaskNotifications([task]);

    expect(notificationMocks.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(4);
    expect(notificationMocks.dismissNotificationAsync).toHaveBeenCalledTimes(4);
    expect(notificationMocks.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
