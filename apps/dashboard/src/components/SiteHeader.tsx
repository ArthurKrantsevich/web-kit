"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GITHUB_URL } from "@/links";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  // The header stays at the top; its bottom border shows once the page is scrolled under it.
  const [scrolled, setScrolled] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 0);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

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
    <header className="site-header" data-scrolled={scrolled}>
      <div className="container site-header__inner">
        <Link href="/" className="logo">
          <span className="logo__mark" aria-hidden="true">
            {"{ }"}
          </span>
          web-kit
        </Link>
        <nav className="site-nav" aria-label="Main">
          {/* Before the links in the DOM so Tab goes from the button into the open menu; CSS puts it last. */}
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
          {/* A click on any link closes the menu, including a link to the current page. */}
          <ul id="site-links" className="site-nav__links" data-open={open} onClick={() => setOpen(false)}>
            <li>
              <Link href="/">Tools</Link>
            </li>
            <li>
              <Link href="/about/">About</Link>
            </li>
            <li>
              <a href={GITHUB_URL}>GitHub</a>
            </li>
          </ul>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
