import { Icon } from "./Icon.tsx";
import { Section } from "./Section.tsx";

const servers = [
  { name: "Ollama #1", role: "LLM / Vision (GPU 0)", dot: "bg-brand" },
  { name: "Ollama #2", role: "LLM Secondary (GPU 1)", dot: "bg-fg-subtle" },
  { name: "AUTOMATIC1111", role: "Stable Diffusion WebUI", dot: "bg-brand-2" },
];

/** Connector that points down on small screens and right on wide ones. */
function Arrow() {
  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-center text-accent lg:col-span-1"
    >
      <Icon name="arrow_downward" className="size-7 lg:hidden" />
      <Icon name="arrow_forward" className="hidden size-7 lg:block" />
    </div>
  );
}

/** Diagram of the request path from Discord through the bot to the AI servers. */
export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      title="How it works"
      lead="A fault-tolerant router sitting between your server and homelab GPUs."
    >
      <div className="relative overflow-hidden rounded-2xl border border-line/80 bg-card p-5 shadow-(--card-shadow) sm:p-8 md:p-12">
        <div className="grid grid-cols-1 items-center gap-5 lg:grid-cols-12 lg:gap-8">
          <div className="flex flex-col justify-between gap-6 rounded-xl border border-line/60 bg-inset p-5 lg:col-span-3 lg:h-48">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold tracking-wider text-accent-2">
                DISCORD
              </span>
              <Icon name="cable" className="size-5 text-fg-subtle" />
            </div>
            <div>
              <p className="mb-1 text-xl font-semibold text-fg">Discord</p>
              <p className="text-xs text-fg-muted">
                Slash commands over the Gateway
              </p>
            </div>
          </div>
          <Arrow />
          <div className="relative flex flex-col justify-between gap-4 rounded-xl border-2 border-accent/50 bg-raised p-6 shadow-[0_0_30px_var(--glow-1)] lg:col-span-4 lg:h-56">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold tracking-wider text-accent">
                THE BOT
              </span>
              <span className="size-2.5 animate-pulse-dot rounded-full bg-brand motion-reduce:animate-none" />
            </div>
            <div>
              <p className="mb-2 text-xl font-bold text-fg">Discord AI Bot</p>
              <ul className="flex flex-wrap gap-2 font-mono text-xs">
                <li className="rounded border border-accent/30 bg-inset px-2 py-0.5 text-accent">
                  fair queue
                </li>
                <li className="rounded border border-accent-2/30 bg-inset px-2 py-0.5 text-accent-2">
                  SQLite history
                </li>
                <li className="rounded border border-line/60 bg-inset px-2 py-0.5 text-fg-muted">
                  stop &amp; stats
                </li>
              </ul>
            </div>
            <p className="font-mono text-xs text-fg-subtle">
              Node.js · discord.js
            </p>
          </div>
          <Arrow />
          <ul className="space-y-3 lg:col-span-3">
            {servers.map((server) => (
              <li
                key={server.name}
                className="flex items-center justify-between gap-3 rounded-xl border border-line/60 bg-inset p-3.5"
              >
                <div>
                  <p className="font-mono text-sm font-bold text-fg">
                    {server.name}
                  </p>
                  <p className="text-xs text-fg-muted">{server.role}</p>
                </div>
                <span className={`size-2.5 rounded-full ${server.dot}`} />
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-8 border-t border-line/50 pt-6 text-center text-sm text-fg-muted">
          Servers are tried in priority order. Each answers one request at a
          time, and if one fails the next takes over.
        </p>
      </div>
    </Section>
  );
}
