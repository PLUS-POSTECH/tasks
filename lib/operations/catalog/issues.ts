import { z } from "zod";

import { workflowStateTypes } from "@/lib/database/schema/enum-values";
import { NotFoundError } from "@/lib/errors";
import {
  addComment,
  createIssue,
  setIssueAssignee,
  setIssueAssignees,
  setIssueDueDate,
  setIssueLabels,
  setIssuePriority,
  setIssueProject,
  setIssueReporter,
  setIssueState,
  updateIssueDescription,
  updateIssueTitle,
} from "@/lib/issues/actions";
import { getIssueDetail } from "@/lib/issues/detail-queries";
import {
  emptyIssueFilter,
  everyIssueScope,
  filterMeToken,
  filterNoneToken,
  resolveIssueFilter,
} from "@/lib/issues/filters";
import { findIssueByReference, listIssues } from "@/lib/issues/queries";

import { prioritySchema } from "@/lib/validation/schemas";

import { defineOperation } from "../define";
import { calendarDate, identifier, issueReference as reference, requireIssue } from "./shared";

/**
 * The wire name for "nobody is assigned"; the filter itself calls that `none`,
 * and the two vocabularies meet here so they cannot drift.
 */
const unassignedAssignee = "unassigned";

export const issueOperations = [
  defineOperation({
    name: "issues.list",
    description: "List issues the actor can see, newest first, optionally filtered.",
    readOnly: true,
    input: z.object({
      stateTypes: z.array(z.enum(workflowStateTypes)).optional().describe("Only these workflow state types"),
      assignee: z
        .enum([filterMeToken, unassignedAssignee])
        .or(identifier)
        .optional()
        .describe('"me", "unassigned" or a member UUID'),
      projectIdentifier: identifier.optional(),
      labelIdentifiers: z.array(identifier).optional(),
      priorities: z.array(prioritySchema).optional().describe("0 none … 1 urgent, 2 high, 3 medium, 4 low"),
      search: z.string().max(200).optional().describe("Matches title, description or reference"),
      includeSubIssues: z.boolean().default(true),
      limit: z.number().int().min(1).max(200).default(50),
    }),
    // The operation is not scoped to a page, so the only thing the scope
    // decides here is whether sub-issues count as rows of their own.
    run: (input, { user }) =>
      listIssues(
        { ...everyIssueScope, includeSubIssues: input.includeSubIssues },
        resolveIssueFilter(
          {
            ...emptyIssueFilter,
            stateTypes: input.stateTypes ?? [],
            assigneeIdentifiers: input.assignee
              ? [input.assignee === unassignedAssignee ? filterNoneToken : input.assignee]
              : [],
            projectIdentifiers: input.projectIdentifier ? [input.projectIdentifier] : [],
            labelIdentifiers: input.labelIdentifiers ?? [],
            priorities: input.priorities ?? [],
            search: input.search ?? "",
          },
          user.identifier,
        ),
        input.limit,
      ),
  }),
  defineOperation({
    name: "issues.get",
    description: "Full detail of one issue: description, sub-issues, relations, comments, activity, reminders.",
    readOnly: true,
    input: z.object({ reference }),
    run: async (input, { user }) => {
      const detail = await getIssueDetail(input.reference, user.identifier);
      if (!detail) {
        throw new NotFoundError(`Issue ${input.reference} not found.`);
      }
      return detail;
    },
  }),
  defineOperation({
    name: "issues.create",
    description: "Create an issue. Returns its identifier and reference.",
    readOnly: false,
    input: z.object({
      title: z.string().min(1).max(500),
      description: z.string().max(50_000).optional().describe("Markdown"),
      priority: prioritySchema.optional(),
      assigneeIdentifiers: z
        .array(identifier)
        .optional()
        .describe("Active member UUIDs to assign; takes precedence over assigneeIdentifier"),
      assigneeIdentifier: identifier
        .optional()
        .describe("Compatibility input for assigning one active member"),
      reporterIdentifier: identifier
        .optional()
        .describe("Active workspace member UUID; defaults to the actor. Only admins may select another member"),
      projectIdentifier: identifier.optional(),
      parentReference: reference.optional().describe("Make this a sub-issue of that issue"),
      labelIdentifiers: z.array(identifier).optional(),
      dueDate: calendarDate.optional(),
      estimate: z.number().int().min(0).max(100).optional(),
    }),
    run: async (input) => {
      const parent = input.parentReference ? await requireIssue(input.parentReference) : null;
      return createIssue({
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? 0,
        assigneeIdentifiers: input.assigneeIdentifiers,
        assigneeIdentifier: input.assigneeIdentifier,
        reporterIdentifier: input.reporterIdentifier,
        projectIdentifier: input.projectIdentifier ?? null,
        parentIdentifier: parent?.identifier ?? null,
        labelIdentifiers: input.labelIdentifiers ?? [],
        dueDate: input.dueDate ?? null,
        estimate: input.estimate ?? null,
      });
    },
  }),
  defineOperation({
    name: "issues.update",
    description: "Change one or more properties of an issue; omitted fields are left as they are.",
    readOnly: false,
    input: z.object({
      reference,
      title: z.string().min(1).max(500).optional(),
      description: z.string().max(50_000).optional(),
      stateIdentifier: identifier.optional().describe("A workflow state, as listed by the workspace states operation"),
      priority: prioritySchema.optional(),
      assigneeIdentifiers: z
        .array(identifier)
        .optional()
        .describe("Replaces the assignee set; an empty array unassigns everyone and takes precedence over assigneeIdentifier"),
      assigneeIdentifier: identifier
        .nullable()
        .optional()
        .describe("Compatibility input for assigning one member; null unassigns everyone"),
      reporterIdentifier: identifier.optional().describe("An active workspace member UUID; only admins can change it"),
      projectIdentifier: identifier.nullable().optional().describe("null removes from the project"),
      labelIdentifiers: z.array(identifier).optional().describe("Replaces the label set"),
      dueDate: calendarDate.nullable().optional(),
    }),
    run: async (input) => {
      const issue = await requireIssue(input.reference);
      if (input.reporterIdentifier !== undefined) await setIssueReporter(issue.identifier, input.reporterIdentifier);
      if (input.title !== undefined) await updateIssueTitle(issue.identifier, input.title);
      if (input.description !== undefined) await updateIssueDescription(issue.identifier, input.description);
      if (input.stateIdentifier !== undefined) await setIssueState(issue.identifier, input.stateIdentifier);
      if (input.priority !== undefined) await setIssuePriority(issue.identifier, input.priority);
      if (input.assigneeIdentifiers !== undefined) {
        await setIssueAssignees(issue.identifier, input.assigneeIdentifiers);
      } else if (input.assigneeIdentifier !== undefined) {
        await setIssueAssignee(issue.identifier, input.assigneeIdentifier);
      }
      if (input.projectIdentifier !== undefined) await setIssueProject(issue.identifier, input.projectIdentifier);
      if (input.labelIdentifiers !== undefined) await setIssueLabels(issue.identifier, input.labelIdentifiers);
      if (input.dueDate !== undefined) await setIssueDueDate(issue.identifier, input.dueDate);
      return findIssueByReference(input.reference);
    },
  }),
  defineOperation({
    name: "issues.comment",
    description: "Add a comment (Markdown) to an issue.",
    readOnly: false,
    input: z.object({ reference, body: z.string().min(1).max(20_000) }),
    run: async (input) => {
      const issue = await requireIssue(input.reference);
      await addComment(issue.identifier, input.body);
      return { ok: true };
    },
  }),
];
