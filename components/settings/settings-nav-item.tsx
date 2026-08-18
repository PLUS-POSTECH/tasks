"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { classNames } from "@/lib/utilities/class-names";

type SettingsNavItemProps = {
  readonly href: string;
  readonly label: string;
  readonly exact?: boolean;
};

export const SettingsNavItem = ({ href, label, exact = false }: SettingsNavItemProps) => {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={classNames(
        "flex h-7 shrink-0 items-center whitespace-nowrap rounded-md px-2 text-[13px]",
        active
          ? "bg-background-quaternary/70 font-medium text-foreground"
          : "text-foreground-secondary hover:bg-background-tertiary hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
};
