"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { classNames } from "@/lib/utilities/class-names";

type TabLinkProps = {
  readonly href: string;
  readonly children: ReactNode;
  readonly exact?: boolean;
};

export const TabLink = ({ href, children, exact = false }: TabLinkProps) => {
  const pathname = usePathname();
  const searchParameters = useSearchParams();
  const [hrefPath, hrefQuery = ""] = href.split("?");
  const currentTab = searchParameters.get("tab") ?? "";
  const targetTab = new URLSearchParams(hrefQuery).get("tab") ?? "";
  const pathMatches = exact
    ? pathname === hrefPath
    : pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
  const active = pathMatches && currentTab === targetTab;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={classNames(
        "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
        active
          ? "bg-background-tertiary text-foreground"
          : "text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
};
