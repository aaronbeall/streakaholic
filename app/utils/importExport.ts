import { Task, TasksExport } from '../types';

export const TASKS_EXPORT_SCHEMA_VERSION = 1;

export interface LastImportRecord {
  exportId: string;
  importedAt: string;
}

export interface ParsedTasksImport {
  tasks: Task[];
  // null for legacy exports (a bare Task[] array) that predate schema/metadata.
  meta: { exportId: string; exportedAt: string; schemaVersion: number } | null;
}

export const isImportableTask = (value: unknown): value is Task =>
  typeof value === 'object' && value !== null
    && typeof (value as Task).id === 'string'
    && typeof (value as Task).name === 'string';

const generateExportId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const createTasksExport = (tasks: Task[], appVersion: string): TasksExport => ({
  schemaVersion: TASKS_EXPORT_SCHEMA_VERSION,
  exportId: generateExportId(),
  exportedAt: new Date().toISOString(),
  appVersion,
  taskCount: tasks.length,
  tasks,
});

// Future schema changes get a case here to upgrade older exports before they're used.
const migrateTasksExport = (data: TasksExport): Task[] => {
  switch (data.schemaVersion) {
    case 1:
    default:
      return data.tasks;
  }
};

export const parseTasksImport = (content: string): ParsedTasksImport => {
  const parsed: unknown = JSON.parse(content);

  // Legacy format: a bare array of tasks, no schema/metadata wrapper.
  if (Array.isArray(parsed)) {
    if (!parsed.every(isImportableTask)) throw new Error('Invalid task list');
    return { tasks: parsed, meta: null };
  }

  if (
    typeof parsed === 'object' && parsed !== null &&
    typeof (parsed as TasksExport).schemaVersion === 'number' &&
    Array.isArray((parsed as TasksExport).tasks)
  ) {
    const data = parsed as TasksExport;
    if (!data.tasks.every(isImportableTask)) throw new Error('Invalid task list');
    return {
      tasks: migrateTasksExport(data),
      meta: { exportId: data.exportId, exportedAt: data.exportedAt, schemaVersion: data.schemaVersion },
    };
  }

  throw new Error('Unrecognized file format');
};

export const getLatestModifiedAt = (tasks: Task[]): string | null =>
  tasks.reduce<string | null>((latest, task) => {
    const modifiedAt = task.updatedAt ?? task.createdAt;
    return !latest || modifiedAt > latest ? modifiedAt : latest;
  }, null);

export const mergeTaskLists = (current: Task[], incoming: Task[]): Task[] => {
  const merged = new Map(current.map(task => [task.id, task]));

  for (const incomingTask of incoming) {
    const existingTask = merged.get(incomingTask.id);
    if (!existingTask) {
      merged.set(incomingTask.id, incomingTask);
      continue;
    }

    const newer = existingTask.updatedAt >= incomingTask.updatedAt ? existingTask : incomingTask;
    const older = newer === existingTask ? incomingTask : existingTask;
    const completionsById = new Map(
      [...(older.completions ?? []), ...(newer.completions ?? [])].map(c => [c.id, c])
    );

    merged.set(incomingTask.id, { ...newer, completions: Array.from(completionsById.values()) });
  }

  return Array.from(merged.values());
};
