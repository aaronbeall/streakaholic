import { Task } from '../types';

// Free-tier cap on active (non-archived) tasks -- see MONETIZATION.md's "Pro tier" section.
// Archived tasks don't count against it, so archiving is the free-tier escape valve until
// someone buys the (not yet built) Pro unlock that removes this cap entirely.
export const MAX_ACTIVE_TASKS = 6;

export const getActiveTaskCount = (tasks: Task[]): number =>
  tasks.filter(task => !task.archived).length;

export const hasReachedActiveTaskLimit = (tasks: Task[]): boolean =>
  getActiveTaskCount(tasks) >= MAX_ACTIVE_TASKS;

export const ACTIVE_TASK_LIMIT_MESSAGE =
  `You can have up to ${MAX_ACTIVE_TASKS} active tasks. Archive one to add another.`;
