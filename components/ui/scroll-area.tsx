import type { ReactNode } from "react";

type ScrollAreaProps = {
  readonly children: ReactNode;
};

export const ScrollArea = ({ children }: ScrollAreaProps) => (
  <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
);
