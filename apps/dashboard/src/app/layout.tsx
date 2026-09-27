import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono, Newsreader } from "next/font/google";
import "@web-kit/tokens/tokens.css";
// The ui styles (empty states, buttons) for the pages; each tool's own styles.css repeats them, which is harmless.
import "@web-kit/ui/styles.css";
import "./globals.css";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { THEME_SCRIPT } from "@/theme";

// next/font downloads the files at build time and serves them from this site.
const display = Newsreader({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "web-kit",
  description: "Small web utilities that run in your browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // THEME_SCRIPT sets data-theme before hydration, hence suppressHydrationWarning.
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <SiteHeader />
        <main className="container site-main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
