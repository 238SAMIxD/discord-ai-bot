import { Events, MessageFlags } from "discord.js";
import { makeStableDiffusionRequest } from "../api/stableDiffusion.js";
import { logError } from "../utils/logger.js";
import type { StableDiffusionResponse } from "../types.js";
import type { Event } from "./index.js";

const event: Event<Events.InteractionCreate> = {
	name: Events.InteractionCreate,
	once: false,
	async execute(interaction) {
		if (!interaction.isChatInputCommand()) return;

		const { commandName, options } = interaction;

		switch (commandName) {
			case "text2img":
				try {
					await interaction.deferReply();
					const prompt = options.getString("prompt", true);
					const width = options.getInteger("width") ?? 256;
					const height = options.getInteger("height") ?? 256;
					const steps = options.getInteger("steps") ?? 10;
					const batch_count = options.getInteger("batch_count") ?? 1;
					const batch_size = options.getInteger("batch_size") ?? 1;
					const enhance_prompt = options.getBoolean("enhance_prompt") ? "yes" : "no";

					const stableDiffusionResponse = await makeStableDiffusionRequest<StableDiffusionResponse>(
						"/sdapi/v1/txt2img",
						"post",
						{
							prompt,
							width,
							height,
							steps,
							num_inference_steps: steps,
							batch_count,
							batch_size,
							enhance_prompt
						}
					);
					const images = (stableDiffusionResponse.images ?? []).map((image) =>
						Buffer.from(image, "base64")
					);
					await interaction.editReply({
						content: `Here are images from prompt \`${prompt}\``,
						files: images
					});
				} catch (error) {
					logError(error);
					if (interaction.deferred || interaction.replied) {
						await interaction.editReply({
							content: "Error, please check the console"
						});
					} else {
						await interaction.reply({
							content: "Error, please check the console",
							flags: MessageFlags.Ephemeral
						});
					}
				}
				break;
		}
	}
};

export default event;
