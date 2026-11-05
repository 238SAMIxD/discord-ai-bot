import { useState } from "react";
import { links, sections } from "../content/links.ts";
import { Icon } from "./Icon.tsx";

const githubClass =
  "items-center justify-center gap-2 rounded-lg border border-line bg-card px-3 py-1.5 font-mono text-xs text-fg transition-colors hover:border-accent/50 active:scale-[0.98]";
const ctaClass =
  "items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-on-brand shadow-[0_0_15px_var(--brand-glow)] transition-colors hover:bg-brand-hover active:scale-[0.98]";

/** Sticky top bar with the section links, and a menu on small screens. */
export function Nav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header
      className="sticky top-0 z-50 w-full border-b border-line/60 bg-nav backdrop-blur-md"
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a
          href="#top"
          onClick={close}
          className="group flex items-center gap-3 transition-transform active:scale-[0.98]"
        >
          <span className="flex size-8 items-center justify-center rounded-lg border border-accent/30 bg-raised text-accent shadow-[0_0_12px_var(--brand-glow)] transition-colors group-hover:border-accent">
            <Icon name="terminal" className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-fg sm:text-xl">
            Discord AI Bot
          </span>
        </a>
        <nav
          aria-label="Sections"
          className="hidden items-center gap-8 text-sm md:flex"
        >
          {sections.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="font-medium text-fg-muted transition-colors hover:text-accent"
            >
              {section.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <a
            href={links.repo}
            className={`hidden md:inline-flex ${githubClass}`}
          >
            <Icon name="star_fill" className="size-4 text-accent-2" />
            <span className="font-medium">GitHub</span>
          </a>
          <a href="#self-host" className={`hidden md:inline-flex ${ctaClass}`}>
            Self-host it
          </a>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
            className="flex size-10 items-center justify-center rounded-lg border border-line bg-card text-fg md:hidden"
          >
            <Icon name={open ? "close" : "menu"} className="size-6" />
          </button>
        </div>
      </div>
      <div
        id="mobile-menu"
        hidden={!open}
        className="border-t border-line/60 md:hidden"
      >
        <nav
          aria-label="Sections"
          className="mx-auto flex max-w-7xl flex-col px-4 pt-2 pb-4 sm:px-6"
        >
          {sections.map((section) => (
            <a
              key={section.href}
              href={section.href}
              onClick={close}
              className="border-b border-line/40 py-3 font-medium text-fg-muted transition-colors hover:text-accent"
            >
              {section.label}
            </a>
          ))}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <a
              href={links.repo}
              onClick={close}
              className={`inline-flex py-2.5 ${githubClass}`}
            >
              <Icon name="star_fill" className="size-4 text-accent-2" />
              <span className="font-medium">GitHub</span>
            </a>
            <a
              href="#self-host"
              onClick={close}
              className={`inline-flex py-2.5 ${ctaClass}`}
            >
              Self-host it
            </a>
          </div>
        </nav>
      </div>
    </header>
  );
}
