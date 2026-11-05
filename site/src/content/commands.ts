/** One slash command card. */
export interface Command {
  name: string;
  tag: string;
  tone: "accent" | "accent-2";
  description: string;
  options: string[];
}

export const commands: Command[] = [
  {
    name: "/chat",
    tag: "memory",
    tone: "accent",
    description:
      "Chat with memory. Your last 50 messages in each channel are kept.",
    options: ["prompt", "model", "stream (experimental)", "image"],
  },
  {
    name: "/generate",
    tag: "one-off",
    tone: "accent-2",
    description:
      "One-off answers with file and image attachments. Not saved to your chat history.",
    options: ["prompt", "model", "stream", "attachment1–5"],
  },
  {
    name: "/text2img",
    tag: "sd-webui",
    tone: "accent",
    description:
      "Turn text into images on your AUTOMATIC1111 server. Shown only when a Stable Diffusion server is set.",
    options: [
      "prompt",
      "width",
      "height",
      "steps",
      "batch_count",
      "batch_size",
    ],
  },
  {
    name: "/models",
    tag: "lookup",
    tone: "accent-2",
    description:
      "List the models installed on your Ollama or Stable Diffusion servers.",
    options: ["provider"],
  },
  {
    name: "/clearhistory",
    tag: "history",
    tone: "accent",
    description:
      "Delete your /chat history in this channel and cancel your running /chat requests.",
    options: [],
  },
];
