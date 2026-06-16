import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getModels } from "../api/ollama.js";
import { makeStableDiffusionRequest } from "../api/stableDiffusion.js";
import { logError } from "../utils/logger.js";
import { config } from "../config.js";
import { BotCommand } from "../types.js";

interface StableDiffusionModel {
  title: string;
  model_name: string;
}

const data = new SlashCommandBuilder()
  .setName("models")
  .setDescription("List available models")
  .addStringOption((option) =>
    option
      .setName("provider")
      .setDescription("The provider to list models for")
      .setRequired(true)
      .addChoices(
        { name: "Ollama", value: "ollama" },
        { name: "Stable Diffusion", value: "stable_diffusion" },
      ),
  );

const models: BotCommand = {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply();
      const provider = interaction.options.getString("provider", true);

      if (provider === "ollama") {
        const modelsList = await getModels();
        if (modelsList.length === 0) {
          await interaction.editReply({
            content: "No Ollama models found.",
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle("Available Ollama Models")
          .setDescription(
            `Found ${modelsList.length} models on the Ollama server(s).`,
          )
          .addFields(
            modelsList.map((m) => ({
              name: m.name,
              value: `\`${m.model}\``,
              inline: true,
            })),
          );

        await interaction.editReply({ embeds: [embed] });
      } else {
        if (config.stableDiffusionServers.length === 0) {
          await interaction.editReply({
            content: "No Stable Diffusion servers are configured.",
          });
          return;
        }

        const sdModels = await makeStableDiffusionRequest<
          StableDiffusionModel[]
        >("/sdapi/v1/sd-models", "get", {});

        if (!sdModels || sdModels.length === 0) {
          await interaction.editReply({
            content: "No Stable Diffusion models found.",
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle("Available Stable Diffusion Models")
          .setDescription(
            `Found ${sdModels.length} models on the Stable Diffusion server(s).`,
          )
          .addFields(
            sdModels.slice(0, 25).map((m) => ({
              name: m.model_name || "Unknown Model",
              value: m.title || "No title",
              inline: true,
            })),
          );

        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      logError(error);
      await interaction.editReply({
        content: "Failed to list available models.",
      });
    }
  },
};

export default models;
