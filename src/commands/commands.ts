import {
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
} from "discord.js";
import { config } from "../config.js";
import text2img from "./text2img.js";

const commands: (
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | RESTPostAPIChatInputApplicationCommandsJSONBody
)[] = [];

if (config.stableDiffusionServers.length > 0) {
  commands.push(text2img);
}

export default commands;
