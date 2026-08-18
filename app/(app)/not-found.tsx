import Link from "next/link";

import { Icon } from "@/components/ui/icon";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border text-foreground-tertiary">
        <Icon name="alert-circle" size={22} />
      </div>
      <h1 className="text-base font-semibold text-foreground">Page not found</h1>
      <p className="max-w-sm text-[13px] text-foreground-tertiary">
        The issue, project, or page you were looking for doesn’t exist or was deleted.
      </p>
      <Link href="/" className="mt-2 inline-flex h-7 items-center rounded-md bg-accent px-3 text-xs font-medium text-accent-foreground hover:bg-accent-hover">
        Back to my issues
      </Link>
    </div>
  );
}
