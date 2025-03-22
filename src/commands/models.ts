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
      const providerName = interaction.options.get("provider")?.name as string;

      const server = process.env[provider.toUpperCase()];
      if (!server) {
        await interaction.editReply({
          content: `No ${providerName} server configured. Please check the .env configuration.`,
        });
        return;
      }

      const response = await getModels(
        server,
        provider === "ollama" ? "/api/tags" : "/sdapi/v1/sd-models"
      );
      if (!response || response.length === 0) {
        await interaction.editReply({
          content: `No models found on the ${providerName} server.`,
        });
        return;
      }

      const models: (OllamaModel | StableDiffusionModel)[] = response.models || response;
      const totalModels = models.length;

      const embeds = [];

      for (let i = 0; i < Math.ceil(models.length / MAX_EMBED_FIELDS); i++) {
        const startIndex = i * MAX_EMBED_FIELDS;
        const endIndex = Math.min((i + 1) * MAX_EMBED_FIELDS, models.length);
        const pageModels = models.slice(startIndex, endIndex);

        const embed = new EmbedBuilder()
          .setTitle(`Available ${providerName} Models ${i > 0 ? `(Page ${i + 1})` : ""}`)
          .setDescription(
            `Found ${totalModels} models on the server.${totalModels > MAX_EMBED_FIELDS ? ` Showing ${startIndex + 1}-${endIndex} of ${totalModels}.` : ""}`
          )
          .addFields(
            pageModels.map(model => ({
              name:
                provider === "ollama"
                  ? (model as OllamaModel).name
                  : (model as StableDiffusionModel).title ||
                    (model as StableDiffusionModel).model_name,
              value:
                provider === "ollama"
                  ? (model as OllamaModel).model
                  : (model as StableDiffusionModel).model_name,
              inline: true,
            }))
          );

        embeds.push(embed);
      }

      if (embeds.length === 1) {
        await interaction.editReply({ embeds: embeds });
      } else {
        await interaction.editReply({
          content: `Found ${totalModels} ${providerName} models. Showing results in ${embeds.length} pages:`,
          embeds: [embeds[0]],
        });

        let lastMessage = await interaction.fetchReply();
        for (let i = 1; i < embeds.length; i++) {
          if (i === 1) {
            lastMessage = await interaction.followUp({ embeds: [embeds[i]] });
          } else {
            lastMessage = await lastMessage.reply({ embeds: [embeds[i]] });
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
