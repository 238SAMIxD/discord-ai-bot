import { iconPaths, type IconName } from "./icons.ts";

interface IconProps {
  name: IconName;
  className?: string;
}

/** Draws a Material Symbols icon as inline SVG in the current text colour. */
export function Icon({ name, className = "size-5" }: IconProps) {
  return (
    <svg
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}
