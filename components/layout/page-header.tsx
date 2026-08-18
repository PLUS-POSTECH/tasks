import type { ReactNode } from "react";

type PageHeaderProps = {
  readonly title: ReactNode;
  readonly icon?: ReactNode;
  readonly breadcrumbs?: readonly ReactNode[];
  readonly actions?: ReactNode;
  readonly tabs?: ReactNode;
};

export const PageHeader = ({
  title,
  icon,
  breadcrumbs = [],
  actions,
  tabs,
}: PageHeaderProps) => (
  <header className="sticky top-0 z-20 flex min-h-11 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-background/95 px-3 py-1.5 backdrop-blur md:h-11 md:flex-nowrap md:px-4 md:py-0">
    <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] md:flex-none">
      {breadcrumbs.map((crumb, index) => (
        <span key={index} className="hidden items-center gap-1.5 text-foreground-tertiary sm:flex">
          {crumb}
          <span className="text-foreground-quaternary">/</span>
        </span>
      ))}
      {icon ? <span className="flex shrink-0 items-center text-foreground-secondary">{icon}</span> : null}
      <h1 className="truncate font-medium text-foreground">{title}</h1>
    </div>
    {actions ? <div className="order-2 flex shrink-0 items-center gap-1 md:order-4">{actions}</div> : null}
    {tabs ? (
      <div className="no-scrollbar order-3 flex w-full items-center gap-0.5 overflow-x-auto md:order-2 md:ml-3 md:w-auto">
        {tabs}
      </div>
    ) : null}
    <div className="hidden flex-1 md:order-3 md:block" />
  </header>
);
