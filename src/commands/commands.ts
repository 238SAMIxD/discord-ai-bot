import { getConfig } from "../config.js";
import { BotCommand } from "../types.js";
import text2img from "./text2img.js";
import chat from "./chat.js";
import generate from "./generate.js";
import models from "./models.js";
import clearHistory from "./clearHistory.js";

let cachedCommands: BotCommand[] | null = null;

export function getCommands(): BotCommand[] {
  if (cachedCommands) return cachedCommands;

  cachedCommands = [];

  // Always register Ollama slash commands
  cachedCommands.push(chat);
  cachedCommands.push(generate);
  cachedCommands.push(models);
  cachedCommands.push(clearHistory);

  if (getConfig().stableDiffusionServers.length > 0) {
    cachedCommands.push(text2img);
  }

  return cachedCommands;
}
