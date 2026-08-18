"use client";

import { classNames } from "@/lib/utilities/class-names";

export type SwitchSize = "medium" | "small";

type SwitchProps = {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
  readonly disabled?: boolean;
  readonly size?: SwitchSize;
};

const trackClasses: Readonly<Record<SwitchSize, string>> = {
  medium:
    "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
  small: "relative inline-flex h-4 w-7 items-center rounded-full transition-colors",
};

const knobClasses: Readonly<Record<SwitchSize, string>> = {
  medium: "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
  small: "inline-block h-3 w-3 rounded-full bg-white transition-transform",
};

const knobCheckedOffset: Readonly<Record<SwitchSize, string>> = {
  medium: "translate-x-[18px]",
  small: "translate-x-3.5",
};

export const Switch = ({
  checked,
  onChange,
  label,
  disabled = false,
  size = "medium",
}: SwitchProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={classNames(
      trackClasses[size],
      checked ? "bg-accent" : "bg-border-strong",
    )}
  >
    <span
      className={classNames(
        knobClasses[size],
        checked ? knobCheckedOffset[size] : "translate-x-0.5",
      )}
    />
  </button>
);
