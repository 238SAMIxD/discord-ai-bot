/** Repository and external links used across the page. */
export const links = {
  repo: "https://github.com/238SAMIxD/discord-ai-bot",
  setupGuide: "https://github.com/238SAMIxD/discord-ai-bot#set-up-instructions",
  developerPortal: "https://discord.com/developers/applications",
  ollama: "https://ollama.com",
  automatic1111: "https://github.com/AUTOMATIC1111/stable-diffusion-webui",
} as const;

/** In-page anchors shown in the navigation. */
export const sections = [
  { href: "#features", label: "Features" },
  { href: "#commands", label: "Commands" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#self-host", label: "Self-host" },
  { href: "#faq", label: "FAQ" },
] as const;
