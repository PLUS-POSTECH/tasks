import type { ButtonHTMLAttributes } from "react";

import { classNames } from "@/lib/utilities/class-names";

export type IconButtonSize = "rail" | "compact" | "touch" | "inline";

export type IconButtonTone =
  | "muted"
  | "danger"
  | "subtle"
  | "subtle-danger"
  | "secondary";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly size: IconButtonSize;
  readonly tone: IconButtonTone;
  /**
   * Tailwind `md:group-hover/<name>:opacity-100` class naming the group whose
   * hover reveals this button; it then rests at `md:opacity-0`. A plain
   * `opacity-0` would leave it permanently invisible on a touch screen.
   */
  readonly revealOnGroupHover?: string;
};

const sizeClasses: Readonly<Record<IconButtonSize, string>> = {
  rail: "flex h-7 w-7 items-center justify-center rounded-md",
  compact: "flex h-6 w-6 items-center justify-center rounded",
  touch: "flex h-9 w-9 items-center justify-center rounded-md",
  inline: "rounded p-1",
};

type ToneStyle = {
  readonly resting: string;
  readonly hover: string;
};

const toneStyles: Readonly<Record<IconButtonTone, ToneStyle>> = {
  muted: {
    resting: "text-foreground-tertiary",
    hover: "hover:bg-background-tertiary hover:text-foreground",
  },
  danger: {
    resting: "text-foreground-tertiary",
    hover: "hover:bg-background-tertiary hover:text-danger",
  },
  subtle: {
    resting: "text-foreground-quaternary",
    hover: "hover:bg-background-tertiary hover:text-foreground",
  },
  "subtle-danger": {
    resting: "text-foreground-quaternary",
    hover: "hover:bg-background-tertiary hover:text-danger",
  },
  secondary: {
    resting: "text-foreground-secondary",
    hover: "hover:bg-background-tertiary",
  },
};

export const IconButton = ({
  size,
  tone,
  revealOnGroupHover,
  className,
  children,
  type = "button",
  ...rest
}: IconButtonProps) => {
  const { resting, hover } = toneStyles[tone];
  return (
    <button
      type={type}
      className={classNames(
        sizeClasses[size],
        resting,
        revealOnGroupHover ? "md:opacity-0" : undefined,
        hover,
        revealOnGroupHover,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
};
