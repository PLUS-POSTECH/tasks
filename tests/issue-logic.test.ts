import { describe, expect, test } from "bun:test";

import {
  defaultIssueViewOptions,
  emptyIssueFilter,
  issueFilterParameters,
  issueViewOptionsPatch,
  parseIssueFilter,
  parseIssueViewOptions,
  resolveIssueFilter,
  settledFilterCategories,
  everyIssueScope,
} from "@/lib/issues/filters";
import {
  assigneeIdentifiersAfterGroupDrop,
  groupCreateDefaults,
  groupIssues,
} from "@/lib/issues/grouping";
import { placementForDrop } from "@/lib/issues/placement";
import {
  emptyIssueSelection,
  sameIssueSet,
  selectedVisibleIdentifiers,
  toggleIssueSelection,
} from "@/lib/issues/selection";
import { formatIssueReference, parseIssueReference } from "@/lib/issues/reference";
import type { IssueListItem } from "@/lib/issues/types";
import { classifyDueDate } from "@/lib/formatting/dates";
import { resolveDatabaseConfiguration } from "@/lib/database/configuration";
import { manualOrderBetween } from "@/lib/database/manual-order";
import { startedStateProgress } from "@/lib/workflow/state-types";

const makeIssue = (overrides: Partial<IssueListItem>): IssueListItem => ({
  identifier: overrides.identifier ?? crypto.randomUUID(),
  number: 1,
  reference: "#1",
  title: "Issue",
  priority: 0,
  estimate: null,
  dueDate: null,
  sortOrder: 0,
  boardOrder: 0,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  completedAt: null,
  state: { identifier: "todo", name: "Todo", type: "unstarted", color: "#000", position: 1 },
  assignees: [],
  assignee: null,
  creator: null,
  labels: [],
  project: null,
  parent: null,
  subIssueCount: 0,
  completedSubIssueCount: 0,
  isBlocked: false,
  commentCount: 0,
  ...overrides,
});

describe("references", () => {
  test("formats and parses #123", () => {
    expect(formatIssueReference(123)).toBe("#123");
    expect(parseIssueReference("#123")).toBe(123);
    expect(parseIssueReference("123")).toBe(123);
    expect(parseIssueReference("nope")).toBeNull();
  });
});

describe("filters", () => {
  const labelIdentifier = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
  const viewerIdentifier = "8c4f2b1a-6d3e-4a57-9f21-0b7c5e9d1234";

  test("parses comma separated lists and view options", () => {
    const filter = parseIssueFilter({ priority: "1,2", assignee: ["me", "none"], q: " palette " });
    expect(filter.priorities).toEqual([1, 2]);
    expect(filter.assigneeIdentifiers).toEqual(["me", "none"]);
    expect(filter.search).toBe("palette");
    const options = parseIssueViewOptions({ layout: "board", group: "assignee", completed: "0" });
    expect(options).toMatchObject({ layout: "board", grouping: "assignee", showCompleted: false });
  });

  // The route's scope is a value of its own that the query ANDs with this one, so
  // the parser reads the URL and nothing else.
  test("reads the filter from the URL and nothing else", () => {
    const filter = parseIssueFilter({ label: labelIdentifier, status: "backlog" });
    expect(filter.stateTypes).toEqual(["backlog"]);
    expect(filter.labelIdentifiers).toEqual([labelIdentifier]);
    expect(filter.assigneeIdentifiers).toEqual([]);
    expect(filter.projectIdentifiers).toEqual([]);
  });

  // Every identifier list ends up in `inArray` against a uuid column, so a value
  // that is not one has to be dropped rather than passed on.
  test("drops filter values that are neither an identifier nor a token the category spends", () => {
    expect(parseIssueFilter({ state: "abc" }).stateIdentifiers).toEqual([]);
    expect(parseIssueFilter({ label: "abc" }).labelIdentifiers).toEqual([]);
    expect(parseIssueFilter({ assignee: "abc" }).assigneeIdentifiers).toEqual([]);
    expect(parseIssueFilter({ creator: "abc" }).creatorIdentifiers).toEqual([]);
    expect(parseIssueFilter({ project: "abc" }).projectIdentifiers).toEqual([]);
    expect(parseIssueFilter({ label: `${labelIdentifier},abc` }).labelIdentifiers).toEqual([labelIdentifier]);

    expect(parseIssueFilter({ assignee: "me,none" }).assigneeIdentifiers).toEqual(["me", "none"]);
    expect(parseIssueFilter({ creator: "me,none" }).creatorIdentifiers).toEqual(["me"]);
    expect(parseIssueFilter({ project: "none,me" }).projectIdentifiers).toEqual(["none"]);
    expect(parseIssueFilter({ state: "me,none" }).stateIdentifiers).toEqual([]);
    expect(parseIssueFilter({ label: "me,none" }).labelIdentifiers).toEqual([]);
  });

  test("leaves the surviving tokens for the resolver to spend", () => {
    const resolved = resolveIssueFilter(
      parseIssueFilter({ assignee: "me,none,abc", creator: "me", project: "none" }),
      viewerIdentifier,
    );
    expect(resolved.assigneeIdentifiers).toEqual([viewerIdentifier]);
    expect(resolved.creatorIdentifiers).toEqual([viewerIdentifier]);
    expect(resolved.includeUnassigned).toBe(true);
    expect(resolved.includeNoProject).toBe(true);
    expect(resolved.projectIdentifiers).toEqual([]);
  });
});

