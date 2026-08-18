"use client";

import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";

import { lazyOverlay } from "./lazy";

type OverlayProps<Payload extends object> = Payload & {
  readonly open: boolean;
  readonly onClose: () => void;
};

/** Absent from the tree until first opened; every later opening remounts it with a fresh `key`. */
type OverlayState<Payload extends object> =
  | { readonly status: "never-opened" }
  | { readonly status: "open" | "closed"; readonly payload: Payload; readonly key: number };

export type LazyOverlayController<Payload extends object> = {
  readonly isOpen: boolean;
  readonly openOverlay: (payload: Payload) => void;
  readonly closeOverlay: () => void;
  readonly overlay: ReactNode;
};

export const useLazyOverlay = <Payload extends object>(
  load: () => Promise<{ readonly default: ComponentType<OverlayProps<Payload>> }>,
): LazyOverlayController<Payload> => {
  const [{ Component, warmUp }] = useState(() => lazyOverlay<OverlayProps<Payload>>(load));
  const [state, setState] = useState<OverlayState<Payload>>({ status: "never-opened" });

  const openOverlay = useCallback((payload: Payload) => {
    setState((current) => ({
      status: "open",
      payload,
      key: current.status === "never-opened" ? 1 : current.key + 1,
    }));
  }, []);

  const closeOverlay = useCallback(() => {
    setState((current) =>
      current.status === "never-opened" ? current : { ...current, status: "closed" },
    );
  }, []);

  useEffect(warmUp, [warmUp]);

  return {
    isOpen: state.status === "open",
    openOverlay,
    closeOverlay,
    overlay:
      state.status === "never-opened" ? null : (
        <Component
          key={state.key}
          {...state.payload}
          open={state.status === "open"}
          onClose={closeOverlay}
        />
      ),
  };
};
