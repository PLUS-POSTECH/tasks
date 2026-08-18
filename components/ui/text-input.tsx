import type { InputHTMLAttributes, Ref } from "react";

import { classNames } from "@/lib/utilities/class-names";

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  readonly ref?: Ref<HTMLInputElement>;
};

export const TextInput = ({ className, ref, ...rest }: TextInputProps) => (
  <input
    ref={ref}
    className={classNames(
      "h-8 w-full rounded-md border border-border bg-background px-2.5 text-[13px] text-foreground outline-none placeholder:text-foreground-quaternary focus:border-accent disabled:opacity-50",
      className,
    )}
    {...rest}
  />
);
