import { links } from "../content/links.ts";
import { ChatMock } from "./ChatMock.tsx";
import { Icon } from "./Icon.tsx";

/** Opening section with the pitch, the calls to action and the chat preview. */
export function Hero() {
  return (
    <section className="relative isolate mx-auto max-w-7xl overflow-hidden px-4 pt-10 pb-16 sm:px-6 sm:pt-16 sm:pb-24 md:pt-24 md:pb-32 lg:px-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-12 left-1/2 -z-10 h-[450px] w-[800px] max-w-none -translate-x-1/2 bg-linear-to-b from-(--glow-1) via-(--glow-2) to-transparent opacity-75 blur-3xl"
      />
      <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
        <p className="mb-8 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-raised/80 px-3.5 py-1.5 font-mono text-xs text-accent shadow-[0_0_15px_var(--glow-1)] backdrop-blur-md">
          <span className="size-2 animate-pulse-dot rounded-full bg-brand motion-reduce:animate-none" />
          <span className="tracking-wide">Open source · Self-hosted</span>
        </p>
        <h1 className="mb-6 text-3xl leading-[1.15] font-bold tracking-tight text-balance text-fg sm:text-5xl md:text-6xl">
          Your own AI, inside your Discord server
        </h1>
        <p className="mx-auto mb-10 max-w-2xl text-base leading-relaxed text-fg-muted sm:text-lg md:text-xl">
          A self-hosted bot that connects your server to Ollama for chat, vision
          and file reading, and to AUTOMATIC1111 for images, all running on
          hardware you control.
        </p>
        <div className="mb-6 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-center sm:gap-4">
          <a
            href="#self-host"
            className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-brand px-6 py-3.5 text-base font-semibold text-on-brand shadow-[0_0_25px_var(--brand-glow)] transition-colors hover:bg-brand-hover active:scale-[0.98]"
          >
            <span aria-hidden="true" className="font-mono font-bold">
              &gt;_
            </span>
            <span>Self-host it</span>
          </a>
          <a
            href={links.repo}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-raised/90 px-6 py-3.5 text-base font-medium text-fg backdrop-blur-sm transition-colors hover:border-accent/60 active:scale-[0.98]"
          >
            <Icon name="terminal" className="size-5 text-fg-muted" />
            <span>View on GitHub</span>
          </a>
        </div>
        <p className="mb-14 text-center font-mono text-xs leading-relaxed text-fg-subtle sm:text-sm">
          <Icon
            name="check_circle"
            className="mr-2 inline-block size-[18px] align-[-4px] text-accent"
          />
          <span>
            Slash commands only · No Message Content intent · Docker ready
          </span>
        </p>
      </div>
      <ChatMock />
    </section>
  );
}
