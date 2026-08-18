"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { classNames } from "@/lib/utilities/class-names";

type SidebarLinkProps = {
  readonly href: string;
  readonly icon?: ReactNode;
  readonly children: ReactNode;
  readonly badge?: ReactNode;
  readonly exact?: boolean;
  readonly depth?: 0 | 1 | 2;
  readonly matchPrefixes?: readonly string[];
};

const depthPadding = ["pl-2", "pl-7", "pl-10"] as const;

export const SidebarLink = ({
  href,
  icon,
  children,
  badge,
  exact = false,
  depth = 0,
  matchPrefixes = [],
}: SidebarLinkProps) => {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href ||
      pathname.startsWith(`${href}/`) ||
      matchPrefixes.some((prefix) => pathname.startsWith(prefix));
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={classNames(
        "group/link flex h-7 items-center gap-2 rounded-md pr-2 text-[13px] transition-colors",
        depthPadding[depth],
        active
          ? "bg-background-quaternary/70 font-medium text-foreground"
          : "text-foreground-secondary hover:bg-background-tertiary hover:text-foreground",
      )}
    >
      {icon ? (
        <span
          className={classNames(
            "flex w-4 shrink-0 items-center justify-center",
            active ? "text-foreground" : "text-foreground-tertiary group-hover/link:text-foreground-secondary",
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge}
    </Link>
  );
};
