/**
 * Failures the domain expects, so callers react to `kind` rather than matching
 * on message text: each transport maps it onto its own vocabulary.
 */
export class NotFoundError extends Error {
  readonly kind = "not-found";
}

export class ForbiddenError extends Error {
  readonly kind = "forbidden";
}

export class UnknownOperationError extends Error {
  readonly kind = "unknown-operation";

  constructor(readonly operationName: string) {
    super(`Unknown operation "${operationName}".`);
  }
}

/** Input a boundary refused; `issues` is the treeified validation report. */
export class InvalidInputError extends Error {
  readonly kind = "invalid-input";

  constructor(readonly issues: unknown) {
    super("Invalid input.");
  }
}

/**
 * The caller proved who they are, but that person is no longer a member: a
 * token outlives the membership it was created with, and members who left the
 * Discord server keep no access.
 */
export class MembershipRequiredError extends Error {
  readonly kind = "membership-required";

  constructor() {
    super("Authentication required.");
  }
}
