import type { ReactNode } from "react";

interface SectionProps {
  id: string;
  title: string;
  lead: string;
  centered?: boolean;
  narrow?: boolean;
  children: ReactNode;
}

/** A page section with the shared heading block and an anchor offset for the sticky nav. */
export function Section({
  id,
  title,
  lead,
  centered = false,
  narrow = false,
  children,
}: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={`mx-auto scroll-mt-16 border-t border-line/50 px-4 py-16 sm:px-6 md:py-24 lg:px-8 ${narrow ? "max-w-4xl" : "max-w-7xl"}`}
    >
      <div
        className={
          centered ? "mb-10 text-center md:mb-16" : "mb-10 max-w-2xl md:mb-16"
        }
      >
        <h2
          id={`${id}-title`}
          className="mb-4 text-3xl font-semibold tracking-tight text-fg md:text-4xl"
        >
          {title}
        </h2>
        <p className="text-lg text-fg-muted">{lead}</p>
      </div>
      {children}
    </section>
  );
}
