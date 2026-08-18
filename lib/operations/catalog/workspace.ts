import { z } from "zod";

import { listDiscordWebhooks } from "@/lib/reminders/queries";
import { getWorkspace } from "@/lib/workspace/queries";
import { listLabels } from "@/lib/labels/queries";
import { listStates } from "@/lib/workflow/queries";
import { listMembers } from "@/lib/users/queries";

import { defineOperation } from "../define";

export const workspaceOperations = [
  defineOperation({
    name: "workspace.get",
    description: "Workspace name, slug, time zone and the acting member.",
    readOnly: true,
    input: z.object({}),
    run: async (_input, { user }) => ({ workspace: await getWorkspace(), actor: user }),
  }),
  defineOperation({
    name: "workspace.members",
    description: "Members currently in the Discord server (assignable people).",
    readOnly: true,
    input: z.object({}),
    run: () => listMembers(),
  }),
  defineOperation({
    name: "workspace.states",
    description: "Workflow states with their type (backlog, unstarted, started, completed, canceled).",
    readOnly: true,
    input: z.object({}),
    run: () => listStates(),
  }),
  defineOperation({
    name: "workspace.labels",
    description: "Labels available for issues.",
    readOnly: true,
    input: z.object({}),
    run: () => listLabels(),
  }),
  defineOperation({
    name: "workspace.webhooks",
    description: "Discord webhooks that reminders can post to (URLs masked).",
    readOnly: true,
    input: z.object({}),
    run: () => listDiscordWebhooks(),
  }),
];
