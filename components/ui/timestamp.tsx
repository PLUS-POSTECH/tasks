"use client";

import { useSyncExternalStore } from "react";

import {
  formatCompactRelativeTime,
  formatLongDateTime,
  formatRelativeTime,
  type DateFormatOptions,
} from "@/lib/formatting/dates";

type TimestampProps = {
  readonly value: Date;
  readonly format: "compact" | "relative" | "absolute";
  readonly prefix?: string;
  readonly className?: string;
};

const subscribe = () => () => undefined;

const render = (value: Date, format: TimestampProps["format"], options: DateFormatOptions) =>
  format === "compact"
    ? formatCompactRelativeTime(value, options)
    : format === "absolute"
      ? formatLongDateTime(value, options)
      : formatRelativeTime(value, options);

/**
 * The server and the hydration pass format in UTC so the markup matches
 * whatever the browser's zone is; after mount the text is re-rendered in the
 * viewer's local zone.
 */
export const Timestamp = ({ value, format, prefix, className }: TimestampProps) => {
  const text = useSyncExternalStore(
    subscribe,
    () => render(value, format, {}),
    () => render(value, format, { timeZone: "UTC" }),
  );
  const title = useSyncExternalStore(
    subscribe,
    () => formatLongDateTime(value),
    () => formatLongDateTime(value, { timeZone: "UTC" }),
  );
  return (
    <time dateTime={value.toISOString()} title={title} className={className}>
      {prefix ? `${prefix} ` : ""}
      {text}
    </time>
  );
};
