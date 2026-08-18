export type SelectionAction = "select" | "deselect";

/**
 * The row a shift-click measures its range from, and what clicking it did: a
 * range extends the action the anchor started, so deselecting a row and then
 * shift-clicking away from it deselects rather than adds.
 */
export type SelectionAnchor = {
  readonly issueIdentifier: string;
  readonly action: SelectionAction;
};

export type IssueSelection = {
  readonly identifiers: ReadonlySet<string>;
  readonly anchor: SelectionAnchor | null;
};

export const emptyIssueSelection: IssueSelection = { identifiers: new Set(), anchor: null };

const identifiersBetween = (
  visibleIdentifiers: readonly string[],
  fromIdentifier: string,
  toIdentifier: string,
): readonly string[] | null => {
  const fromIndex = visibleIdentifiers.indexOf(fromIdentifier);
  const toIndex = visibleIdentifiers.indexOf(toIdentifier);
  if (fromIndex === -1 || toIndex === -1) {
    return null;
  }
  const [start, end] = fromIndex < toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
  return visibleIdentifiers.slice(start, end + 1);
};

const applied = (
  identifiers: ReadonlySet<string>,
  changed: readonly string[],
  action: SelectionAction,
): ReadonlySet<string> => {
  const next = new Set(identifiers);
  for (const identifier of changed) {
    if (action === "select") {
      next.add(identifier);
    } else {
      next.delete(identifier);
    }
  }
  return next;
};

export const toggleIssueSelection = (
  selection: IssueSelection,
  visibleIdentifiers: readonly string[],
  issueIdentifier: string,
  extendRange: boolean,
): IssueSelection => {
  const { anchor } = selection;
  if (extendRange && anchor !== null) {
    const range = identifiersBetween(visibleIdentifiers, anchor.issueIdentifier, issueIdentifier);
    if (range !== null) {
      return {
        identifiers: applied(selection.identifiers, range, anchor.action),
        anchor: { issueIdentifier, action: anchor.action },
      };
    }
  }
  const action: SelectionAction = selection.identifiers.has(issueIdentifier) ? "deselect" : "select";
  return {
    identifiers: applied(selection.identifiers, [issueIdentifier], action),
    anchor: { issueIdentifier, action },
  };
};

/**
 * What a bulk action may touch: the selected rows that are on screen — on
 * screen, not merely loaded, so a collapsed group's rows stay in the selection
 * but out of reach. Deduplicated: grouping by label puts one issue in several
 * groups, and a batch must not name the same issue twice.
 */
export const selectedVisibleIdentifiers = (
  selection: IssueSelection,
  visibleIdentifiers: readonly string[],
): readonly string[] => [
  ...new Set(visibleIdentifiers.filter((identifier) => selection.identifiers.has(identifier))),
];

/**
 * Whether two renders of a list are about the same issues — what decides when a
 * selection is thrown away rather than masked, a selection made in the old set
 * meaning nothing in the new one.
 */
export const sameIssueSet = (left: readonly string[], right: readonly string[]): boolean => {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && [...leftSet].every((identifier) => rightSet.has(identifier));
};
