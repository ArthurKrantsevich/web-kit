import Link from "next/link";
import { tools, upcoming } from "@/registry";
import { FLUTTER_KIT_URL, GITHUB_URL, LICENSE_URL } from "@/links";

/** The footer of every page: what web-kit is, every ready tool, the project's links and what is planned. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__grid">
        <div className="site-footer__about">
          <Link href="/" className="logo">
            <span className="logo__mark" aria-hidden="true">
              {"{ }"}
            </span>
            web-kit
          </Link>
          <p>Small open-source utilities for the web, as React packages; a Flutter version is on the way.</p>
          <p>Everything runs in your browser. Your data never leaves your device.</p>
        </div>
        <nav className="site-footer__columns" aria-label="Footer">
          <div>
            <h2>Tools</h2>
            <ul>
              {tools.map((tool) => (
                <li key={tool.id}>
                  <Link href={`/tools/${tool.id}/`}>{tool.title}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Project</h2>
            <ul>
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
                <a href={LICENSE_URL}>License MIT</a>
              </li>
            </ul>
          </div>
          <div>
            <h2>Planned</h2>
            <p>{`${upcoming.length} more utilities`}</p>
            <ul>
              <li>
                <Link href="/#tools">See them all</Link>
              </li>
            </ul>
          </div>
        </nav>
      </div>
      <div className="container site-footer__bottom">
        <span>© 2026 · MIT</span>
        <a href={GITHUB_URL}>Source code</a>
      </div>
    </footer>
  );
}
