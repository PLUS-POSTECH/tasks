import { classNames } from "@/lib/utilities/class-names";

type AvatarProps = {
  readonly name: string;
  readonly color: string;
  readonly image?: string | null;
  readonly size?: number;
  readonly className?: string;
};

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

/**
 * The picture is layered over the initials tile with an empty `alt`, so a
 * broken or blocked image degrades to the initials without any JavaScript.
 */
export const Avatar = ({ name, color, image, size = 18, className }: AvatarProps) => (
  <span
    role="img"
    aria-label={name}
    title={name}
    className={classNames(
      "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-medium leading-none text-white",
      className,
    )}
    style={{
      width: size,
      height: size,
      backgroundColor: color,
      fontSize: Math.max(8, Math.round(size * 0.44)),
    }}
  >
    {initialsOf(name)}
    {image ? (
      // eslint-disable-next-line @next/next/no-img-element -- fixed-size CDN thumbnail; the optimizer would proxy it for no gain.
      <img src={image} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
    ) : null}
  </span>
);
