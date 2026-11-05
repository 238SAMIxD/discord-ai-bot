import { links } from "../content/links.ts";
import { Icon } from "./Icon.tsx";

const footerLinks = [
  { href: links.setupGuide, label: "Setup guide" },
  { href: links.ollama, label: "Ollama" },
  { href: links.automatic1111, label: "AUTOMATIC1111" },
  { href: links.repo, label: "GitHub" },
];

/** Page footer with project links and the non-affiliation notice. */
export function Footer() {
  return (
    <footer className="border-t border-line/50 bg-sunken">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-6 px-4 py-12 sm:px-6 md:flex-row lg:px-8">
        <div className="flex flex-col items-center gap-2 text-center md:items-start md:text-left">
          <p className="flex items-center gap-2.5">
            <Icon name="terminal" className="size-5 text-accent" />
            <span className="text-base font-semibold text-fg">
              Discord AI Bot
            </span>
          </p>
          <p className="text-xs text-fg-muted">Open source on GitHub.</p>
          <p className="font-mono text-xs text-fg-subtle">
            Not affiliated with Discord Inc.
          </p>
        </div>
        <nav aria-label="Project links">
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-fg-muted">
            {footerLinks.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  className="inline-block py-1 transition-colors hover:text-accent"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
