"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

export const lazyOverlay = <Props extends object>(load: () => Promise<{ readonly default: ComponentType<Props> }>) => {
  const Component = dynamic(load, { ssr: false });
  const warmUp = () => {
    if (typeof window === "undefined") {
      return;
    }
    const schedule = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1500));
    schedule(() => void load());
  };
  return { Component, warmUp };
};
