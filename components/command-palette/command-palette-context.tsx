"use client";

import { createContext, useContext } from "react";

export type CommandPaletteContextValue = {
  readonly openCommandPalette: (initialQuery?: string) => void;
};

export const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export const useCommandPalette = (): CommandPaletteContextValue => {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error("useCommandPalette must be used inside CommandPaletteProvider.");
  }
  return context;
};
