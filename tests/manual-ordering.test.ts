import { beforeAll, describe, expect } from "bun:test";
import { eq, inArray } from "drizzle-orm";

import { getDatabase } from "@/lib/database/client";
import { seedDevelopmentDatabase } from "@/lib/database/development";
import { issues, projectMilestones, projects } from "@/lib/database/schema";
import { createIssue, moveIssueOnBoard, reorderIssue } from "@/lib/issues/actions";
import { placementForDrop } from "@/lib/issues/placement";
import { createMilestone, createProject } from "@/lib/projects/actions";
import { getProjectDetail, listProjects } from "@/lib/projects/queries";
import { listStates } from "@/lib/workflow/queries";

import { signedInTest } from "./act-as";

/**
 * A drop is written as the midpoint of the two rows it landed between, which
 * only works while those rows have positions of their own, the column can hold
 * the value in between them, and there is still a gap left to halve.
 */

beforeAll(async () => {
  await seedDevelopmentDatabase();
});

type IssueOrders = { readonly sortOrder: number; readonly boardOrder: number };

const storedIssueOrder = async (identifier: string): Promise<IssueOrders> => {
  const database = await getDatabase();
  const issue = await database.query.issues.findFirst({
    where: eq(issues.identifier, identifier),
    columns: { sortOrder: true, boardOrder: true },
  });
  if (!issue) {
    throw new Error("The issue was not stored.");
  }
  return issue;
};

const threeStackedIssues = async (
  titlePrefix: string,
): Promise<{ readonly top: string; readonly middle: string; readonly bottom: string }> => {
  // Each new issue starts one step above every position in use, so the last
  // one created is the one at the top.
  const bottom = await createIssue({ title: `${titlePrefix} bottom` });
  const middle = await createIssue({ title: `${titlePrefix} middle` });
  const top = await createIssue({ title: `${titlePrefix} top` });
  return { top: top.identifier, middle: middle.identifier, bottom: bottom.identifier };
};

const between = (
  position: number,
  lower: number,
  upper: number,
): void => {
  expect(position).toBeGreaterThan(lower);
  expect(position).toBeLessThan(upper);
};

