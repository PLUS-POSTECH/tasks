import { workflowStateTypes, type WorkflowStateType } from "@/lib/database/schema/enum-values";

export type WorkflowStateTypeDefinition = {
  readonly type: WorkflowStateType;
  readonly name: string;
  readonly order: number;
};

/** Keyed by the enum, so a new state type cannot be forgotten here. */
const definitions: Readonly<Record<WorkflowStateType, WorkflowStateTypeDefinition>> = {
  backlog: { type: "backlog", name: "Backlog", order: 1 },
  unstarted: { type: "unstarted", name: "Unstarted", order: 2 },
  started: { type: "started", name: "Started", order: 3 },
  completed: { type: "completed", name: "Completed", order: 4 },
  canceled: { type: "canceled", name: "Canceled", order: 5 },
};

/** In the order the enum declares, which is the order the menus show. */
export const workflowStateTypeDefinitions: readonly WorkflowStateTypeDefinition[] = workflowStateTypes.map(
  (type) => definitions[type],
);

export const workflowStateTypeOrder = (type: WorkflowStateType): number => definitions[type].order;

type DisplayOrderedState = {
  readonly type: WorkflowStateType;
  readonly position: number;
};

/**
 * Every consumer that shows states side by side sorts with this, so a state
 * cannot sit in one place on a board and another in a menu.
 */
export const compareWorkflowStatesForDisplay = (
  left: DisplayOrderedState,
  right: DisplayOrderedState,
): number =>
  workflowStateTypeOrder(left.type) - workflowStateTypeOrder(right.type) || left.position - right.position;

type PositionedState = {
  readonly identifier: string;
  readonly type: WorkflowStateType;
  readonly position: number;
};

/**
 * Fill ratio for a started state's glyph: the first started state is barely
 * filled, the last nearly complete.
 */
export const startedStateProgress = (
  states: readonly PositionedState[],
  stateIdentifier: string,
): number => {
  const started = states
    .filter((state) => state.type === "started")
    .sort((left, right) => left.position - right.position);
  const index = started.findIndex((state) => state.identifier === stateIdentifier);
  if (index === -1 || started.length === 0) {
    return 0.5;
  }
  return (index + 1) / (started.length + 1);
};
