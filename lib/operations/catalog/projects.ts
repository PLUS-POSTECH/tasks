import { z } from "zod";

import { projectStatuses } from "@/lib/database/schema/enum-values";
import { NotFoundError } from "@/lib/errors";
import { createProject, updateProject } from "@/lib/projects/actions";
import { getProjectDetail, listProjects } from "@/lib/projects/queries";

import { defineOperation } from "../define";
import { calendarDate, identifier } from "./shared";


export const projectOperations = [
  defineOperation({
    name: "projects.list",
    description: "List projects the actor can see with progress and lead.",
    readOnly: true,
    input: z.object({}),
    run: () => listProjects(),
  }),
  defineOperation({
    name: "projects.get",
    description: "Project detail: members, milestones, health updates, access roles.",
    readOnly: true,
    input: z.object({ identifier }),
    run: async (input) => {
      const project = await getProjectDetail(input.identifier);
      if (!project) {
        throw new NotFoundError("Project not found.");
      }
      return project;
    },
  }),
  defineOperation({
    name: "projects.create",
    description: "Create a project.",
    readOnly: false,
    input: z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(2_000).optional(),
      status: z.enum(projectStatuses).optional(),
      leadIdentifier: identifier.optional(),
      targetDate: calendarDate.optional(),
    }),
    run: (input) =>
      createProject({
        name: input.name,
        description: input.description ?? null,
        ...(input.status ? { status: input.status } : {}),
        leadIdentifier: input.leadIdentifier ?? null,
        targetDate: input.targetDate ?? null,
      }),
  }),
  defineOperation({
    name: "projects.update",
    description: "Change project properties; omitted fields are left as they are.",
    readOnly: false,
    input: z.object({
      identifier,
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(2_000).nullable().optional(),
      status: z.enum(projectStatuses).optional(),
      leadIdentifier: identifier.nullable().optional(),
      startDate: calendarDate.nullable().optional(),
      targetDate: calendarDate.nullable().optional(),
    }),
    run: async ({ identifier: projectIdentifier, ...patch }) => {
      await updateProject(projectIdentifier, patch);
      return getProjectDetail(projectIdentifier);
    },
  }),
];
