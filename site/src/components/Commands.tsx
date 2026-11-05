import { commands, type Command } from "../content/commands.ts";
import { Section } from "./Section.tsx";

const toneClasses: Record<Command["tone"], { name: string; card: string }> = {
  accent: { name: "text-accent", card: "hover:border-accent/40" },
  "accent-2": { name: "text-accent-2", card: "hover:border-accent-2/40" },
};

/** Cards for every slash command and its options. */
export function Commands() {
  return (
    <Section
      id="commands"
      title="Five slash commands"
      lead="Everything happens through slash commands with typed options, so the bot only sees what you send it."
    >
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
        {commands.map((command, index) => {
          const tone = toneClasses[command.tone];
          const wide =
            index === commands.length - 1 ? "md:col-span-2 lg:col-span-1" : "";
          return (
            <li
              key={command.name}
              className={`flex flex-col justify-between rounded-xl border border-line/70 bg-card p-5 shadow-(--card-shadow) md:p-6 transition-colors ${tone.card} ${wide}`}
            >
              <div>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className={`font-mono text-base font-bold ${tone.name}`}>
                    {command.name}
                  </h3>
                  <span className="rounded border border-line/60 bg-inset px-2 py-0.5 font-mono text-xs text-fg-subtle">
                    {command.tag}
                  </span>
                </div>
                <p className="mb-6 text-sm leading-relaxed text-fg-muted">
                  {command.description}
                </p>
              </div>
              <div>
                <p className="mb-2 font-mono text-xs tracking-wider text-fg-subtle uppercase">
                  Options
                </p>
                {command.options.length > 0 ? (
                  <ul
                    aria-label={`${command.name} options`}
                    className="flex flex-wrap gap-2"
                  >
                    {command.options.map((option) => (
                      <li
                        key={option}
                        className="rounded border border-line/60 bg-inset px-2 py-1 font-mono text-xs text-fg"
                      >
                        [{option}]
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="font-mono text-xs text-fg-muted italic">
                    No parameters required
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