describe("grouping", () => {
  const issues = [
    makeIssue({ identifier: "a", priority: 3 }),
    makeIssue({ identifier: "b", priority: 1 }),
    makeIssue({
      identifier: "c",
      priority: 0,
      state: { identifier: "done", name: "Done", type: "completed", color: "#000", position: 5 },
    }),
  ];

  test("orders priority groups urgent first and no priority last", () => {
    const groups = groupIssues(issues, "priority", "priority", { states: [], showEmptyGroups: false });
    expect(groups.map((group) => group.name)).toEqual(["Urgent", "Medium", "No priority"]);
  });

  test("groups by state in workflow order and can show empty groups", () => {
    const states = [
      { identifier: "todo", name: "Todo", type: "unstarted" as const, color: "#000", position: 1 },
      { identifier: "progress", name: "In Progress", type: "started" as const, color: "#000", position: 2 },
      { identifier: "done", name: "Done", type: "completed" as const, color: "#000", position: 5 },
    ];
    const groups = groupIssues(issues, "state", "priority", { states, showEmptyGroups: true });
    expect(groups.map((group) => group.name)).toEqual(["Todo", "In Progress", "Done"]);
    expect(groups[0]?.issues.map((issue) => issue.identifier)).toEqual(["b", "a"]);
  });

  test("shows a shared issue in every assignee group", () => {
    const alex = {
      identifier: "alex",
      name: "Alex",
      displayName: "alex",
      avatarColor: "#000",
      image: null,
    };
    const blair = { ...alex, identifier: "blair", name: "Blair", displayName: "blair" };
    const shared = makeIssue({ identifier: "shared", assignees: [alex, blair], assignee: alex });

    const groups = groupIssues([shared], "assignee", "priority", {
      states: [],
      showEmptyGroups: false,
    });
    expect(groups.map((group) => group.name)).toEqual(["Alex", "Blair"]);
    expect(groups.flatMap((group) => group.issues.map((issue) => issue.identifier))).toEqual([
      "shared",
      "shared",
    ]);
  });

  test("moves only the source assignee when a shared card changes columns", () => {
    const alex = {
      identifier: "alex",
      name: "Alex",
      displayName: "alex",
      avatarColor: "#000",
      image: null,
    };
    const blair = { ...alex, identifier: "blair", name: "Blair", displayName: "blair" };
    const casey = { ...alex, identifier: "casey", name: "Casey", displayName: "casey" };
    const shared = makeIssue({ identifier: "shared", assignees: [alex, blair], assignee: alex });
    const caseys = makeIssue({ identifier: "caseys", assignees: [casey], assignee: casey });
    const unassigned = makeIssue({ identifier: "unassigned" });
    const groups = groupIssues([shared, caseys, unassigned], "assignee", "priority", {
      states: [],
      showEmptyGroups: false,
    });
    const source = groups.find((group) => group.key === alex.identifier);
    const target = groups.find((group) => group.key === casey.identifier);
    const empty = groups.find((group) => group.key === "unassigned");
    expect(target).toBeDefined();
    expect(empty).toBeDefined();
    expect(assigneeIdentifiersAfterGroupDrop(target!, source, shared.identifier)).toEqual([
      blair.identifier,
      casey.identifier,
    ]);
    expect(assigneeIdentifiersAfterGroupDrop(empty!, source, shared.identifier)).toEqual([]);
  });

  test("prefills the assignee set when creating inside an assignee group", () => {
    const alex = {
      identifier: "alex",
      name: "Alex",
      displayName: "alex",
      avatarColor: "#000",
      image: null,
    };
    const [group] = groupIssues(
      [makeIssue({ assignees: [alex], assignee: alex })],
      "assignee",
      "priority",
      { states: [], showEmptyGroups: false },
    );
    expect(group).toBeDefined();
    expect(groupCreateDefaults(group!, {}, { prefillLabel: false })).toMatchObject({
      assigneeIdentifiers: [alex.identifier],
    });
  });
});

