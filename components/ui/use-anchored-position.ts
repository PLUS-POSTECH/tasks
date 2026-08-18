"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

export type PopoverSide = "top" | "bottom" | "left" | "right";
export type PopoverAlign = "start" | "center" | "end";

export type AnchoredPosition = {
  readonly top: number;
  readonly left: number;
  readonly maxHeight: number;
};

const viewportPadding = 8;
const gap = 4;

export const useAnchoredPosition = (
  anchorRef: RefObject<HTMLElement | null>,
  floatingRef: RefObject<HTMLElement | null>,
  open: boolean,
  side: PopoverSide,
  align: PopoverAlign,
): AnchoredPosition | null => {
  const [position, setPosition] = useState<AnchoredPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const update = () => {
      const anchor = anchorRef.current;
      const floating = floatingRef.current;
      if (!anchor || !floating) {
        return;
      }
      const anchorRect = anchor.getBoundingClientRect();
      const floatingRect = floating.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const spaceBelow = viewportHeight - anchorRect.bottom - viewportPadding;
      const spaceAbove = anchorRect.top - viewportPadding;
      const resolvedSide: PopoverSide =
        side === "bottom" &&
        floatingRect.height > spaceBelow &&
        spaceAbove > spaceBelow
          ? "top"
          : side === "top" &&
              floatingRect.height > spaceAbove &&
              spaceBelow > spaceAbove
            ? "bottom"
            : side;

      const alignedLeft = () => {
        switch (align) {
          case "start":
            return anchorRect.left;
          case "center":
            return anchorRect.left + anchorRect.width / 2 - floatingRect.width / 2;
          case "end":
            return anchorRect.right - floatingRect.width;
        }
      };
      const alignedTop = () => {
        switch (align) {
          case "start":
            return anchorRect.top;
          case "center":
            return anchorRect.top + anchorRect.height / 2 - floatingRect.height / 2;
          case "end":
            return anchorRect.bottom - floatingRect.height;
        }
      };

      const rawTop =
        resolvedSide === "bottom"
          ? anchorRect.bottom + gap
          : resolvedSide === "top"
            ? anchorRect.top - gap - floatingRect.height
            : alignedTop();
      const rawLeft =
        resolvedSide === "right"
          ? anchorRect.right + gap
          : resolvedSide === "left"
            ? anchorRect.left - gap - floatingRect.width
            : alignedLeft();

      const left = Math.min(
        Math.max(rawLeft, viewportPadding),
        Math.max(viewportPadding, viewportWidth - floatingRect.width - viewportPadding),
      );
      const top = Math.max(rawTop, viewportPadding);
      const maxHeight =
        resolvedSide === "top"
          ? Math.max(120, anchorRect.top - gap - viewportPadding)
          : Math.max(120, viewportHeight - top - viewportPadding);

      setPosition({ top, left, maxHeight });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, side, align, anchorRef, floatingRef]);

  return open ? position : null;
};
