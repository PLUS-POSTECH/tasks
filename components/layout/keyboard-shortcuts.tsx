"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useLazyOverlay } from "@/components/ui/use-lazy-overlay";
import { isEditableTarget, isOverlayOpen } from "@/lib/utilities/keyboard";

const sequenceTimeoutMilliseconds = 900;

const goSequences: Readonly<Record<string, string>> = {
  i: "/inbox",
  m: "/my-issues",
  p: "/projects",
  s: "/settings",
  a: "/issues",
  b: "/issues/backlog",
};

export const KeyboardShortcuts = () => {
  const router = useRouter();
  const { openOverlay, overlay } = useLazyOverlay<Record<string, never>>(
    () => import("./keyboard-shortcuts-sheet"),
  );

  useEffect(() => {
    let pendingGo: number | null = null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key === "?" && !isOverlayOpen()) {
        event.preventDefault();
        openOverlay({});
        return;
      }
      if (isOverlayOpen()) {
        return;
      }
      if (pendingGo !== null) {
        const destination = goSequences[event.key.toLowerCase()];
        window.clearTimeout(pendingGo);
        pendingGo = null;
        if (destination) {
          event.preventDefault();
          router.push(destination);
        }
        return;
      }
      if (event.key === "g") {
        pendingGo = window.setTimeout(() => {
          pendingGo = null;
        }, sequenceTimeoutMilliseconds);
      }
    };

    const handleShowShortcuts = () => openOverlay({});

    // Captured rather than bubbled: the issue list's own window listener is
    // registered first (effects run from the leaves up), and the second key of a
    // "G then a letter" sequence is one of its shortcuts too.
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("tasks:show-shortcuts", handleShowShortcuts);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("tasks:show-shortcuts", handleShowShortcuts);
      if (pendingGo !== null) {
        window.clearTimeout(pendingGo);
      }
    };
  }, [router, openOverlay]);

  return overlay;
};
