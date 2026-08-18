import type { ReactNode } from "react";

type SettingsSectionProps = {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly actions?: ReactNode;
};

export const SettingsSection = ({ title, description, children, actions }: SettingsSectionProps) => (
  <section className="flex flex-col gap-4">
    <div className="flex items-start gap-3">
      <div className="flex-1">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-foreground-tertiary">{description}</p> : null}
      </div>
      {actions}
    </div>
    <div className="rounded-lg border border-border bg-surface">{children}</div>
  </section>
);
