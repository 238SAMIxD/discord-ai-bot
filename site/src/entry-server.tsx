import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { App } from "./App.tsx";

/** Renders the landing page to static HTML for the prerender step. */
export function render(): string {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
