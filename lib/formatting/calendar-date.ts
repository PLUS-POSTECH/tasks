/**
 * Due dates and target dates are calendar dates — `2026-09-01` means that day
 * wherever you are, not an instant. The time zone is an explicit argument on
 * the two operations that genuinely need one.
 */

/**
 * Exported so the validation schema is built from the same rule: two copies of
 * what counts as a date is how a value gets accepted at the boundary and
 * rejected in here.
 */
export const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const partsOf = (date: string): readonly [number, number, number] => {
  if (!calendarDatePattern.test(date)) {
    throw new Error(`Invalid calendar date "${date}".`);
  }
  const [year, month, day] = date.split("-").map(Number);
  return [year ?? 0, month ?? 1, day ?? 1];
};

const format = (year: number, month: number, day: number): string =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** Shifts by whole days. Calendar arithmetic needs no time zone. */
export const addCalendarDays = (date: string, days: number): string => {
  const [year, month, day] = partsOf(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return format(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
};

export const calendarDateIn = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);

/** The day of the week `date` falls on, 0 = Sunday. Calendar arithmetic needs no time zone. */
export const calendarDateWeekday = (date: string): number => {
  const [year, month, day] = partsOf(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

/** Whole days from `from` to `to`, negative when `to` is earlier. */
export const calendarDaysBetween = (from: string, to: string): number => {
  const [fromYear, fromMonth, fromDay] = partsOf(from);
  const [toYear, toMonth, toDay] = partsOf(to);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / millisecondsPerDay);
};

const timeZoneOffsetMilliseconds = (instant: Date, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const read = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
};

/** The instant at which `date` and `time` (HH:MM) occur in `timeZone`. */
export const zonedDateTimeToInstant = (date: string, time: string, timeZone: string): Date => {
  const [year, month, day] = partsOf(date);
  const [hour, minute] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour ?? 0, minute ?? 0);
  // Two passes handle DST transitions, where the offset differs at the guess.
  const firstPass = guess - timeZoneOffsetMilliseconds(new Date(guess), timeZone);
  return new Date(guess - timeZoneOffsetMilliseconds(new Date(firstPass), timeZone));
};

/**
 * A calendar date has no instant, so it is anchored at local midnight:
 * formatting it in the same runtime always yields the day that was stored.
 */
export const calendarDateAtLocalMidnight = (date: string): Date => {
  const [year, month, day] = partsOf(date);
  return new Date(year, month - 1, day);
};
