"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

type CopyableValueProps = {
  readonly value: string;
};

export const CopyableValue = ({ value }: CopyableValueProps) => {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground" title={value}>
        {value}
      </code>
      <Button
        variant="secondary"
        size="small"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => setCopied(true));
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </span>
  );
};
