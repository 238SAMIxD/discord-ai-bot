import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import { makeStableDiffusionRequest } from "../api/stableDiffusion.js";
import { ServersBusyError } from "../api/base.js";
import { BUSY_MESSAGE } from "../utils/helpers.js";
import { logError } from "../utils/logger.js";
import { createStopButton } from "../utils/stopButton.js";
import { BotCommand, SDResponse, SDTxt2ImgRequest } from "../types.js";

const data = new SlashCommandBuilder()
  .setName("text2img")
  .setDescription("Convert text to image")
  .addStringOption((option) =>
    option
      .setName("prompt")
      .setDescription("Text to convert")
      .setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName("width")
      .setDescription("Width of the image")
      .setRequired(false)
      .setMinValue(128)
      .setMaxValue(1024),
  )
  .addIntegerOption((option) =>
    option
      .setName("height")
      .setDescription("Height of the image")
      .setRequired(false)
      .setMinValue(128)
      .setMaxValue(1024),
  )
  .addIntegerOption((option) =>
    option
      .setName("steps")
      .setDescription("Number of steps")
      .setRequired(false)
      .setMinValue(5)
      .setMaxValue(20),
  )
  .addIntegerOption((option) =>
    option
      .setName("batch_count")
      .setDescription("Batch count")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(4),
  )
  .addIntegerOption((option) =>
    option
      .setName("batch_size")
      .setDescription("Batch size")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(5),
  )
  .addBooleanOption((option) =>
    option
      .setName("enhance_prompt")
      .setDescription("Enhance prompt")
      .setRequired(false),
  );

const text2img: BotCommand = {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    const stop = createStopButton(interaction);
    try {
      await interaction.deferReply();
      await stop.show();
      const prompt = interaction.options.getString("prompt", true);
      const width = interaction.options.getInteger("width") ?? 256;
      const height = interaction.options.getInteger("height") ?? 256;
      const steps = interaction.options.getInteger("steps") ?? 10;
      const batch_count = interaction.options.getInteger("batch_count") ?? 1;
      const batch_size = interaction.options.getInteger("batch_size") ?? 1;
      const enhance_prompt =
        interaction.options.getBoolean("enhance_prompt") ?? false;

      const payload: SDTxt2ImgRequest = {
        prompt,
        width,
        height,
        steps,
        num_inference_steps: steps,
        batch_count,
        batch_size,
        enhance_prompt,
      };

      const stableDiffusionResponse = await makeStableDiffusionRequest<
        SDResponse,
        SDTxt2ImgRequest
      >("/sdapi/v1/txt2img", "post", payload, stop.signal, stop.queueStatus);
      stop.complete();
      const images = (stableDiffusionResponse?.images ?? []).map((image) =>
        Buffer.from(image, "base64"),
      );
      await interaction.editReply({
        content: `Here are images from prompt \`${prompt}\``,
        files: images,
        components: [],
      });
    } catch (error) {
      if (stop.signal.aborted) {
        await interaction.editReply({ content: "Stopped." });
        return;
      }
      logError(error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content:
            error instanceof ServersBusyError
              ? BUSY_MESSAGE
              : "Error, please check the console",
          components: [],
        });
      } else {
        await interaction.reply({
          content: "Error, please check the console",
          flags: MessageFlags.Ephemeral,
        });
      }
    } finally {
      await stop.finish();
    }
  },
};

export default text2img;
