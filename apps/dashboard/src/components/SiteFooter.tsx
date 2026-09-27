import Link from "next/link";
import { FLUTTER_KIT_URL, GITHUB_URL, LICENSE_URL } from "@/links";

/** The footer of every page, one compact row: the mark and the privacy line, then the project's links and the year. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__about">
          <Link href="/" className="logo">
            <span className="logo__mark" aria-hidden="true">
              {"{ }"}
            </span>
            web-kit
          </Link>
          <p>Everything runs in your browser. Your data never leaves your device.</p>
        </div>
        <div className="site-footer__end">
          <nav aria-label="Footer">
            <ul className="site-footer__links">
              <li>
                <Link href="/about/">About</Link>
              </li>
              <li>
                <a href={GITHUB_URL}>GitHub</a>
              </li>
              <li>
                <a href={FLUTTER_KIT_URL}>flutter-kit</a>
              </li>
              <li>
                <a href={LICENSE_URL}>MIT license</a>
              </li>
            </ul>
          </nav>
          <span>© 2026</span>
        </div>
      </div>
    </footer>
  );
}
