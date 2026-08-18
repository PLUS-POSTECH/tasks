import { z } from "zod";

import { InvalidInputError, MembershipRequiredError, UnknownOperationError } from "@/lib/errors";
import { findCurrentUser } from "@/lib/session/current-user";

import { catalog } from "./catalog";
import type { AnyOperation } from "./define";

const operationsByName = new Map<string, AnyOperation>(catalog.map((operation) => [operation.name, operation]));

export const findOperation = (name: string): AnyOperation | undefined => operationsByName.get(name);

export type OperationDescriptor = {
  readonly name: string;
  readonly description: string;
  readonly readOnly: boolean;
  readonly inputSchema: Record<string, unknown>;
};

const descriptors: readonly OperationDescriptor[] = catalog.map((operation) => ({
  name: operation.name,
  description: operation.description,
  readOnly: operation.readOnly,
  inputSchema: z.toJSONSchema(operation.input, { io: "input" }) as Record<string, unknown>,
}));

/** Machine-readable catalog; MCP `tools/list` maps onto this one-to-one. */
export const listOperations = (): readonly OperationDescriptor[] => descriptors;

/**
 * Runs an operation as the current actor. Every failure is a domain error;
 * each transport decides what it looks like on the wire.
 */
export const runOperation = async (name: string, rawInput: unknown): Promise<unknown> => {
  const operation = findOperation(name);
  if (!operation) {
    throw new UnknownOperationError(name);
  }
  const user = await findCurrentUser();
  if (!user) {
    throw new MembershipRequiredError();
  }
  const parsed = operation.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    throw new InvalidInputError(z.treeifyError(parsed.error));
  }
  return operation.run(parsed.data, { user });
};
