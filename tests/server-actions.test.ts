import { Glob } from "bun";
import { describe, expect, test } from "bun:test";

import { callerPolicy } from "@/lib/session/action";

const repositoryRoot = new URL("..", import.meta.url).pathname;

/**
 * Who may call each server action. Server actions are HTTP endpoints and
 * nothing upstream authenticates them, so this is the whole access-control
 * surface of the app in one place: "member" is any signed-in member of the
 * Discord server, "admin" administers the workspace itself, and "anyone" is
 * reachable signed out. Adding an action or widening its reach has to be
 * written down here, which is the point.
 */
const expectedPolicies: Readonly<Record<string, "member" | "admin" | "anyone">> = {
  addComment: "member",
  addIssueRelation: "member",
  addProjectUpdate: "member",
  archiveAllReadNotifications: "member",
  archiveNotification: "member",
  bulkUpdateIssues: "member",
  createApiToken: "member",
  createDiscordWebhook: "member",
  createIssue: "member",
  createIssueReminder: "member",
  createLabel: "member",
  createMilestone: "member",
  createProject: "member",
  createWorkflowState: "member",
  deleteComment: "member",
  deleteDiscordWebhook: "admin",
  deleteIssue: "member",
  deleteIssueReminder: "member",
  deleteLabel: "admin",
  deleteMilestone: "member",
  deleteProject: "member",
  deleteProjectUpdate: "member",
  deleteWorkflowState: "admin",
  editComment: "member",
  markAllNotificationsRead: "member",
  markNotificationRead: "member",
  moveIssueOnBoard: "member",
  removeIssueRelation: "member",
  removeMember: "admin",
  reorderIssue: "member",
  reorderWorkflowState: "member",
  revokeApiToken: "member",
  searchIssues: "member",
  sendIssueReminderNow: "member",
  setAdminRoles: "admin",
  setIssueAssignee: "member",
  setIssueDueDate: "member",
  setIssueEstimate: "member",
  setIssueLabels: "member",
  setIssueMilestone: "member",
  setIssueParent: "member",
  setIssuePriority: "member",
  setIssueProject: "member",
  setIssueState: "member",
  setMemberAdmin: "admin",
  setProjectAccessRoles: "member",
  setThemePreference: "anyone",
  syncMembersNow: "member",
  testDiscordWebhook: "member",
  toggleIssueSubscription: "member",
  toggleProjectMember: "member",
  unarchiveNotification: "member",
  updateAuthSettings: "anyone",
  updateIssueDescription: "member",
  updateIssueTitle: "member",
  updateLabel: "member",
  updateMilestone: "member",
  updateOwnProfile: "member",
  updateProject: "member",
  updateWorkflowState: "member",
  updateWorkspace: "admin",
};

/** Every module whose first line makes its exports callable over HTTP. */
const serverActionModules = async (): Promise<string[]> => {
  const found: string[] = [];
  for await (const path of new Glob("{app,lib}/**/*.{ts,tsx}").scan({ cwd: repositoryRoot })) {
    const source = await Bun.file(`${repositoryRoot}${path}`).text();
    if (/^\s*["']use server["'];/.test(source)) {
      found.push(path);
    }
  }
  return found.sort();
};

const actualPolicies = async (): Promise<Record<string, string>> => {
  const policies: Record<string, string> = {};
  for (const path of await serverActionModules()) {
    const exported: Record<string, unknown> = await import(`${repositoryRoot}${path}`);
    for (const [name, value] of Object.entries(exported)) {
      if (typeof value === "function") {
        policies[name] = String((value as unknown as Record<symbol, unknown>)[callerPolicy] ?? "UNDECLARED");
      }
    }
  }
  return policies;
};

/**
 * Actions any member may call which then refuse inside the body, and what each
 * one checks. `callerPolicy` is about the door; these are the rooms behind it.
 * They are written down here for the same reason the policies are: a rule that
 * lives only in a function body is one nobody notices being removed.
 */
const memberActionsThatCheckMoreInside: Readonly<Record<string, string>> = {
  deleteComment: "the comment's author, or an admin",
  deleteIssue: "the issue's creator, or an admin",
  deleteProject: "an admin or the project lead, and only once no issue points at it",
  deleteProjectUpdate: "the update's author, or an admin",
  editComment: "the comment's author",
  setProjectAccessRoles: "an admin or the project lead",
  toggleProjectMember: "an admin or the project lead",
  updateProject: "an admin or the project lead, for `leadIdentifier`; the rest is any member",
};

describe("server actions", () => {
  test("every action declares who may call it, and nothing has quietly widened", async () => {
    expect(await actualPolicies()).toEqual(expectedPolicies);
  });

  test("the actions that ask for more than the door does still stand at that door", () => {
    for (const name of Object.keys(memberActionsThatCheckMoreInside)) {
      expect(expectedPolicies[name]).toBe("member");
    }
  });

  test("the admin surface is workspace administration, not everyday work", () => {
    const admin = Object.entries(expectedPolicies)
      .filter(([, policy]) => policy === "admin")
      .map(([name]) => name);
    expect(admin.filter((name) => /Issue|Comment|Project|Notification|Milestone/.test(name))).toEqual([]);
    expect(admin).toContain("updateWorkspace");
    expect(admin).toContain("setMemberAdmin");
  });
});
