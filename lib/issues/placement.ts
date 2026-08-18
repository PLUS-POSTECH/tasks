/**
 * Which two rows a dropped one landed between — named, not measured, so that
 * `placeIssueInManualOrder` takes the position from the rows as they are now
 * rather than from a number the browser computed.
 */
export type IssuePlacement = {
  /** The row the dropped one now sits under; null at the top of the column. */
  readonly aboveIssueIdentifier: string | null;
  /** The row it now sits above; null at the bottom. */
  readonly belowIssueIdentifier: string | null;
};

/**
 * The neighbours of a drop at `dropIndex`, in a column that is still showing
 * the row being dragged — which is one of the cards the index counts, and
 * cannot be its own neighbour.
 */
export const placementForDrop = (
  orderedIssueIdentifiers: readonly string[],
  dropIndex: number,
  movedIssueIdentifier: string,
): IssuePlacement => {
  const remaining = orderedIssueIdentifiers.filter((identifier) => identifier !== movedIssueIdentifier);
  const movedIndex = orderedIssueIdentifiers.indexOf(movedIssueIdentifier);
  const insertionIndex = movedIndex !== -1 && movedIndex < dropIndex ? dropIndex - 1 : dropIndex;
  return {
    aboveIssueIdentifier: remaining[insertionIndex - 1] ?? null,
    belowIssueIdentifier: remaining[insertionIndex] ?? null,
  };
};
