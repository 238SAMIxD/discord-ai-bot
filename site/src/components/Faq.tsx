import { faq } from "../content/faq.ts";
import { Icon } from "./Icon.tsx";
import { Section } from "./Section.tsx";

/** Accordion of common questions; the first one starts open. */
export function Faq() {
  return (
    <Section
      id="faq"
      title="Frequently Asked Questions"
      lead="Clear answers about local compute requirements, permissions, and network setup."
      centered
      narrow
    >
      <div className="space-y-4">
        {faq.map((item, index) => (
          <details
            key={item.question}
            open={index === 0}
            className="group rounded-xl border border-line/70 bg-card p-5 shadow-(--card-shadow) transition-colors open:border-accent/50"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-fg select-none md:text-lg [&::-webkit-details-marker]:hidden">
              <span>{item.question}</span>
              <Icon
                name="keyboard_arrow_down"
                className="size-6 text-fg-subtle transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <p className="mt-4 border-t border-line/40 pt-3 text-sm leading-relaxed text-fg-muted">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}
