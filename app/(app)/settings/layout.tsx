import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <SettingsNav />
      <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[760px] flex-col gap-8 px-4 py-5 md:px-8 md:py-8">{children}</div>
      </div>
    </div>
  );
}
