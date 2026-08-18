"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { classNames } from "@/lib/utilities/class-names";

import { focusFirstField } from "./focus-first-field";

/**
 * Panels carry `data-dialog` and their portals are appended to the body as they
 * open, so the last one in the document is the most recently opened.
 */
const isTopmostDialog = (panel: HTMLElement | null): boolean => {
  const panels = document.querySelectorAll<HTMLElement>("[data-dialog]");
  return panel !== null && panels[panels.length - 1] === panel;
};

type DialogProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly className?: string;
  readonly ariaLabel: string;
  readonly placement?: "center" | "top";
};

export const Dialog = ({
  open,
  onClose,
  children,
  className,
  ariaLabel,
  placement = "center",
}: DialogProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    previouslyFocused.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    focusFirstField(panelRef.current);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus({ preventScroll: true });
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      // A popover open inside the dialog owns Escape; the dialog closes on the next press.
      if (document.querySelector("[data-popover]")) {
        return;
      }
      // Every open dialog listens on the document, where `stopPropagation`
      // cannot reach a sibling listener on the same node, so one press would
      // close the whole stack.
      if (!isTopmostDialog(panelRef.current)) {
        return;
      }
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className={classNames(
        "fixed inset-0 z-[70] flex justify-center bg-overlay p-2 animate-fade-in sm:p-4",
        placement === "top" ? "items-start pt-4 sm:pt-[12vh]" : "items-center",
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        data-dialog=""
        aria-modal="true"
        aria-label={ariaLabel}
        className={classNames(
          "flex max-h-[92vh] w-full flex-col overflow-hidden rounded-xl bg-surface shadow-dialog animate-slide-up sm:max-h-[85vh]",
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};
