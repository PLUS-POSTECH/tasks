"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { classNames } from "@/lib/utilities/class-names";

import { focusFirstField } from "./focus-first-field";
import {
  useAnchoredPosition,
  type PopoverAlign,
  type PopoverSide,
} from "./use-anchored-position";

type PopoverProps = {
  readonly trigger: ReactNode;
  readonly children: ReactNode | ((close: () => void) => ReactNode);
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly side?: PopoverSide;
  readonly align?: PopoverAlign;
  readonly className?: string;
  readonly disabled?: boolean;
};

export const Popover = ({
  trigger,
  children,
  open: controlledOpen,
  onOpenChange,
  side = "bottom",
  align = "start",
  className,
  disabled = false,
}: PopoverProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const floatingRef = useRef<HTMLDivElement>(null);
  const panelIdentifier = useId();
  const position = useAnchoredPosition(anchorRef, floatingRef, open, side, align);

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const close = useCallback(() => setOpen(false), [setOpen]);

  /**
   * Focus the panel only once it has a position: until then it is `invisible`,
   * and a `visibility: hidden` element cannot take focus. Keyed on whether a
   * position exists rather than on the position itself, so scrolling the page
   * does not keep pulling focus back.
   */
  const positioned = position !== null;
  useEffect(() => {
    if (!open || !positioned) {
      return;
    }
    focusFirstField(floatingRef.current);
  }, [open, positioned]);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) {
      const focusable = anchorRef.current?.querySelector<HTMLElement>(
        "button, [tabindex], a, input",
      );
      focusable?.focus({ preventScroll: true });
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open, close]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (
        anchorRef.current?.contains(target) ||
        floatingRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open, setOpen]);

  return (
    <>
      <span
        ref={anchorRef}
        className="inline-flex min-w-0"
        onClick={(event) => {
          if (disabled) {
            return;
          }
          event.stopPropagation();
          event.preventDefault();
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (disabled) {
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(!open);
          }
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelIdentifier : undefined}
      >
        {trigger}
      </span>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={floatingRef}
              id={panelIdentifier}
              role="dialog"
              data-popover=""
              onClick={(event) => event.stopPropagation()}
              className={classNames(
                // Above dialogs (z-70) so pickers opened inside a modal are not hidden behind it.
                "fixed z-[80] flex flex-col overflow-hidden rounded-lg bg-surface-raised text-foreground shadow-popover",
                position ? "animate-scale-in" : "invisible",
                className,
              )}
              style={
                position
                  ? {
                      top: position.top,
                      left: position.left,
                      maxHeight: position.maxHeight,
                    }
                  : { top: 0, left: 0 }
              }
            >
              {typeof children === "function" ? children(close) : children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
};
