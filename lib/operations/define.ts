import type { z } from "zod";

import type { CurrentUser } from "@/lib/session/current-user";

export type OperationContext = {
  readonly user: CurrentUser;
};

/**
 * A transport-neutral unit of work: the same definition backs the HTTP
 * operations API and MCP tools, so a new capability is added here once.
 */
export type Operation<Input extends z.ZodType = z.ZodType, Output = unknown> = {
  readonly name: string;
  readonly description: string;
  readonly input: Input;
  readonly readOnly: boolean;
  readonly run: (input: z.output<Input>, context: OperationContext) => Promise<Output>;
};

export const defineOperation = <Input extends z.ZodType, Output>(
  operation: Operation<Input, Output>,
): Operation<Input, Output> => operation;

/** Widened element type for heterogenous catalogs (`run` is contravariant, hence `any`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyOperation = Operation<any, unknown>;
