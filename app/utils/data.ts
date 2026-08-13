import { addDays, format, parseISO, setHours, startOfDay, subDays, subMonths, subYears } from 'date-fns';
import { Task, TaskCompletion, TaskStats } from '../types';

export type TimeFrame = 'week' | 'month' | 'year' | 'all';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface CompletionPatterns {
  dayOfWeekData: number[];
  hourOfDayData: number[];
}

export interface ChartData {
  labels: string[];
  data: number[];
}

export interface StreakStats {
  upToDate: number;
  expiring: number;
}

export const dayOfWeekLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const hourOfDayLabels = Array.from({ length: 24 }, (_, i) => {
  if (i % 6 === 0) { // Show every 6 hours
    const hour = i === 0 || i === 12 ? 12 : i % 12;
    const ampm = i < 12 ? 'am' : 'pm';
    return `${hour}${ampm}`;
  }
  return '';
});

// react-native-chart-kit's BarChart draws every bar at a fixed 32px width times `chartConfig`'s
// `barPercentage` (which defaults to 1 if unset) -- a flat pixel width with no awareness of the
// chart's own rendered width or how many bars it's holding. That's fine for a 7-bar day-of-week
// chart in a typical phone-width chart (each bar's own ~49px slot comfortably fits a 32px bar),
// but the exact same fixed 32px bar in a 24-bar hour-of-day chart of the same width (~14px slots)
// massively overlaps its neighbors. This derives `barPercentage` from the chart's actual measured
// width and its own bar count instead, so a bar always fills a consistent fraction of its own
// slot regardless of how many bars there are. Capped at 1 (never *wider* than the library's own
// 32px default) so an already-fine chart like day-of-week doesn't change from how it looks today.
export const getBarPercentage = (chartWidth: number, barCount: number, fillFraction = 0.7): number => {
  if (chartWidth <= 0 || barCount <= 0) {
    return 1;
  }
  const BASE_BAR_WIDTH = 32;
  const slotWidth = chartWidth / barCount;
  return Math.min(1, (slotWidth * fillFraction) / BASE_BAR_WIDTH);
};

export const getDateRange = (timeFrame: TimeFrame, tasks: Task[]): DateRange => {
  const end = startOfDay(new Date());
  
  if (timeFrame === 'all') {
    // Find earliest completion date across all tasks
    let minDate = new Date();
    let hasCompletions = false;

    tasks.forEach(task => {
      task.completions?.forEach(completion => {
        const completionDate = parseISO(completion.date);
        if (completionDate < minDate) minDate = completionDate;
        hasCompletions = true;
      });
    });

    // If no completions, default to last 30 days
    if (!hasCompletions) {
      return { start: subDays(end, 30), end };
    }

    return { 
      start: startOfDay(minDate),
      end
    };
  }

  switch (timeFrame) {
    case 'week':
      return { start: subDays(end, 7), end };
    case 'month':
      return { start: subMonths(end, 1), end };
    case 'year':
      return { start: subYears(end, 1), end };
    default:
      return { start: new Date(0), end };
  }
};

export const getCompletionPatterns = (
  range: DateRange,
  completions: TaskCompletion[]
): CompletionPatterns => {
  const dayOfWeekData = Array(7).fill(0);
  const hourOfDayData = Array(24).fill(0);

  completions.forEach(completion => {
    // Use date for temporal position, but get hours from completedAt
    const date = setHours(parseISO(completion.date), new Date(completion.completedAt).getHours());
    if (date >= range.start && date <= range.end) {
      // Day of week (0 = Sunday, 6 = Saturday)
      dayOfWeekData[date.getDay()] += completion.timesCompleted;
      // Hour of day (0-23)
      hourOfDayData[date.getHours()] += completion.timesCompleted;
    }
  });

  return { dayOfWeekData, hourOfDayData };
};

