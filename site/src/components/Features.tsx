import { features, type Tone } from "../content/features.ts";
import { Icon } from "./Icon.tsx";
import { Section } from "./Section.tsx";

const toneClasses: Record<Tone, { icon: string; card: string }> = {
  accent: {
    icon: "border-accent/20 text-accent group-hover:border-accent/50",
    card: "hover:border-accent/50",
  },
  "accent-2": {
    icon: "border-accent-2/20 text-accent-2 group-hover:border-accent-2/50",
    card: "hover:border-accent-2/50",
  },
  danger: {
    icon: "border-danger/20 text-danger group-hover:border-danger/50",
    card: "hover:border-danger/50",
  },
};

/** Grid of the bot's main capabilities. */
export function Features() {
  return (
    <Section
      id="features"
      title="Everything runs on your machines"
      lead="The bot only talks to the Ollama and AUTOMATIC1111 servers you point it at, so the models and the hardware stay yours."
    >
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
        {features.map((feature) => {
          const tone = toneClasses[feature.tone];
          return (
            <li
              key={feature.title}
              className={`group flex flex-col justify-between rounded-xl border border-line/60 bg-card p-5 shadow-(--card-shadow) md:p-6 transition-colors ${tone.card}`}
            >
              <div>
                <div
                  className={`mb-4 flex size-10 items-center justify-center rounded-lg border bg-inset transition-colors ${tone.icon}`}
                >
                  <Icon name={feature.icon} className="size-[22px]" />
                </div>
                <h3 className="mb-2 text-xl font-semibold text-fg">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-fg-muted">
                  {feature.body}
                </p>
              </div>
              <p className="mt-6 border-t border-line/40 pt-3 font-mono text-xs text-fg-subtle">
                {feature.tag}
              </p>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
