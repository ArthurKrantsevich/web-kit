import type { Metadata } from "next";
import Link from "next/link";
import { FLUTTER_KIT_URL, GITHUB_URL } from "@/links";
import { tools, upcoming } from "@/registry";

export const metadata: Metadata = {
  title: "About · web-kit",
  description: "What web-kit is, the rules every tool follows, and how it is built.",
};

/** 24 × 24 stroke icons, drawn like the ui icons. */
const PRINCIPLES: { title: string; icon: string; text: string }[] = [
  {
    title: "Your data stays on your device",
    icon: "M6 10V8a6 6 0 0 1 12 0v2M5 10h14v11H5zM12 14v3",
    text: "There is no backend. Files and text are processed in your browser and never uploaded. A share link keeps the data in the part of the address that browsers do not send.",
  },
  {
    title: "Numbers stay exact",
    icon: "M5 9h14M5 15h14M10 4L8 20M16 4l-2 16",
    text: "JSON is read without rounding: 12345678901234567890 and 1.10 stay exactly as written, and comparisons use exact decimals.",
  },
  {
    title: "Only checked fixes",
    icon: "M5 12.5l4.5 4.5L19 7",
    text: "A fix is offered only after its result was validated. When no rule provably helps, you get the exact error and no guess.",
  },
  {
    title: "Logic without UI",
    icon: "M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4",
    text: "Every tool is its own package whose core needs no React and no DOM, so the same logic runs in Node, in a worker or in any framework.",
  },
];

/** The packages of the monorepo that a user can install. */
const PACKAGES = ["@web-kit/json-core", "@web-kit/ui", ...tools.map((tool) => tool.pkg)];

function Icon({ path }: { path: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export default function AboutPage() {
  return (
    <article className="about">
      <header className="about__hero">
        <p className="eyebrow">About</p>
        <h1>Small tools you can trust with your data.</h1>
        <p className="about__lead">
          web-kit is a collection of small utilities for everyday work with data: formatting, converting, comparing and
          checking JSON, with more on the way. It is made for developers and anyone who pastes data into a web page and
          wants it to stay private. The tools here are React and TypeScript packages; flutter-kit brings the same tools
          to Flutter. The two share the design, not the code.
        </p>
      </header>

      <section className="about__section" aria-labelledby="principles">
        <h2 id="principles">Principles</h2>
        <ul className="about__principles">
          {PRINCIPLES.map((principle) => (
            <li key={principle.title} className="about__principle">
              <span className="about__icon">
                <Icon path={principle.icon} />
              </span>
              <h3>{principle.title}</h3>
              <p>{principle.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="about__section" aria-labelledby="about-tools">
        <h2 id="about-tools">Tools</h2>
        <ul className="about__tools">
          {tools.map((tool) => (
            <li key={tool.id}>
              <Link className="about__tool" href={`/tools/${tool.id}/`}>
                <span className="about__tool-title">{tool.title}</span>
                <span className="about__tool-text">{tool.description}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="about__note">
          {`${upcoming.length} more are planned, from Base64 and JWT to a QR code generator and an image converter. `}
          <Link href="/#tools">See the list</Link>.
        </p>
      </section>

      <section className="about__section about__prose" aria-labelledby="built">
        <h2 id="built">How it is built</h2>
        <ul className="about__facts">
          <li>
            {`${PACKAGES.length} packages, not on npm yet: `}
            {PACKAGES.map((name, index) => (
              <span key={name}>
                {index > 0 && ", "}
                <code>{name}</code>
              </span>
            ))}
            . Each tool&apos;s package has a <code>/core</code> entry without React.
          </li>
          <li>
            <code>@web-kit/ui</code> gives every tool the same editor, buttons, menus, dialogs and shortcuts.
          </li>
          <li>This site is a static export of Next.js on GitHub Pages: plain HTML, CSS and JavaScript, no server code.</li>
          <li>
            The packages are unit-tested with Vitest and Testing Library, this site is tested in a browser with
            Playwright, and the schema validator also runs the official JSON Schema Test Suite.
          </li>
        </ul>
      </section>

      <section className="about__section about__links" aria-label="Links">
        <a className="about__link" href={FLUTTER_KIT_URL}>
          <span className="about__tool-title">Also in Flutter</span>
          <span className="about__tool-text">flutter-kit is the same collection in Dart for Flutter web. Its site is live; the first tools are in progress.</span>
        </a>
        <a className="about__link" href={GITHUB_URL}>
          <span className="about__tool-title">Source code</span>
          <span className="about__tool-text">Everything is open source under the MIT license, on GitHub.</span>
        </a>
      </section>
    </article>
  );
}