describe("manual ordering", () => {
  signedInTest("gives issues created back to back a position each", async () => {
    const database = await getDatabase();
    const created = [];
    for (const title of ["Ordering one", "Ordering two", "Ordering three", "Ordering four"]) {
      created.push(await createIssue({ title }));
    }
    const rows = await database.query.issues.findMany({
      where: inArray(
        issues.identifier,
        created.map((issue) => issue.identifier),
      ),
      columns: { identifier: true, sortOrder: true, boardOrder: true, createdAt: true },
    });
    expect(rows).toHaveLength(created.length);
    expect(new Set(rows.map((row) => row.sortOrder)).size).toBe(created.length);
    expect(new Set(rows.map((row) => row.boardOrder)).size).toBe(created.length);

    const byPosition = [...rows].sort((left, right) => left.sortOrder - right.sortOrder);
    const byAge = [...rows].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    expect(byPosition.map((row) => row.identifier)).toEqual(byAge.map((row) => row.identifier));
  });

  signedInTest("puts a card where a drop between two rows asks for", async () => {
    const { top, middle, bottom } = await threeStackedIssues("Ordering drop");
    await reorderIssue(bottom, { aboveIssueIdentifier: top, belowIssueIdentifier: middle });
    const stored = await Promise.all([top, middle, bottom].map(storedIssueOrder));
    between(stored[2]!.sortOrder, stored[0]!.sortOrder, stored[1]!.sortOrder);
  });

  /**
   * The board is ordered by `board_order` under every grouping, and the action
   * that writes `sort_order` is the one every list reads — a drop on the board
   * must not be written into the other column.
   */
  signedInTest("moves a card on the board without touching the order the lists read", async () => {
    const { top, middle, bottom } = await threeStackedIssues("Ordering board column");
    const listOrdersBefore = await Promise.all([top, middle, bottom].map(storedIssueOrder));

    // A column that is not a status: the drop only says where in the board the card
    // landed.
    await moveIssueOnBoard(bottom, null, { aboveIssueIdentifier: top, belowIssueIdentifier: middle });

    const stored = await Promise.all([top, middle, bottom].map(storedIssueOrder));
    between(stored[2]!.boardOrder, stored[0]!.boardOrder, stored[1]!.boardOrder);
    expect(stored.map((orders) => orders.sortOrder)).toEqual(listOrdersBefore.map((orders) => orders.sortOrder));
  });

  signedInTest("moves a card into the status column it was dropped into", async () => {
    const database = await getDatabase();
    const states = await listStates();
    const issue = await createIssue({ title: "Ordering board status" });
    const destination = states.find((state) => state.type === "started");
    if (!destination) {
      throw new Error("fixtures missing");
    }
    await moveIssueOnBoard(issue.identifier, destination.identifier, {
      aboveIssueIdentifier: null,
      belowIssueIdentifier: null,
    });
    const stored = await database.query.issues.findFirst({
      where: eq(issues.identifier, issue.identifier),
      columns: { stateIdentifier: true },
    });
    expect(stored?.stateIdentifier).toBe(destination.identifier);
  });

  /**
   * A card dropped back onto its own place asks to go between the card above it
   * and itself. The card is taken out of the column before the drop index is read,
   * so the drop names the two rows it is already between.
   */
  signedInTest("leaves a card alone when it is dropped back where it already is", async () => {
    const { top, middle, bottom } = await threeStackedIssues("Ordering self drop");
    const column = [top, middle, bottom];
    const before = await storedIssueOrder(middle);
    for (let drop = 0; drop < 40; drop += 1) {
      // Both halves of its own row: the drop index the board reports is the
      // card's own index from above it, and the next one from below.
      for (const dropIndex of [1, 2]) {
        await moveIssueOnBoard(middle, null, placementForDrop(column, dropIndex, middle));
      }
    }
    const stored = await Promise.all(column.map(storedIssueOrder));
    between(stored[1]!.boardOrder, stored[0]!.boardOrder, stored[2]!.boardOrder);
    expect(stored[1]!.boardOrder).toBe(before.boardOrder);
  });

  /**
   * Two cards taking turns to squeeze under a third halve the gap below it every
   * time, and `double precision` runs out after fifty-odd halvings — so the order
   * is renumbered and the drop still lands where it was aimed.
   */
  signedInTest("keeps a list orderable past the point a midpoint runs out", async () => {
    const { top, middle, bottom } = await threeStackedIssues("Ordering squeeze");
    let [climber, waiting] = [middle, bottom];
    for (let drop = 0; drop < 200; drop += 1) {
      await reorderIssue(climber, { aboveIssueIdentifier: top, belowIssueIdentifier: waiting });
      const stored = await Promise.all([top, climber, waiting].map(storedIssueOrder));
      between(stored[1]!.sortOrder, stored[0]!.sortOrder, stored[2]!.sortOrder);
      [climber, waiting] = [waiting, climber];
    }
    const stored = await Promise.all([top, middle, bottom].map(storedIssueOrder));
    expect(new Set(stored.map((orders) => orders.sortOrder)).size).toBe(3);
    // The recovery really ran: a created issue starts below every position in
    // use and so is always negative here, and only a renumbering — 1..n over
    // the workspace — can put one above zero.
    for (const orders of stored) {
      expect(orders.sortOrder).toBeGreaterThan(0);
    }
    expect(new Set(stored.map((orders) => orders.boardOrder)).size).toBe(3);
  });

  signedInTest("gives projects and their milestones a position each", async () => {
    const database = await getDatabase();
    const first = await createProject({ name: "Ordering project one" });
    const second = await createProject({ name: "Ordering project two" });
    try {
      const projectRows = await database.query.projects.findMany({
        where: inArray(projects.identifier, [first.identifier, second.identifier]),
        columns: { identifier: true, sortOrder: true },
      });
      const positionOf = (identifier: string): number =>
        projectRows.find((row) => row.identifier === identifier)?.sortOrder ?? Number.NaN;
      expect(positionOf(first.identifier)).toBeLessThan(positionOf(second.identifier));

      const listed = await listProjects();
      const positions = listed.map((project) => project.sortOrder);
      expect([...positions].sort((left, right) => left - right)).toEqual(positions);

      await createMilestone(first.identifier, { name: "Ordering milestone one" });
      await createMilestone(first.identifier, { name: "Ordering milestone two" });
      const milestones = await database.query.projectMilestones.findMany({
        where: eq(projectMilestones.projectIdentifier, first.identifier),
        columns: { name: true, sortOrder: true },
      });
      expect(milestones).toHaveLength(2);
      expect(new Set(milestones.map((milestone) => milestone.sortOrder)).size).toBe(2);
      expect((await getProjectDetail(first.identifier))?.milestones.map((milestone) => milestone.name)).toEqual([
        "Ordering milestone one",
        "Ordering milestone two",
      ]);
    } finally {
      // The suite shares one database, so the projects this test needed do not stay in
      // everybody else's list.
      await database.delete(projects).where(inArray(projects.identifier, [first.identifier, second.identifier]));
    }
  });

  /**
   * Two people adding a milestone at the same moment must not be given the same
   * position: milestones have no drag, so nothing on the page can separate a tied
   * pair afterwards.
   */
  signedInTest("gives milestones added at the same moment a position each", async () => {
    const database = await getDatabase();
    const project = await createProject({ name: "Ordering concurrent milestones" });
    const names = ["Concurrent milestone one", "Concurrent milestone two", "Concurrent milestone three"];
    try {
      await Promise.all(names.map((name) => createMilestone(project.identifier, { name })));
      const milestones = await database.query.projectMilestones.findMany({
        where: eq(projectMilestones.projectIdentifier, project.identifier),
        columns: { sortOrder: true },
      });
      expect(milestones).toHaveLength(names.length);
      expect(new Set(milestones.map((milestone) => milestone.sortOrder)).size).toBe(names.length);
    } finally {
      await database.delete(projects).where(eq(projects.identifier, project.identifier));
    }
  });
});