/**
 * A selection is made in a list that is redrawn under it without ever
 * remounting, and a bulk control spends it on the server — so it has to keep
 * meaning what is on screen, through both collapsing and filtering.
 */
describe("what a bulk action is allowed to reach", () => {
  const onScreen = ["a", "b", "c"];
  const select = (visibleIdentifiers: readonly string[], identifiers: readonly string[]) =>
    identifiers.reduce(
      (selection, identifier) => toggleIssueSelection(selection, visibleIdentifiers, identifier, false),
      emptyIssueSelection,
    );

  test("reaches the selected rows that are on screen and no others", () => {
    const loaded = [...onScreen, "folded"];
    const selection = select(loaded, ["a", "b", "folded"]);

    expect(selectedVisibleIdentifiers(selection, onScreen)).toEqual(["a", "b"]);
    expect(selection.identifiers.has("folded")).toBe(true);
    expect(selectedVisibleIdentifiers(selection, loaded)).toEqual(["a", "b", "folded"]);
  });

  test("names an issue once even where the grouping shows it twice", () => {
    const selection = select(["a"], ["a"]);
    expect(selectedVisibleIdentifiers(selection, ["a", "b", "a"])).toEqual(["a"]);
  });
});

describe("selecting a range with shift", () => {
  const rows = ["a", "b", "c", "d"];

  test("extends the action the anchor started", () => {
    const all = rows.reduce(
      (selection, identifier) => toggleIssueSelection(selection, rows, identifier, false),
      emptyIssueSelection,
    );
    expect(selectedVisibleIdentifiers(all, rows)).toEqual(rows);

    // Clicking "d" takes it out, so a shift-click back to "b" takes the rest of
    // that range out too rather than putting all of it back in.
    const afterAnchor = toggleIssueSelection(all, rows, "d", false);
    const afterRange = toggleIssueSelection(afterAnchor, rows, "b", true);
    expect(selectedVisibleIdentifiers(afterRange, rows)).toEqual(["a"]);
  });

  test("still adds the range under an anchor that was selected", () => {
    const afterAnchor = toggleIssueSelection(emptyIssueSelection, rows, "b", false);
    const afterRange = toggleIssueSelection(afterAnchor, rows, "d", true);
    expect(selectedVisibleIdentifiers(afterRange, rows)).toEqual(["b", "c", "d"]);
  });

  test("toggles the single row when the anchor is no longer on screen", () => {
    const afterAnchor = toggleIssueSelection(emptyIssueSelection, rows, "a", false);
    const afterRange = toggleIssueSelection(afterAnchor, ["c", "d"], "d", true);
    expect(selectedVisibleIdentifiers(afterRange, ["c", "d"])).toEqual(["d"]);
    expect(afterRange.identifiers.has("a")).toBe(true);
  });
});

