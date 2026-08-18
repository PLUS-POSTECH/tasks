import type { ProjectStatus } from "@/lib/database/schema";

export type ProjectSummary = {
  readonly identifier: string;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly status: ProjectStatus;
};
