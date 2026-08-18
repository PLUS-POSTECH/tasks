import { z } from "zod";

import { NotFoundError } from "@/lib/errors";
import { findIssueByReference } from "@/lib/issues/queries";
import { calendarDateSchema, identifierSchema } from "@/lib/validation/schemas";

export const identifier = identifierSchema.describe("UUID");
export const calendarDate = calendarDateSchema.describe("YYYY-MM-DD");
export const issueReference = z.string().describe('Issue reference such as "#12" or "12"');

/** Resolves a reference to an issue the actor can see, or fails with a not-found error. */
export const requireIssue = async (reference: string) => {
  const issue = await findIssueByReference(reference);
  if (!issue) {
    throw new NotFoundError(`Issue ${reference} not found.`);
  }
  return issue;
};
