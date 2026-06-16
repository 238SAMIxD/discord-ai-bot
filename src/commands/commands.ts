import { config } from "../config.js";
import { BotCommand } from "../types.js";
import text2img from "./text2img.js";
import chat from "./chat.js";
import generate from "./generate.js";
import models from "./models.js";
import clearHistory from "./clearHistory.js";

const commands: BotCommand[] = [];

// Always register Ollama slash commands
commands.push(chat);
commands.push(generate);
commands.push(models);
commands.push(clearHistory);

if (config.stableDiffusionServers.length > 0) {
  commands.push(text2img);
}

export default commands;
