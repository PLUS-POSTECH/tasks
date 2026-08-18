import type { AnyOperation } from "../define";
import { issueOperations } from "./issues";
import { projectOperations } from "./projects";
import { reminderOperations } from "./reminders";
import { workspaceOperations } from "./workspace";

export const catalog: readonly AnyOperation[] = [
  ...workspaceOperations,
  ...issueOperations,
  ...projectOperations,
  ...reminderOperations,
];
