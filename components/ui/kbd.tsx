import { classNames } from "@/lib/utilities/class-names";

type KbdProps = {
  readonly keys: string;
  readonly className?: string;
};

export const Kbd = ({ keys, className }: KbdProps) => (
  <span className={classNames("inline-flex items-center gap-0.5", className)}>
    {keys.split(" ").map((key, index) => (
      <kbd
        key={`${key}-${index}`}
        className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border bg-background-tertiary px-1 font-sans text-[10px] font-medium text-foreground-tertiary"
      >
        {key}
      </kbd>
    ))}
  </span>
);
