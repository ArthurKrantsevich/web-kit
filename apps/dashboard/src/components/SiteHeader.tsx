"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  // A followed link closes the phone menu.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButton.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link href="/" className="logo">
          <span className="logo__mark" aria-hidden="true">
            {"{ }"}
          </span>
          web-kit
        </Link>
        <nav className="site-nav" aria-label="Main">
          <ul id="site-links" className="site-nav__links" data-open={open}>
            <li>
              <Link href="/">Tools</Link>
            </li>
            <li>
              <Link href="/about/">About</Link>
            </li>
            <li>
              <a href="https://github.com/ArthurKrantsevich/web-kit">GitHub</a>
            </li>
          </ul>
          <ThemeToggle />
          <button
            ref={menuButton}
            type="button"
            className="icon-button menu-button"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="site-links"
            onClick={() => setOpen((value) => !value)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </nav>
      </div>
    </header>
  );
}
