"use client";

import { useCallback, useEffect, useMemo, type ReactNode } from "react";

import { isEditableTarget } from "@/lib/utilities/keyboard";

import { useLazyOverlay } from "@/components/ui/use-lazy-overlay";

import { CommandPaletteContext } from "./command-palette-context";

type CommandPalettePayload = {
  readonly initialQuery: string;
};

type CommandPaletteProviderProps = {
  readonly children: ReactNode;
};

export const CommandPaletteProvider = ({ children }: CommandPaletteProviderProps) => {
  const { isOpen, openOverlay, closeOverlay, overlay } = useLazyOverlay<CommandPalettePayload>(
    () => import("./command-palette"),
  );

  const openCommandPalette = useCallback(
    (initialQuery = "") => openOverlay({ initialQuery }),
    [openOverlay],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (isOpen) {
          closeOverlay();
        } else {
          openCommandPalette();
        }
        return;
      }
      if (event.key === "/" && !isEditableTarget(event.target) && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        openCommandPalette();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeOverlay, openCommandPalette]);

  const value = useMemo(() => ({ openCommandPalette }), [openCommandPalette]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {overlay}
    </CommandPaletteContext.Provider>
  );
};
