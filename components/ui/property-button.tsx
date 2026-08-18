import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

import { classNames } from "@/lib/utilities/class-names";

export type PropertyButtonVariant = "chip" | "icon" | "row";

type PropertyButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly icon?: ReactNode;
  readonly variant?: PropertyButtonVariant;
  readonly muted?: boolean;
  readonly ref?: Ref<HTMLButtonElement>;
};

const variantClasses: Readonly<Record<PropertyButtonVariant, string>> = {
  chip: "h-6 gap-1.5 rounded-md border border-border bg-transparent px-1.5 text-xs hover:bg-background-tertiary hover:border-border-strong",
  icon: "h-6 w-6 rounded-md hover:bg-background-tertiary",
  row: "h-7 w-full gap-2 rounded-md px-1.5 text-[13px] hover:bg-background-tertiary justify-start",
};

export const PropertyButton = ({
  icon,
  variant = "chip",
  muted = false,
  className,
  children,
  type = "button",
  ref,
  ...rest
}: PropertyButtonProps) => (
  <button
    ref={ref}
    type={type}
    className={classNames(
      "inline-flex min-w-0 shrink-0 select-none items-center justify-center whitespace-nowrap transition-colors",
      muted ? "text-foreground-tertiary" : "text-foreground-secondary",
      variantClasses[variant],
      className,
    )}
    {...rest}
  >
    {icon ? (
      <span className="flex shrink-0 items-center justify-center">{icon}</span>
    ) : null}
    {children ? <span className="min-w-0 truncate">{children}</span> : null}
  </button>
);
