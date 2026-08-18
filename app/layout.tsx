import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";

import { readThemePreference } from "@/app/theme-preference";
import { themeClassName } from "@/lib/session/theme";
import { classNames } from "@/lib/utilities/class-names";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Tasks", template: "%s · Tasks" },
  description: "Issue tracking for teams.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const preference = await readThemePreference();

  // `system` sets no class, so CSS follows the OS preference (see globals.css).
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={classNames(inter.variable, geistMono.variable, "h-full", themeClassName(preference))}
    >
      {/* Browser extensions (Grammarly and friends) add attributes to <body> before React hydrates. */}
      <body suppressHydrationWarning className="flex h-full min-h-full flex-col overflow-hidden">
        {children}
      </body>
    </html>
  );
}
