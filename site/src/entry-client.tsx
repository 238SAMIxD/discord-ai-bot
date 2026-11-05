import "@fontsource-variable/geist";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App.tsx";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

if (import.meta.env.DEV) {
  createRoot(container).render(app);
} else {
  hydrateRoot(container, app);
}
