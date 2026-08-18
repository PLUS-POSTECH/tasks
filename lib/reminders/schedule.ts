import { addCalendarDays, calendarDateIn, zonedDateTimeToInstant } from "@/lib/formatting/calendar-date";

const minute = 60_000;
const minutesPerDay = 24 * 60;

/**
 * `leadMinutes` is how long before the deadline the series starts (null starts
 * it at once), `repeatEveryMinutes` the gap between posts until the deadline
 * (null posts once). "1 day before" is 1440 and no repeat.
 */
export type ReminderCadence = {
  readonly leadMinutes: number | null;
  readonly repeatEveryMinutes: number | null;
};

export type ReminderTiming = ReminderCadence & {
  /** Deadline time on the due date, HH:MM. */
  readonly timeOfDay: string;
  readonly dueDate: string | null;
  readonly timeZone: string;
};

const humanInterval = (minutes: number): string => {
  if (minutes % (7 * minutesPerDay) === 0) {
    const weeks = minutes / (7 * minutesPerDay);
    return weeks === 1 ? "week" : `${weeks} weeks`;
  }
  if (minutes % minutesPerDay === 0) {
    const days = minutes / minutesPerDay;
    return days === 1 ? "day" : `${days} days`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "hour" : `${hours} hours`;
  }
  return minutes === 1 ? "minute" : `${minutes} minutes`;
};

/** How the cadence reads in the UI, e.g. "1 day before, every 6 hours". */
export const describeReminderCadence = (cadence: ReminderCadence): string => {
  const start =
    cadence.leadMinutes === null
      ? "From now"
      : cadence.leadMinutes === 0
        ? "At the deadline"
        : `${humanInterval(cadence.leadMinutes)} before`.replace(/^(week|day|hour|minute) /, "1 $1 ");
  return cadence.repeatEveryMinutes === null ? start : `${start}, every ${humanInterval(cadence.repeatEveryMinutes)}`;
};

/**
 * Walked as calendar days so the occurrences keep the same clock time when the
 * workspace's time zone changes offset.
 */
const nextWholeDayRun = (timing: ReminderTiming, dueDate: string, deadline: Date, after: Date): Date | null => {
  const everyDays = (timing.repeatEveryMinutes ?? minutesPerDay) / minutesPerDay;
  const today = calendarDateIn(after, timing.timeZone);
  const startDate =
    timing.leadMinutes === null ? today : addCalendarDays(dueDate, -Math.floor(timing.leadMinutes / minutesPerDay));
  let date = startDate < today ? today : startDate;
  // Keep the series aligned to its start, not to whichever day we resumed on.
  const elapsedDays = Math.round((Date.parse(date) - Date.parse(startDate)) / 86_400_000);
  const offset = ((elapsedDays % everyDays) + everyDays) % everyDays;
  if (offset !== 0) {
    date = addCalendarDays(date, everyDays - offset);
  }
  while (date <= dueDate) {
    const candidate = zonedDateTimeToInstant(date, timing.timeOfDay, timing.timeZone);
    if (candidate.getTime() > after.getTime() && candidate.getTime() <= deadline.getTime()) {
      return candidate;
    }
    date = addCalendarDays(date, everyDays);
  }
  return null;
};

/** Strictly after `after`; null when no due date or every occurrence has passed. */
export const computeNextRunAt = (timing: ReminderTiming, after: Date): Date | null => {
  const { dueDate } = timing;
  if (!dueDate) {
    return null;
  }
  const deadline = zonedDateTimeToInstant(dueDate, timing.timeOfDay, timing.timeZone);
  if (timing.repeatEveryMinutes === null) {
    const at = deadline.getTime() - (timing.leadMinutes ?? 0) * minute;
    return at > after.getTime() ? new Date(at) : null;
  }
  if (timing.repeatEveryMinutes % minutesPerDay === 0) {
    return nextWholeDayRun(timing, dueDate, deadline, after);
  }
  const step = timing.repeatEveryMinutes * minute;
  const deadlineMilliseconds = deadline.getTime();
  const afterMilliseconds = after.getTime();
  if (afterMilliseconds >= deadlineMilliseconds) {
    return null;
  }
  // Occurrences count back from the deadline, so the last one lands on it.
  let candidate = deadlineMilliseconds - Math.floor((deadlineMilliseconds - afterMilliseconds) / step) * step;
  if (candidate <= afterMilliseconds) {
    candidate += step;
  }
  const earliest =
    timing.leadMinutes === null
      ? Number.NEGATIVE_INFINITY
      : deadlineMilliseconds - Math.floor((timing.leadMinutes * minute) / step) * step;
  return new Date(Math.max(candidate, earliest));
};

export const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};
