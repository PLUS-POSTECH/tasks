import { priorities, type Priority } from "@/lib/database/schema/enum-values";

export type PriorityDefinition = {
  readonly value: Priority;
  readonly name: string;
  readonly shortcut: string;
};

const definitions: Readonly<Record<Priority, PriorityDefinition>> = {
  0: { value: 0, name: "No priority", shortcut: "0" },
  1: { value: 1, name: "Urgent", shortcut: "1" },
  2: { value: 2, name: "High", shortcut: "2" },
  3: { value: 3, name: "Medium", shortcut: "3" },
  4: { value: 4, name: "Low", shortcut: "4" },
};

export const priorityDefinitions: readonly PriorityDefinition[] = priorities.map((value) => definitions[value]);

export const isPriority = (value: number): value is Priority => priorities.some((priority) => priority === value);

export const priorityName = (priority: number): string =>
  isPriority(priority) ? definitions[priority].name : definitions[0].name;

/** Urgent first, "no priority" last. */
export const prioritySortKey = (priority: number): number =>
  priority === 0 ? 5 : priority;

