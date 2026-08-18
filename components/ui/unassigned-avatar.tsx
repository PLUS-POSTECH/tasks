import { classNames } from "@/lib/utilities/class-names";

import { Icon } from "./icon";

type UnassignedAvatarProps = {
  readonly size?: number;
  readonly className?: string;
};

export const UnassignedAvatar = ({
  size = 18,
  className,
}: UnassignedAvatarProps) => (
  <span
    aria-label="Unassigned"
    title="Unassigned"
    className={classNames(
      "inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-foreground-quaternary",
      className,
    )}
    style={{ width: size, height: size }}
  >
    <Icon name="user" size={Math.round(size * 0.6)} />
  </span>
);
