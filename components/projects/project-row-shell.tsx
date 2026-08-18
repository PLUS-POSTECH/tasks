"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

type ProjectRowShellProps = {
  readonly href: string;
  readonly children: ReactNode;
};

export const ProjectRowShell = ({ href, children }: ProjectRowShellProps) => {
  const router = useRouter();
  return (
    <div
      role="row"
      onClick={() => router.push(href)}
      className="flex h-11 cursor-default items-center gap-2 border-b border-border-subtle px-3 text-[13px] hover:bg-background-secondary sm:gap-3 sm:px-4"
    >
      {children}
    </div>
  );
};
