import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { classNames } from "@/lib/utilities/class-names";

const rowClasses =
  "flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-foreground hover:bg-background-tertiary";

type MenuItemSharedProps = {
  readonly children: ReactNode;
  readonly className?: string;
};

type MenuItemLinkProps = MenuItemSharedProps & {
  readonly as: "link";
  readonly href: ComponentProps<typeof Link>["href"];
  readonly onClick?: () => void;
};

type MenuItemButtonProps = MenuItemSharedProps & {
  readonly as: "button";
  readonly onClick?: () => void;
  readonly disabled?: boolean;
};

export type MenuItemProps = MenuItemLinkProps | MenuItemButtonProps;

export const MenuItem = (props: MenuItemProps) =>
  props.as === "link" ? (
    <Link
      href={props.href}
      onClick={props.onClick}
      className={classNames(rowClasses, props.className)}
    >
      {props.children}
    </Link>
  ) : (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={classNames(rowClasses, props.className)}
    >
      {props.children}
    </button>
  );
