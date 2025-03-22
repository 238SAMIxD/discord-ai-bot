import { CommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { LogLevel } from "meklog";

import { log } from "../bot";
import { MAX_EMBED_FIELDS } from "../utils/consts";
import { getModels } from "../utils/service";

interface OllamaModel {
  model: string;
  name: string;
}

interface StableDiffusionModel {
  title: string;
  model_name: string;
}

async function models() {
  return {
    command: new SlashCommandBuilder()
      .setName("models")
      .setDescription("List available models")
      .addStringOption(option =>
        option
          .setName("provider")
          .setDescription("AI provider")
          .setRequired(true)
          .addChoices(
            { name: "Ollama", value: "ollama" },
            { name: "Stable Diffusion", value: "stable_diffusion" }
          )
      ),
    handler: handleModels,
  };

  async function handleModels(interaction: CommandInteraction) {
    await interaction.deferReply();
    try {
      const provider = interaction.options.get("provider")?.value as string;

      if (provider === "ollama") {
        const server = process.env.OLLAMA;
        if (!server) {
          await interaction.editReply({
            content: "No Ollama server configured. Please check the .env configuration.",
          });
          return;
        }

        const response = await getModels(server, "/api/tags");
        if (!response || !response.models || response.models.length === 0) {
          await interaction.editReply({
            content: "No models found on the Ollama server.",
          });
          return;
        }

        const models = response.models as OllamaModel[];
        const totalModels = models.length;

        // Create multiple embeds if we have more than 25 models
        const embeds = [];

        for (let i = 0; i < Math.ceil(models.length / MAX_EMBED_FIELDS); i++) {
          const startIndex = i * MAX_EMBED_FIELDS;
          const endIndex = Math.min((i + 1) * MAX_EMBED_FIELDS, models.length);
          const pageModels = models.slice(startIndex, endIndex);

          const embed = new EmbedBuilder()
            .setTitle(`Available Ollama Models ${i > 0 ? `(Page ${i + 1})` : ""}`)
            .setDescription(
              `Found ${totalModels} models on the server.${totalModels > MAX_EMBED_FIELDS ? ` Showing ${startIndex + 1}-${endIndex} of ${totalModels}.` : ""}`
            )
            .addFields(
              pageModels.map(model => ({
                name: model.name,
                value: model.model,
                inline: true,
              }))
            );

          embeds.push(embed);
        }

        if (embeds.length === 1) {
          await interaction.editReply({ embeds: embeds });
        } else {
          // Send first embed as a reply
          await interaction.editReply({
            content: `Found ${totalModels} Ollama models. Showing results in ${embeds.length} pages:`,
            embeds: [embeds[0]],
          });

          // Send remaining embeds as follow-ups
          for (let i = 1; i < embeds.length; i++) {
            await interaction.followUp({ embeds: [embeds[i]] });
          }
        }
      } else if (provider === "stable_diffusion") {
        const server = process.env.STABLE_DIFFUSION;
        if (!server) {
          await interaction.editReply({
            content: "No Stable Diffusion server configured. Please check the .env configuration.",
          });
          return;
        }

        const models = await getModels(server, "/sdapi/v1/sd-models");
        if (!models || models.length === 0) {
          await interaction.editReply({
            content: "No models found on the Stable Diffusion server.",
          });
          return;
        }

        const sdModels = models as StableDiffusionModel[];
        const totalModels = sdModels.length;

        // Create multiple embeds if we have more than 25 models
        const embeds = [];

        for (let i = 0; i < Math.ceil(sdModels.length / MAX_EMBED_FIELDS); i++) {
          const startIndex = i * MAX_EMBED_FIELDS;
          const endIndex = Math.min((i + 1) * MAX_EMBED_FIELDS, sdModels.length);
          const pageModels = sdModels.slice(startIndex, endIndex);

          const embed = new EmbedBuilder()
            .setTitle(`Available Stable Diffusion Models ${i > 0 ? `(Page ${i + 1})` : ""}`)
            .setDescription(
              `Found ${totalModels} models on the server.${totalModels > MAX_EMBED_FIELDS ? ` Showing ${startIndex + 1}-${endIndex} of ${totalModels}.` : ""}`
            )
            .addFields(
              pageModels.map(model => ({
                name: model.title || model.model_name,
                value: model.model_name,
                inline: true,
              }))
            );

          embeds.push(embed);
        }

        if (embeds.length === 1) {
          await interaction.editReply({ embeds: embeds });
        } else {
          // Send first embed as a reply
          await interaction.editReply({
            content: `Found ${totalModels} Stable Diffusion models. Showing results in ${embeds.length} pages:`,
            embeds: [embeds[0]],
          });

          // Send remaining embeds as follow-ups
          for (let i = 1; i < embeds.length; i++) {
            await interaction.followUp({ embeds: [embeds[i]] });
          }
        }
      }
    } catch (error) {
      log(LogLevel.Error, `Failed to get models: ${error}`);
      await interaction.editReply({
        content: "Failed to get models. Please check the logs for more information.",
      });
    }
  }
}

export default models;
