import { calendarDateIn, calendarDaysBetween } from "./calendar-date";

const millisecondsPerMinute = 60_000;
const millisecondsPerHour = 60 * millisecondsPerMinute;
const millisecondsPerDay = 24 * millisecondsPerHour;

export type DateFormatOptions = {
  /** IANA time zone; defaults to the runtime's local zone. */
  readonly timeZone?: string;
};

/** "2m", "3h", "5d", "Mar 4" style relative stamps used in dense lists. */
export const formatCompactRelativeTime = (
  date: Date,
  options: DateFormatOptions = {},
): string => {
  const now = new Date();
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < millisecondsPerMinute) {
    return "now";
  }
  if (elapsed < millisecondsPerHour) {
    return `${Math.floor(elapsed / millisecondsPerMinute)}m`;
  }
  if (elapsed < millisecondsPerDay) {
    return `${Math.floor(elapsed / millisecondsPerHour)}h`;
  }
  if (elapsed < 30 * millisecondsPerDay) {
    return `${Math.floor(elapsed / millisecondsPerDay)}d`;
  }
  return formatShortDate(date, options);
};

/** "3 minutes ago", "yesterday", "in 4 days" style stamps used in timelines. */
export const formatRelativeTime = (
  date: Date,
  options: DateFormatOptions = {},
): string => {
  const now = new Date();
  const elapsed = now.getTime() - date.getTime();
  const absolute = Math.abs(elapsed);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (absolute < millisecondsPerMinute) {
    return "just now";
  }
  if (absolute < millisecondsPerHour) {
    return formatter.format(
      -Math.round(elapsed / millisecondsPerMinute),
      "minute",
    );
  }
  if (absolute < millisecondsPerDay) {
    return formatter.format(-Math.round(elapsed / millisecondsPerHour), "hour");
  }
  if (absolute < 30 * millisecondsPerDay) {
    return formatter.format(-Math.round(elapsed / millisecondsPerDay), "day");
  }
  return formatShortDate(date, options);
};

/** "Mar 4" within the current year, "Mar 4, 2025" otherwise. */
export const formatShortDate = (
  date: Date,
  options: DateFormatOptions = {},
): string => {
  const now = new Date();
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(date);
};

/** "March 4, 2026 at 3:12 PM" */
export const formatLongDateTime = (
  date: Date,
  options: DateFormatOptions = {},
): string =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeStyle: "short",
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(date);

export type DueDateStatus = "overdue" | "today" | "soon" | "later";

/**
 * Judged in `timeZone` — the workspace's, the same zone its reminders read a
 * deadline in. Required rather than defaulted because the container runs UTC
 * and the browser does not, and the two would disagree on hydration.
 */
export const classifyDueDate = (dueDate: string, timeZone: string, now: Date = new Date()): DueDateStatus => {
  const difference = calendarDaysBetween(calendarDateIn(now, timeZone), dueDate);
  if (difference < 0) {
    return "overdue";
  }
  if (difference === 0) {
    return "today";
  }
  if (difference <= 3) {
    return "soon";
  }
  return "later";
};

