import { z } from "zod";

import { priorities } from "@/lib/database/schema/enum-values";
import { calendarDatePattern } from "@/lib/formatting/calendar-date";

export const identifierSchema = z.uuid();
export const nullableIdentifierSchema = identifierSchema.nullable();
export const calendarDateSchema = z.string().regex(calendarDatePattern, "Use YYYY-MM-DD.");
export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM.");
export const discordSnowflakeSchema = z.string().regex(/^\d{17,20}$/, "A Discord ID is a 17–20 digit number.");
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** Kept here rather than beside the priority names: zod must not reach the browser. */
export const prioritySchema = z.literal(priorities);

/**
 * The bounds live here rather than beside the action that enforces them because
 * the operations catalog states the same limits to its callers.
 */
export const issueTitleSchema = z.string().trim().min(1, "Title is required").max(500);
export const issueDescriptionSchema = z.string().max(50_000);
export const issueEstimateSchema = z.number().int().min(0).max(100).nullable();
export const commentBodySchema = z.string().trim().min(1).max(20_000);

export const projectNameSchema = z.string().trim().min(1).max(200);
export const projectDescriptionSchema = z.string().max(2_000);
export const projectIconSchema = z.string().min(1).max(4);

/**
 * The shortest gap a reminder may repeat at, since it keeps posting into a
 * channel until its deadline. The reminder form's shortest repeat is hourly;
 * this is the same floor for the API and MCP, which have no menu.
 */
export const minimumReminderRepeatMinutes = 60;
