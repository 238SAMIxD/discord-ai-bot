import type { ReactNode } from "react";
import { links } from "../content/links.ts";
import { Icon } from "./Icon.tsx";
import { InstallCard } from "./InstallCard.tsx";
import { Section } from "./Section.tsx";

const steps: { title: string; body: ReactNode }[] = [
  {
    title: "Create a Discord application",
    body: (
      <>
        Create a bot in the{" "}
        <a
          href={links.developerPortal}
          className="underline decoration-line underline-offset-2 transition-colors hover:text-accent"
        >
          Discord Developer Portal
        </a>
        . No privileged intents or message content access needed.
      </>
    ),
  },
  {
    title: "Run Ollama and pull a model",
    body: (
      <>
        Start Ollama and run{" "}
        <code className="rounded border border-accent/20 bg-inset px-1.5 py-0.5 font-mono text-xs text-accent">
          ollama pull llama3.2
        </code>
        , or any model you like.
      </>
    ),
  },
  {
    title: "Fill in .env",
    body: "Configure your Discord Bot Token and point endpoints to your host IP and Ollama port.",
  },
  {
    title: "Start the bot",
    body: "Start it with Docker Compose, or run pnpm build and pnpm start. Slash commands register on startup.",
  },
];

/** The four setup steps next to the copyable install commands. */
export function SelfHost() {
  return (
    <Section
      id="self-host"
      title="Self-host in four steps"
      lead="Deploy on any Linux box, homelab server, or desktop with Docker or native Node.js."
    >
      <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12">
        <ol className="space-y-6 lg:col-span-5">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-raised font-mono text-sm font-bold text-accent"
              >
                {index + 1}
              </span>
              <div>
                <h3 className="mb-1 text-lg font-semibold text-fg">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-fg-muted">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <div className="min-w-0 lg:col-span-7">
          <InstallCard />
          <div className="mt-4 flex justify-end">
            <a
              href={links.setupGuide}
              className="inline-flex items-center gap-1.5 font-mono text-sm font-medium text-accent hover:underline"
            >
              <span>Full setup guide on GitHub</span>
              <Icon name="arrow_forward" className="size-4" />
            </a>
          </div>
        </div>
      </div>
    </Section>
  );
}
