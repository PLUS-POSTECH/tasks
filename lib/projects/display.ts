import { projectHealths, projectStatuses, type ProjectHealth, type ProjectStatus } from "@/lib/database/schema/enum-values";

export type ProjectStatusDefinition = {
  readonly status: ProjectStatus;
  readonly name: string;
  readonly color: string;
  readonly order: number;
};

/** Keyed by the enum, so a new status cannot be forgotten here. */
const statusDefinitions: Readonly<Record<ProjectStatus, ProjectStatusDefinition>> = {
  backlog: { status: "backlog", name: "Backlog", color: "#8a8f98", order: 0 },
  planned: { status: "planned", name: "Planned", color: "#8a8f98", order: 1 },
  started: { status: "started", name: "In Progress", color: "#f2c94c", order: 2 },
  paused: { status: "paused", name: "Paused", color: "#95a2b3", order: 3 },
  completed: { status: "completed", name: "Completed", color: "#5e6ad2", order: 4 },
  canceled: { status: "canceled", name: "Canceled", color: "#95a2b3", order: 5 },
};

/** In the order the enum declares, which is the order the menus show. */
export const projectStatusDefinitions: readonly ProjectStatusDefinition[] = projectStatuses.map(
  (status) => statusDefinitions[status],
);

export const projectStatusDefinition = (status: ProjectStatus): ProjectStatusDefinition => statusDefinitions[status];

export type ProjectHealthDefinition = {
  readonly health: ProjectHealth;
  readonly name: string;
  readonly color: string;
};

const healthDefinitions: Readonly<Record<ProjectHealth, ProjectHealthDefinition>> = {
  on_track: { health: "on_track", name: "On track", color: "#27ae60" },
  at_risk: { health: "at_risk", name: "At risk", color: "#f2994a" },
  off_track: { health: "off_track", name: "Off track", color: "#eb5757" },
};

export const projectHealthDefinitions: readonly ProjectHealthDefinition[] = projectHealths.map(
  (health) => healthDefinitions[health],
);

export const projectHealthDefinition = (health: ProjectHealth): ProjectHealthDefinition => healthDefinitions[health];