describe("whether a redrawn list is still the list a selection was made in", () => {
  test("is, when the same issues come back regrouped or reordered", () => {
    expect(sameIssueSet(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
    // Grouping by label puts one issue in several groups at once.
    expect(sameIssueSet(["a", "b"], ["a", "b", "a"])).toBe(true);
  });

  test("is not, once a filter or a page has changed what it holds", () => {
    expect(sameIssueSet(["a", "b", "c"], ["a", "b"])).toBe(false);
    expect(sameIssueSet(["a", "b"], ["a", "b", "d"])).toBe(false);
  });
});

describe("where a dropped card lands", () => {
  const column = ["top", "middle", "bottom"];

  test("names the cards either side of the drop", () => {
    expect(placementForDrop(column, 0, "elsewhere")).toEqual({
      aboveIssueIdentifier: null,
      belowIssueIdentifier: "top",
    });
    expect(placementForDrop(column, 2, "elsewhere")).toEqual({
      aboveIssueIdentifier: "middle",
      belowIssueIdentifier: "bottom",
    });
    expect(placementForDrop(column, 3, "elsewhere")).toEqual({
      aboveIssueIdentifier: "bottom",
      belowIssueIdentifier: null,
    });
  });

  /**
   * A card being dragged is still in the column it came from, so it is one of the
   * cards the drop index counts. Left in, it becomes its own neighbour and asks
   * for half the gap it is already sitting in.
   */
  test("never makes the dragged card its own neighbour", () => {
    for (const dropIndex of [0, 1, 2, 3]) {
      const placement = placementForDrop(column, dropIndex, "middle");
      expect(placement.aboveIssueIdentifier).not.toBe("middle");
      expect(placement.belowIssueIdentifier).not.toBe("middle");
    }
  });

  test("reads a drop onto the card's own place as leaving it where it is", () => {
    // Either half of its own row, and the row is between "top" and "bottom".
    for (const dropIndex of [1, 2]) {
      expect(placementForDrop(column, dropIndex, "middle")).toEqual({
        aboveIssueIdentifier: "top",
        belowIssueIdentifier: "bottom",
      });
    }
  });
});

describe("the gap a drop is written into", () => {
  test("takes the midpoint of the two neighbours, in either order", () => {
    expect(manualOrderBetween(2, 4)).toBe(3);
    expect(manualOrderBetween(4, 2)).toBe(3);
  });

  test("steps one past the neighbour at the ends of the order", () => {
    expect(manualOrderBetween(null, 7)).toBe(6);
    expect(manualOrderBetween(7, null)).toBe(8);
  });

  /**
   * `double precision` holds roughly fifty midpoints between two whole numbers.
   * Past that the midpoint is one of the neighbours, and writing it would tie two
   * rows together for good, so the answer is "no room" and the caller renumbers.
   */
  test("says there is no room rather than returning a position already in use", () => {
    let upper = 2;
    let splits = 0;
    for (;;) {
      const midpoint = manualOrderBetween(1, upper);
      if (midpoint === null) {
        break;
      }
      expect(midpoint).toBeGreaterThan(1);
      expect(midpoint).toBeLessThan(upper);
      upper = midpoint;
      splits += 1;
      expect(splits).toBeLessThan(200);
    }
    expect(splits).toBeGreaterThan(45);
    expect(manualOrderBetween(1, 1)).toBeNull();
  });
});

describe("dates", () => {
  /**
   * The container runs UTC and the club does not, so between midnight and 09:00 in
   * Seoul the two disagree about what day it is. The workspace's zone decides —
   * the same zone a reminder already reads its deadline in.
   */
  test("classifies due dates in the workspace's time zone, not the runtime's", () => {
    const earlyMorningInSeoul = new Date("2026-08-17T22:00:00Z");
    expect(classifyDueDate("2026-08-18", "Asia/Seoul", earlyMorningInSeoul)).toBe("today");
    expect(classifyDueDate("2026-08-18", "UTC", earlyMorningInSeoul)).toBe("soon");
    expect(classifyDueDate("2026-08-17", "Asia/Seoul", earlyMorningInSeoul)).toBe("overdue");
    expect(classifyDueDate("2026-08-17", "UTC", earlyMorningInSeoul)).toBe("today");
  });
});

describe("state progress", () => {
  test("spreads started states between 0 and 1", () => {
    const states = [
      { identifier: "a", type: "started" as const, position: 1 },
      { identifier: "b", type: "started" as const, position: 2 },
    ];
    expect(startedStateProgress(states, "a")).toBeCloseTo(1 / 3);
    expect(startedStateProgress(states, "b")).toBeCloseTo(2 / 3);
  });
});

describe("database configuration", () => {
  test("defaults to the embedded development database", () => {
    expect(resolveDatabaseConfiguration({ NODE_ENV: "development" })).toEqual({
      driver: "pglite",
      dataDirectory: "./.data/development",
      migrateOnStart: true,
    });
    expect(resolveDatabaseConfiguration({ DATABASE_URL: "postgresql://user@host/db" })).toEqual({
      driver: "postgres",
      connectionString: "postgresql://user@host/db",
      migrateOnStart: true,
    });
    expect(
      resolveDatabaseConfiguration({ DATABASE_URL: "postgresql://user@host/db", DATABASE_MIGRATE_ON_START: "false" }),
    ).toMatchObject({ migrateOnStart: false });
    expect(() => resolveDatabaseConfiguration({ DATABASE_URL: "mysql://x" })).toThrow();
  });

  // Guessing here would open an empty embedded database inside the container,
  // seed it with sample data, and report healthy.
  test("refuses to guess outside development", () => {
    expect(() => resolveDatabaseConfiguration({ NODE_ENV: "production" })).toThrow(/DATABASE_URL is required/);
  });
});

describe("issue view URL", () => {
  test("round-trips view options, dropping the ones left at their default", () => {
    expect(issueViewOptionsPatch({ layout: "list" })).toEqual({ layout: null });
    expect(issueViewOptionsPatch({ layout: "board" })).toEqual({ layout: "board" });
    expect(issueViewOptionsPatch({ grouping: "state" })).toEqual({ group: null });
    expect(issueViewOptionsPatch({ grouping: "assignee" })).toEqual({ group: "assignee" });
    expect(issueViewOptionsPatch({ ordering: "priority" })).toEqual({ sort: null });
    expect(issueViewOptionsPatch({ showCompleted: true })).toEqual({ completed: null });
    expect(issueViewOptionsPatch({ showCompleted: false })).toEqual({ completed: "0" });
    expect(issueViewOptionsPatch({ showEmptyGroups: false })).toEqual({ empty: null });
    expect(issueViewOptionsPatch({ showEmptyGroups: true })).toEqual({ empty: "1" });

    const options = { grouping: "assignee", ordering: "due", layout: "board", showCompleted: false, showEmptyGroups: true } as const;
    const parameters = Object.fromEntries(
      Object.entries(issueViewOptionsPatch(options)).flatMap(([key, value]) => (value === null ? [] : [[key, value]])),
    );
    expect(parseIssueViewOptions(parameters)).toEqual(options);
    expect(parseIssueViewOptions({})).toEqual(defaultIssueViewOptions);
  });

  test("clearing filters removes every filter parameter the parser reads", () => {
    const filled = {
      state: "9a1c1d2e-3f40-4a51-8b62-7c8d9e0f1a2b",
      status: "started",
      assignee: "b2c3d4e5-6f70-4812-9a23-b4c5d6e7f809",
      creator: "c3d4e5f6-7081-4923-8b34-c5d6e7f8091a",
      priority: "1",
      label: "d4e5f607-8192-4a34-9c45-d6e7f8091a2b",
      project: "e5f60718-92a3-4b45-8d56-e7f8091a2b3c",
      q: "text",
    };
    expect(parseIssueFilter(filled)).not.toEqual(emptyIssueFilter);
    const cleared = Object.fromEntries(
      Object.entries(filled).filter(([key]) => !issueFilterParameters.some((parameter) => parameter === key)),
    );
    expect(parseIssueFilter(cleared)).toEqual(emptyIssueFilter);
  });
});

describe("which filter categories a page offers", () => {
  test("leaves out the ones its scope has already settled", () => {
    expect(settledFilterCategories({ ...everyIssueScope, assigneeIdentifiers: ["u1"] })).toEqual(["assignee"]);
    expect(settledFilterCategories({ ...everyIssueScope, projectIdentifiers: ["p1"] })).toEqual(["project"]);
    expect(settledFilterCategories({ ...everyIssueScope, creatorIdentifiers: ["u1"] })).toEqual(["creator"]);
  });

  /**
   * A scope naming several values is narrowed meaningfully by a filter, which is
   * the whole point of ANDing them; only a scope naming exactly one leaves the
   * member nothing to pick but emptiness.
   */
  test("keeps a category its scope only narrows", () => {
    expect(settledFilterCategories({ ...everyIssueScope, assigneeIdentifiers: ["u1", "u2"] })).toEqual([]);
    expect(settledFilterCategories({ ...everyIssueScope, stateTypes: ["backlog", "started"] })).toEqual([]);
    expect(settledFilterCategories(everyIssueScope)).toEqual([]);
  });
});
