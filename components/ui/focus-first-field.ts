/**
 * Where an overlay puts the keyboard when it opens, in priority order. The
 * order has to be separate queries: one `querySelector` with every branch in a
 * single comma-separated selector returns whichever branch happens to come
 * first in the document instead.
 */
const focusTargetSelectors = [
  "[data-autofocus]",
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]',
  'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
] as const;

export const focusFirstField = (container: HTMLElement | null): void => {
  if (!container) {
    return;
  }
  for (const selector of focusTargetSelectors) {
    const target = container.querySelector<HTMLElement>(selector);
    if (target) {
      target.focus({ preventScroll: true });
      return;
    }
  }
};
