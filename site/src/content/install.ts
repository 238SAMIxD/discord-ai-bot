/** One shell line, split so the command can be highlighted. */
export interface ShellLine {
  command: string;
  args: string;
}

/** A way to run the bot, shown as a tab in the self-host card. */
export interface InstallTab {
  id: string;
  label: string;
  lines: ShellLine[];
  note: string;
}

const clone: ShellLine[] = [
  {
    command: "git clone",
    args: "https://github.com/238SAMIxD/discord-ai-bot.git",
  },
  { command: "cd", args: "discord-ai-bot" },
  { command: "cp", args: ".env.example .env" },
];

export const installTabs: InstallTab[] = [
  {
    id: "docker",
    label: "Docker",
    lines: [...clone, { command: "make", args: "compose-up" }],
    note: "Needs Docker Engine 20.10+ with Compose v2",
  },
  {
    id: "node",
    label: "Node.js",
    lines: [
      ...clone,
      { command: "pnpm", args: "i" },
      { command: "pnpm", args: "build" },
      { command: "pnpm", args: "start" },
    ],
    note: "Needs Node.js 22.13+ and pnpm 12+",
  },
];

/** Joins a tab's lines into the text the copy button puts on the clipboard. */
export function shellText(tab: InstallTab): string {
  return tab.lines.map((line) => `${line.command} ${line.args}`).join("\n");
}
