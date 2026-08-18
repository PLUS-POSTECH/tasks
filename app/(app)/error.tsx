"use client";

import { Icon } from "@/components/ui/icon";

type ErrorPageProps = {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border text-danger">
        <Icon name="warning" size={22} />
      </div>
      <h1 className="text-base font-semibold text-foreground">Something went wrong</h1>
      <p className="max-w-md text-[13px] text-foreground-tertiary">{error.message}</p>
      {error.digest ? <p className="font-mono text-2xs text-foreground-quaternary">{error.digest}</p> : null}
      <button
        type="button"
        onClick={reset}
        className="mt-2 inline-flex h-7 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-background-tertiary"
      >
        Try again
      </button>
    </div>
  );
}
