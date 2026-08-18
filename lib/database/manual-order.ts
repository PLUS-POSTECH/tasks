/**
 * Manual order is stored as `double precision` because a drop is written as the
 * midpoint of its two neighbours, and `real` quantises so coarsely that the
 * midpoint of two adjacent positions is one of them again. Even float8 runs out
 * after roughly fifty midpoints, which an ordinary list reaches, so
 * `manualOrderBetween` answers "no room" rather than a position already taken
 * and its caller renumbers the order and asks again.
 */

export const manualOrderBefore = (lowestInUse: number | null): number => (lowestInUse ?? 0) - 1;

export const manualOrderAfter = (highestInUse: number | null): number => (highestInUse ?? 0) + 1;

/**
 * Null when the gap between the two has closed. `above` is the neighbour that
 * sorts first, but the pair is read as an interval rather than an ordered pair:
 * a page that rendered before somebody moved one can name them the other way.
 */
export const manualOrderBetween = (above: number | null, below: number | null): number | null => {
  if (above === null) {
    return below === null ? null : manualOrderBefore(below);
  }
  if (below === null) {
    return manualOrderAfter(above);
  }
  const lower = Math.min(above, below);
  const upper = Math.max(above, below);
  const midpoint = (lower + upper) / 2;
  return midpoint > lower && midpoint < upper ? midpoint : null;
};
