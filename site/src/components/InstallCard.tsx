import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { installTabs, shellText } from "../content/install.ts";
import { Icon } from "./Icon.tsx";

type CopyState = "idle" | "copied" | "failed";

const copyLabels: Record<CopyState, string> = {
  idle: "Copy",
  copied: "Copied",
  failed: "Copy failed",
};

const copyAnnouncements: Record<CopyState, string> = {
  idle: "",
  copied: "Commands copied to the clipboard",
  failed: "Could not copy the commands",
};

/** Terminal-style card with Docker and Node.js tabs and a copy button. */
export function InstallCard() {
  const baseId = useId();
  const [active, setActive] = useState(0);
  const [copy, setCopy] = useState<CopyState>("idle");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const resetTimer = useRef<number | undefined>(undefined);
  const tab = installTabs[active];

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  function select(index: number) {
    setActive(index);
    setCopy("idle");
    tabRefs.current[index]?.focus();
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = installTabs.length - 1;
    const moves: Record<string, number> = {
      ArrowRight: active === last ? 0 : active + 1,
      ArrowLeft: active === 0 ? last : active - 1,
      Home: 0,
      End: last,
    };
    const next: number | undefined = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(next);
  }

  async function copyCommands() {
    window.clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(shellText(tab));
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
    resetTimer.current = window.setTimeout(() => setCopy("idle"), 2000);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-term-line bg-term shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-term-line bg-term-bar px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            aria-hidden="true"
            className="hidden items-center gap-1.5 sm:flex"
          >
            <span className="size-3 rounded-full bg-term-line" />
            <span className="size-3 rounded-full bg-term-line/70" />
            <span className="size-3 rounded-full bg-term-line/40" />
          </div>
          <div
            role="tablist"
            aria-label="Install method"
            onKeyDown={onTabKeyDown}
            className="flex items-center gap-1 sm:ml-3"
          >
            {installTabs.map((item, index) => {
              const selected = index === active;
              return (
                <button
                  key={item.id}
                  ref={(node) => {
                    tabRefs.current[index] = node;
                  }}
                  id={`${baseId}-tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`${baseId}-panel`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => select(index)}
                  className={
                    selected
                      ? "rounded-md border border-term-accent/30 bg-white/5 px-3 py-1 font-mono text-xs font-semibold text-term-accent"
                      : "rounded-md border border-transparent px-3 py-1 font-mono text-xs text-term-muted transition-colors hover:text-term-fg"
                  }
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={copyCommands}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-term-line bg-white/5 px-3 py-1 font-mono text-xs text-term-fg transition-colors hover:border-term-accent/50"
        >
          <Icon
            name={copy === "copied" ? "check" : "content_copy"}
            className="size-3.5"
          />
          <span>{copyLabels[copy]}</span>
        </button>
      </div>
      <div
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${tab.id}`}
        tabIndex={0}
        className="overflow-x-auto p-6 font-mono text-xs leading-relaxed text-term-fg sm:text-sm"
      >
        <pre className="whitespace-pre">
          {tab.lines.map((line, index) => (
            <span key={`${tab.id}-${index}`} className="block">
              <span className="font-semibold text-term-accent">
                {line.command}
              </span>{" "}
              {line.args}
            </span>
          ))}
        </pre>
      </div>
      <p className="border-t border-term-line/60 bg-term-bar/50 px-6 py-3 font-mono text-xs text-term-muted">
        {tab.note}
      </p>
      <p aria-live="polite" className="sr-only">
        {copyAnnouncements[copy]}
      </p>
    </div>
  );
}
