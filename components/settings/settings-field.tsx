import type { ReactNode } from "react";

type SettingsFieldProps = {
  readonly label: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly htmlFor?: string;
};

export const SettingsField = ({ label, description, children, htmlFor }: SettingsFieldProps) => (
  <div className="flex flex-col gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center">
    <div className="flex-1">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
        {label}
      </label>
      {description ? <p className="text-xs text-foreground-tertiary">{description}</p> : null}
    </div>
    <div className="flex shrink-0 items-center gap-2 sm:w-[300px] sm:justify-end">{children}</div>
  </div>
);
