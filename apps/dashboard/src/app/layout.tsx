import type { Metadata } from "next";
import Link from "next/link";
import "@web-kit/tokens/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "web-kit",
  description: "Small web utilities that run in your browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="logo">
            web-kit
          </Link>
          <nav>
            <Link href="/about/">About</Link>
            <a href="https://github.com/ArthurKrantsevich/web-kit">GitHub</a>
          </nav>
        </header>
        <p className="privacy">Everything runs in your browser. Your data never leaves your device.</p>
        <main className="site-main">{children}</main>
        <footer className="site-footer">
          MIT · Also built with Flutter:{" "}
          <a href="https://arthurkrantsevich.github.io/flutter-kit/">flutter-kit</a>
        </footer>
      </body>
    </html>
  );
}
