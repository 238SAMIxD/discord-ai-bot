import type { IconName } from "../components/icons.ts";

/** Colour role of a card's icon. */
export type Tone = "accent" | "accent-2" | "danger";

/** One card in the feature grid. */
export interface Feature {
  icon: IconName;
  tone: Tone;
  title: string;
  body: string;
  tag: string;
}

export const features: Feature[] = [
  {
    icon: "database",
    tone: "accent",
    title: "Chat that remembers",
    body: "Each person gets their own history in every channel, saved in SQLite and kept across restarts.",
    tag: "SQLite · last 50 messages",
  },
  {
    icon: "visibility",
    tone: "accent-2",
    title: "Sees your images",
    body: "Send an image to a vision model like llava or qwen2.5vl. Vision models are detected automatically.",
    tag: "IMAGE_INPUT=auto",
  },
  {
    icon: "description",
    tone: "accent",
    title: "Reads your files",
    body: "Attach up to five text, code or PDF files to /generate and ask about them.",
    tag: "Up to 5 attachments",
  },
  {
    icon: "palette",
    tone: "accent-2",
    title: "Generates images",
    body: "/text2img renders your prompt on your AUTOMATIC1111 Stable Diffusion server.",
    tag: "AUTOMATIC1111 API",
  },
  {
    icon: "cancel",
    tone: "danger",
    title: "Stop anytime",
    body: "A red Stop button cancels a running answer. Only the person who asked can press it.",
    tag: "Requester only",
  },
  {
    icon: "speed",
    tone: "accent",
    title: "Stats for every answer",
    body: "See the model, tokens per second, context used and load time under each reply.",
    tag: "Ollama generation stats",
  },
  {
    icon: "dns",
    tone: "accent-2",
    title: "Many servers, one fair queue",
    body: "Add several servers. Requests go to the first free one and wait in line, first come first served.",
    tag: "Priority failover",
  },
  {
    icon: "forum",
    tone: "accent",
    title: "Knows the room",
    body: "The bot knows its name, the server, the channel topic, who is asking and today's date.",
    tag: "Bot context in the prompt",
  },
  {
    icon: "security",
    tone: "accent-2",
    title: "Respectful by default",
    body: "No Message Content intent, never pings anyone, optional channel allowlist and slow mode.",
    tag: "Guilds intent only",
  },
];
