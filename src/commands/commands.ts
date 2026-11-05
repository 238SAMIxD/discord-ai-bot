import { getConfig } from "../config.js";
import { getVisionModels } from "../api/ollama.js";
import { log, LogLevel } from "../utils/logger.js";
import { BotCommand, CommandFeatures } from "../types.js";
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

export function getCommandData(features: CommandFeatures) {
  return getCommands().map((c) => c.buildData?.(features) ?? c.data);
}

const IMAGE_PROBE_TIMEOUT_MS = 15_000;

export async function resolveImageInput(
  timeoutMs = IMAGE_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  const mode = getConfig().imageInput;
  if (mode !== "auto") return mode;

  try {
    const visionModels = await getVisionModels(AbortSignal.timeout(timeoutMs));
    if (visionModels.length === 0) {
      log.log(
        LogLevel.Info,
        "IMAGE_INPUT=auto: no vision model found on the Ollama servers, so /chat has no image option.",
      );
      return false;
    }
    log.log(
      LogLevel.Info,
      `IMAGE_INPUT=auto: /chat offers the image option. Vision models found: ${visionModels.map((m) => m.model).join(", ")}`,
    );
    return true;
  } catch (error) {
    log.log(
      LogLevel.Warn,
      "IMAGE_INPUT=auto: could not check the Ollama servers for vision models, so /chat is registered without the image option.",
      error,
    );
    return false;
  }
}
