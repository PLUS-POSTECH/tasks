import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

import { classNames } from "@/lib/utilities/class-names";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "small" | "medium";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly leadingIcon?: ReactNode;
  readonly trailingIcon?: ReactNode;
  readonly ref?: Ref<HTMLButtonElement>;
};

const variantClasses: Readonly<Record<ButtonVariant, string>> = {
  primary:
    "bg-accent text-accent-foreground hover:bg-accent-hover shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]",
  secondary:
    "bg-surface text-foreground border border-border hover:bg-background-tertiary hover:border-border-strong",
  ghost:
    "text-foreground-secondary hover:bg-background-tertiary hover:text-foreground",
  danger: "bg-danger text-white hover:brightness-110",
};

const sizeClasses: Readonly<Record<ButtonSize, string>> = {
  small: "h-6 px-2 text-xs gap-1.5 rounded-md",
  medium: "h-7 px-2.5 text-[13px] gap-1.5 rounded-md",
};

export const Button = ({
  variant = "secondary",
  size = "medium",
  leadingIcon,
  trailingIcon,
  className,
  children,
  type = "button",
  ref,
  ...rest
}: ButtonProps) => (
  <button
    ref={ref}
    type={type}
    className={classNames(
      "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
      variantClasses[variant],
      sizeClasses[size],
      className,
    )}
    {...rest}
  >
    {leadingIcon}
    {children}
    {trailingIcon}
  </button>
);
