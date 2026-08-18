import { describe, expect, test } from "bun:test";

import {
  addCalendarDays,
  calendarDateAtLocalMidnight,
  calendarDateIn,
  calendarDateWeekday,
  calendarDaysBetween,
  zonedDateTimeToInstant,
} from "@/lib/formatting/calendar-date";
import { classifyDueDate } from "@/lib/formatting/dates";
import { computeNextRunAt, describeReminderCadence } from "@/lib/reminders/schedule";

const seoul = "Asia/Seoul";

describe("reminder scheduling", () => {
  test("interprets date and time in the workspace time zone", () => {
    expect(zonedDateTimeToInstant("2026-08-20", "09:00", seoul).toISOString()).toBe("2026-08-20T00:00:00.000Z");
    expect(zonedDateTimeToInstant("2026-07-01", "12:00", "America/New_York").toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(zonedDateTimeToInstant("2026-01-15", "12:00", "America/New_York").toISOString()).toBe("2026-01-15T17:00:00.000Z");
    expect(calendarDateIn(new Date("2026-08-19T20:00:00Z"), seoul)).toBe("2026-08-20");
  });

  test("one-shot reminders fire once, their lead before the deadline", () => {
    const timing = { leadMinutes: 1_440, repeatEveryMinutes: null, timeOfDay: "18:00", dueDate: "2026-08-20", timeZone: seoul } as const;
    expect(computeNextRunAt(timing, new Date("2026-08-18T00:00:00Z"))?.toISOString()).toBe("2026-08-19T09:00:00.000Z");
    expect(computeNextRunAt(timing, new Date("2026-08-19T09:00:00Z"))).toBeNull();
    expect(computeNextRunAt({ ...timing, leadMinutes: 15 }, new Date("2026-08-20T00:00:00Z"))?.toISOString()).toBe(
      "2026-08-20T08:45:00.000Z",
    );
    // Any lead, not just the three the UI offers.
    expect(computeNextRunAt({ ...timing, leadMinutes: 4_320 }, new Date("2026-08-16T00:00:00Z"))?.toISOString()).toBe(
      "2026-08-17T09:00:00.000Z",
    );
    expect(computeNextRunAt({ ...timing, leadMinutes: 120 }, new Date("2026-08-16T00:00:00Z"))?.toISOString()).toBe(
      "2026-08-20T07:00:00.000Z",
    );
    expect(computeNextRunAt({ ...timing, leadMinutes: 0 }, new Date("2026-08-16T00:00:00Z"))?.toISOString()).toBe(
      "2026-08-20T09:00:00.000Z",
    );
    expect(computeNextRunAt({ ...timing, dueDate: null }, new Date())).toBeNull();
  });

  test("an open-ended daily repeat runs at the deadline time until the due date", () => {
    const timing = { leadMinutes: null, repeatEveryMinutes: 1_440, timeOfDay: "09:00", dueDate: "2026-08-20", timeZone: seoul } as const;
    // 2026-08-18 10:00 KST → next is the 19th at 09:00 KST.
    expect(computeNextRunAt(timing, new Date("2026-08-18T01:00:00Z"))?.toISOString()).toBe("2026-08-19T00:00:00.000Z");
    expect(computeNextRunAt(timing, new Date("2026-08-19T00:00:00Z"))?.toISOString()).toBe("2026-08-20T00:00:00.000Z");
    expect(computeNextRunAt(timing, new Date("2026-08-20T00:00:00Z"))).toBeNull();
  });

  test("a lead bounds how early a repeat starts", () => {
    const timing = { leadMinutes: 2_880, repeatEveryMinutes: 1_440, timeOfDay: "18:00", dueDate: "2026-08-20", timeZone: seoul } as const;
    // Three posts: two days before, one day before, and the deadline itself.
    const runs: string[] = [];
    let cursor = new Date("2026-08-10T00:00:00Z");
    for (let step = 0; step < 5; step += 1) {
      const run = computeNextRunAt(timing, cursor);
      if (!run) break;
      runs.push(run.toISOString());
      cursor = run;
    }
    expect(runs).toEqual(["2026-08-18T09:00:00.000Z", "2026-08-19T09:00:00.000Z", "2026-08-20T09:00:00.000Z"]);
  });

  test("sub-day repeats count back from the deadline", () => {
    const timing = { leadMinutes: 1_440, repeatEveryMinutes: 360, timeOfDay: "18:00", dueDate: "2026-08-20", timeZone: seoul } as const;
    const runs: string[] = [];
    let cursor = new Date("2026-08-16T00:00:00Z");
    for (let step = 0; step < 6; step += 1) {
      const run = computeNextRunAt(timing, cursor);
      if (!run) break;
      runs.push(run.toISOString());
      cursor = run;
    }
    // Every 6 hours across the last day, landing exactly on the deadline.
    expect(runs).toEqual([
      "2026-08-19T09:00:00.000Z",
      "2026-08-19T15:00:00.000Z",
      "2026-08-19T21:00:00.000Z",
      "2026-08-20T03:00:00.000Z",
      "2026-08-20T09:00:00.000Z",
    ]);
  });

  test("a whole-day repeat keeps its clock time across a daylight-saving change", () => {
    // New York leaves DST early on 2026-11-01, so 09:00 local is 13:00Z before
    // and 14:00Z after. Counting in minutes would hold the instant and drift
    // the clock time to 08:00; counting in calendar days holds 09:00.
    const timing = { leadMinutes: null, repeatEveryMinutes: 1_440, timeOfDay: "09:00", dueDate: "2026-11-02", timeZone: "America/New_York" } as const;
    const runs: string[] = [];
    let cursor = new Date("2026-10-30T14:00:00Z");
    for (let step = 0; step < 4; step += 1) {
      const run = computeNextRunAt(timing, cursor);
      if (!run) break;
      runs.push(run.toISOString());
      cursor = run;
    }
    expect(runs).toEqual(["2026-10-31T13:00:00.000Z", "2026-11-01T14:00:00.000Z", "2026-11-02T14:00:00.000Z"]);
  });

  test("reads a cadence back in words", () => {
    expect(describeReminderCadence({ leadMinutes: 1_440, repeatEveryMinutes: null })).toBe("1 day before");
    expect(describeReminderCadence({ leadMinutes: 15, repeatEveryMinutes: null })).toBe("15 minutes before");
    expect(describeReminderCadence({ leadMinutes: null, repeatEveryMinutes: 1_440 })).toBe("From now, every day");
    expect(describeReminderCadence({ leadMinutes: 0, repeatEveryMinutes: null })).toBe("At the deadline");
    expect(describeReminderCadence({ leadMinutes: 4_320, repeatEveryMinutes: 360 })).toBe("3 days before, every 6 hours");
    expect(describeReminderCadence({ leadMinutes: 10_080, repeatEveryMinutes: 10_080 })).toBe("1 week before, every week");
  });
});

describe("calendar dates", () => {
  test("shift by whole days regardless of the runtime's zone", () => {
    expect(addCalendarDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addCalendarDays("2026-03-01", -1)).toBe("2026-02-28");
    // A leap day and a year boundary, the two places naive arithmetic slips.
    expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(calendarDaysBetween("2026-08-16", "2026-08-19")).toBe(3);
    expect(calendarDaysBetween("2026-08-19", "2026-08-16")).toBe(-3);
    // 2026-08-16 is a Sunday, which is where the picker counts "next Friday" from.
    expect(calendarDateWeekday("2026-08-16")).toBe(0);
    expect(calendarDateWeekday("2026-08-21")).toBe(5);
  });

  test("read the same day back through the display anchor", () => {
    for (const date of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
      const anchored = calendarDateAtLocalMidnight(date);
      expect([anchored.getFullYear(), anchored.getMonth() + 1, anchored.getDate()]).toEqual(
        date.split("-").map(Number),
      );
    }
    expect(() => calendarDateAtLocalMidnight("nonsense")).toThrow();
  });

  test("classify due dates against the day it is in a given zone", () => {
    const middayInSeoul = new Date("2026-08-16T03:00:00Z");
    expect(classifyDueDate("2026-08-15", seoul, middayInSeoul)).toBe("overdue");
    expect(classifyDueDate("2026-08-16", seoul, middayInSeoul)).toBe("today");
    expect(classifyDueDate("2026-08-19", seoul, middayInSeoul)).toBe("soon");
    expect(classifyDueDate("2026-08-30", seoul, middayInSeoul)).toBe("later");
  });
});
