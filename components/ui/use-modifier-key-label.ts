"use client";

import { useSyncExternalStore } from "react";

import { isApplePlatform } from "@/lib/utilities/keyboard";

const subscribe = () => () => undefined;

/**
 * The server and the first client render always report "Ctrl" so hydration
 * never mismatches; the label switches right after mount.
 */
export const useModifierKeyLabel = (): string =>
  useSyncExternalStore(
    subscribe,
    () => (isApplePlatform() ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
