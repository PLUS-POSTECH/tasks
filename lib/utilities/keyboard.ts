/** True when a keyboard event originates from a text input, textarea, or editable region. */
export const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    target.isContentEditable
  );
};

/** True when a modal dialog or menu popover is currently open. */
export const isOverlayOpen = (): boolean =>
  document.querySelector('[role="dialog"]') !== null;

export const isApplePlatform = (): boolean =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