export const getChartData = (
  timeFrame: TimeFrame,
  completions: TaskCompletion[],
  isCumulative: boolean = false
): ChartData => {
  const today = new Date();
  let startDate: Date;
  let labels: string[] = [];
  let data: number[] = [];
  let groupSize = 1; // Default group size

  switch (timeFrame) {
    case 'week':
      startDate = subDays(today, 6); // 7 days including today
      labels = Array.from({ length: 7 }, (_, i) => {
        const date = subDays(today, i); // Start from today and go backwards
        return format(date, 'EEE');
      }).reverse(); // Reverse to maintain left-to-right order
      data = Array(7).fill(0);
      break;
    case 'month':
      startDate = subDays(today, 29); // 30 days including today
      labels = Array.from({ length: 30 }, (_, i) => {
        const date = subDays(today, i); // Start from today and go backwards
        return i % 5 === 0 ? format(date, 'MMM d') : '';
      }).reverse(); // Reverse to maintain left-to-right order
      data = Array(30).fill(0);
      break;
    case 'year':
      startDate = subMonths(today, 11); // 12 months including current month
      labels = Array.from({ length: 12 }, (_, i) => {
        const date = subMonths(today, i); // Start from today and go backwards
        return format(date, 'MMM');
      }).reverse(); // Reverse to maintain left-to-right order
      data = Array(12).fill(0);
      break;
    case 'all':
      // Find first and last completion dates
      const completionDates = completions.map(c => parseISO(c.date));
      if (completionDates.length === 0) {
        startDate = subDays(today, 30);
      } else {
        startDate = new Date(Math.min(...completionDates.map(d => d.getTime())));
      }
      
      const totalDays = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      let dateFormat: string;

      if (totalDays <= 30) {
        // If less than a month, show daily
        groupSize = 1;
        dateFormat = 'MMM d';
      } else if (totalDays <= 90) {
        // If less than 3 months, show weekly
        groupSize = 7;
        dateFormat = 'MMM d';
      } else if (totalDays <= 365) {
        // If less than a year, show monthly
        groupSize = 30;
        dateFormat = 'MMM';
      } else {
        // If more than a year, show quarterly
        groupSize = 90;
        dateFormat = 'MMM yyyy';
      }

      const numGroups = Math.ceil(totalDays / groupSize);
      const midPoint = Math.floor(numGroups / 2);
      
      labels = Array.from({ length: numGroups }, (_, i) => {
        if (i === 0 || i === midPoint || i === numGroups - 1) {
          const date = addDays(startDate, i * groupSize);
          return format(date, dateFormat);
        }
        return '';
      });
      data = Array(numGroups).fill(0);
      break;
  }

  completions.forEach(completion => {
    const date = parseISO(completion.date);
    if (date >= startDate && date <= today) {
      const index = timeFrame === 'week' 
        ? 6 - Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
        : timeFrame === 'month'
        ? 29 - Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
        : timeFrame === 'year'
        ? 11 - Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 30))
        : Math.floor((date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * groupSize));
      if (index >= 0 && index < data.length) {
        data[index] += completion.timesCompleted;
      }
    }
  });

  // Convert to cumulative if needed
  if (isCumulative) {
    let runningTotal = 0;
    data = data.map(value => {
      runningTotal += value;
      return runningTotal;
    });
  }

  return { labels, data };
};

export const calculateAggregateStats = (tasks: Task[]): TaskStats => {
  const stats: TaskStats = {
    totalCompletions: 0,
    completionRate: 0,
    currentStreak: 0,
    bestStreak: 0,
    streakStatus: 'never_started',
    lastStreak: 0,
  };

  // completionRate is accumulated as a sum + count and averaged once at the end -- a true mean
  // across tasks, not a running average. The previous version reassigned
  // `stats.completionRate = (stats.completionRate + task.stats.completionRate) / 2` on every
  // iteration, which blends the running result 50/50 with just the *next* task's rate each time --
  // that's not equivalent to `sum / count` for more than two tasks, systematically overweights
  // later tasks over earlier ones, and (worse) makes the result depend on array order, which a
  // "rate" stat never should. Fixed 2026-08-13 per direct user report.
  let completionRateSum = 0;
  let statsCount = 0;

  tasks.forEach(task => {
    if (task.stats) {
      stats.totalCompletions += task.completions?.length || 0;
      completionRateSum += task.stats.completionRate;
      statsCount++;
      stats.currentStreak = Math.max(stats.currentStreak, task.stats.currentStreak);
      stats.bestStreak = Math.max(stats.bestStreak, task.stats.bestStreak);
    }
  });

  stats.completionRate = statsCount > 0 ? completionRateSum / statsCount : 0;

  return stats;
};

export const getDateRangeLabel = (range: DateRange): string => {
  const startYear = range.start.getFullYear();
  const endYear = range.end.getFullYear();
  const startMonth = range.start.getMonth();
  const endMonth = range.end.getMonth();
  const startDay = range.start.getDate();
  const endDay = range.end.getDate();

  // If same year and month, only show day range
  if (startYear === endYear && startMonth === endMonth) {
    return `${format(range.start, 'MMM d')} - ${endDay}`;
  }
  
  // If same year but different months, show month and day
  if (startYear === endYear) {
    return `${format(range.start, 'MMM d')} - ${format(range.end, 'MMM d')}`;
  }
  
  // If different years, show full date
  return `${format(range.start, 'MMM d, yyyy')} - ${format(range.end, 'MMM d, yyyy')}`;
};

export const getStreakStats = (tasks: Task[]): StreakStats => {
  return tasks.reduce((acc, task) => {
    if (task.stats?.streakStatus === 'up_to_date' && task.stats.currentStreak > 0) {
      acc.upToDate++;
    } else if (task.stats?.streakStatus === 'expiring' && task.stats.currentStreak > 0) {
      acc.expiring++;
    }
    return acc;
  }, { upToDate: 0, expiring: 0 });
}; 