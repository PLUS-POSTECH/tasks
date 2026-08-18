import { beforeAll, describe, expect } from "bun:test";
import { inArray } from "drizzle-orm";

import { getDatabase } from "@/lib/database/client";
import { seedDevelopmentDatabase } from "@/lib/database/development";
import { issues } from "@/lib/database/schema";
import { createIssue, setIssueAssignee, setIssueProject } from "@/lib/issues/actions";
import {
  emptyIssueFilter,
  everyIssueScope,
  parseIssueFilter,
  resolveIssueFilter,
  type IssueScope,
} from "@/lib/issues/filters";
import { listIssuePage, listIssues } from "@/lib/issues/queries";
import { createProject } from "@/lib/projects/actions";
import { getCurrentUser } from "@/lib/session/current-user";
import { listMembers } from "@/lib/users/queries";

import { signedInTest } from "./act-as";

beforeAll(async () => {
  await seedDevelopmentDatabase();
});

const listedIdentifiers = async (
  scope: IssueScope,
  parameters: Record<string, string>,
  viewerIdentifier: string,
): Promise<readonly string[]> =>
  (await listIssues(scope, resolveIssueFilter(parseIssueFilter(parameters), viewerIdentifier))).map(
    (issue) => issue.identifier,
  );

describe("a route's scope against the member's filter", () => {
  // My issues is scoped to the viewer and the filter bar offers Assignee, so both
  // name the same property: the scope and the filter are ANDed, not merged.
  signedInTest("narrows rather than widens when both name the assignee", async () => {
    const currentUser = await getCurrentUser();
    const other = (await listMembers()).find((member) => member.identifier !== currentUser.identifier);
    if (!other) {
      throw new Error("fixtures missing");
    }
    const mine = await createIssue({ title: "Scope mine" });
    await setIssueAssignee(mine.identifier, currentUser.identifier);
    const theirs = await createIssue({ title: "Scope theirs" });
    await setIssueAssignee(theirs.identifier, other.identifier);

    const assignedToMe: IssueScope = {
      ...everyIssueScope,
      assigneeIdentifiers: [currentUser.identifier],
    };

    const filteredToThem = await listedIdentifiers(
      assignedToMe,
      { assignee: other.identifier },
      currentUser.identifier,
    );
    expect(filteredToThem).not.toContain(theirs.identifier);
    expect(filteredToThem).toHaveLength(0);

    const filteredToMe = await listedIdentifiers(assignedToMe, { assignee: "me" }, currentUser.identifier);
    expect(filteredToMe).toContain(mine.identifier);
    expect(filteredToMe).not.toContain(theirs.identifier);

    // Naming several members still means "any of them" — within the filter.
    const filteredToBoth = await listedIdentifiers(
      assignedToMe,
      { assignee: `me,${other.identifier}` },
      currentUser.identifier,
    );
    expect(filteredToBoth).toContain(mine.identifier);
    expect(filteredToBoth).not.toContain(theirs.identifier);

    const unscoped = await listedIdentifiers(
      everyIssueScope,
      { assignee: `me,${other.identifier}` },
      currentUser.identifier,
    );
    expect(unscoped).toContain(mine.identifier);
    expect(unscoped).toContain(theirs.identifier);
  });

  signedInTest("keeps a project page inside its project when the filter names another", async () => {
    const currentUser = await getCurrentUser();
    const shown = await createProject({ name: "Scope shown" });
    const hidden = await createProject({ name: "Scope hidden" });
    const inside = await createIssue({ title: "Scope inside" });
    await setIssueProject(inside.identifier, shown.identifier);
    const outside = await createIssue({ title: "Scope outside" });
    await setIssueProject(outside.identifier, hidden.identifier);

    const projectPage: IssueScope = { ...everyIssueScope, projectIdentifiers: [shown.identifier] };
    expect(
      await listedIdentifiers(projectPage, { project: hidden.identifier }, currentUser.identifier),
    ).toHaveLength(0);
    expect(
      await listedIdentifiers(projectPage, { project: shown.identifier }, currentUser.identifier),
    ).toEqual([inside.identifier]);
  });

  // The issues tabs are scoped by workflow state type, and `?status=` filters
  // by the same property.
  signedInTest("narrows rather than widens when both name the state type", async () => {
    const currentUser = await getCurrentUser();
    const backlogOnly: IssueScope = { ...everyIssueScope, stateTypes: ["backlog"] };
    const alsoAsked = await listedIdentifiers(backlogOnly, { status: "completed" }, currentUser.identifier);
    expect(alsoAsked).toHaveLength(0);
  });
});

describe("loading a list a page at a time", () => {
  signedInTest("returns each issue exactly once, with no gap or duplicate at a boundary", async () => {
    const currentUser = await getCurrentUser();
    const created: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      created.push((await createIssue({ title: `Paged ${index}` })).identifier);
    }

    // Rows tied on both sort keys may come back in one order under a small `LIMIT`
    // and another under a large one, which drops and repeats issues across the seam.
    // The order ends on the issue number so that cannot happen.
    const database = await getDatabase();
    await database
      .update(issues)
      .set({ sortOrder: 0, createdAt: new Date("2026-03-03T00:00:00.000Z") })
      .where(inArray(issues.identifier, created));

    const filter = resolveIssueFilter(emptyIssueFilter, currentUser.identifier);
    const whole = (await listIssues(everyIssueScope, filter)).map((issue) => issue.identifier);
    expect(whole.length).toBeGreaterThan(12);
    expect(new Set(whole).size).toBe(whole.length);

    for (const loaded of [3, 6, 9, 12, whole.length - 1, whole.length, whole.length + 5]) {
      const page = await listIssuePage(everyIssueScope, filter, loaded);
      expect(page.issues.map((issue) => issue.identifier)).toEqual(whole.slice(0, loaded));
      expect(page.hasMore).toBe(loaded < whole.length);
    }
  });

  signedInTest("pages the scope and the filter it was given, not the whole workspace", async () => {
    const currentUser = await getCurrentUser();
    const other = (await listMembers()).find((member) => member.identifier !== currentUser.identifier);
    if (!other) {
      throw new Error("fixtures missing");
    }
    const created: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const issue = await createIssue({ title: `Paged for one member ${index}` });
      await setIssueAssignee(issue.identifier, other.identifier);
      created.push(issue.identifier);
    }

    const assignedToThem: IssueScope = { ...everyIssueScope, assigneeIdentifiers: [other.identifier] };
    const filter = resolveIssueFilter(emptyIssueFilter, currentUser.identifier);
    const theirs = (await listIssues(assignedToThem, filter)).map((issue) => issue.identifier);
    expect(theirs).toEqual(expect.arrayContaining(created));
    expect((await listIssues(everyIssueScope, filter)).length).toBeGreaterThan(theirs.length);

    const first = await listIssuePage(assignedToThem, filter, 2);
    expect(first.issues.map((issue) => issue.identifier)).toEqual(theirs.slice(0, 2));
    expect(first.hasMore).toBe(true);

    const everything = await listIssuePage(assignedToThem, filter, theirs.length);
    expect(everything.hasMore).toBe(false);
    expect(everything.issues.every((issue) => issue.assignee?.identifier === other.identifier)).toBe(true);
    expect(everything.issues.map((issue) => issue.identifier)).toEqual(theirs);
  });
});
