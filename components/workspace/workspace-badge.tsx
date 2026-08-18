import { classNames } from "@/lib/utilities/class-names";

type WorkspaceBadgeProps = {
  readonly name: string;
  readonly iconUrl: string | null;
  readonly size?: number;
  readonly className?: string;
};

export const WorkspaceBadge = ({ name, iconUrl, size = 18, className }: WorkspaceBadgeProps) => (
  <span
    aria-hidden
    className={classNames(
      "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden bg-accent font-bold leading-none text-accent-foreground",
      className,
    )}
    style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.5)) }}
  >
    {name.slice(0, 1).toUpperCase()}
    {iconUrl ? (
      // eslint-disable-next-line @next/next/no-img-element -- fixed-size CDN thumbnail; the optimizer would proxy it for no gain.
      <img src={iconUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
    ) : null}
  </span>
);
