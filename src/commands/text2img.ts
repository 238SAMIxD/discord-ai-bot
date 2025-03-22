import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import { LogLevel } from "meklog";

import { log } from "../bot";
import { MAX_COMMAND_CHOICES, MAX_FILES_LENGTH } from "../utils/consts";
import { getModels, makeRequest, METHOD } from "../utils/service";

export type Text2ImgOptions = {
  prompt: string;
  width: number;
  height: number;
  steps: number;
  num_inference_steps: number;
  n_iter: number;
  batch_size: number;
  enhance_prompt: boolean;
  override_settings?: {
    sd_model_checkpoint: string;
  };
};

interface StableDiffusionResponse {
  images: string[];
}

interface Model {
  title: string;
  model_name: string;
}

const SERVER = process.env.STABLE_DIFFUSION;

async function text2img(fetch = false) {
  const models =
    (fetch && SERVER && ((await getModels(SERVER, "/sdapi/v1/sd-models")) || [])) || [];
  const tooManyModels = models.length > MAX_COMMAND_CHOICES;

  if (tooManyModels && fetch) {
    log(
      LogLevel.Warning,
      `Found ${models.length} Stable Diffusion models, which exceeds Discord's limit of ${MAX_COMMAND_CHOICES} choices. Using text input instead.`
    );
  }

  const command = new SlashCommandBuilder()
    .setName("text2img")
    .setDescription("Convert text to image")
    .addStringOption(option =>
      option.setName("prompt").setDescription("Text to convert").setRequired(true)
    );

  // If too many models, use a regular string input instead of choices
  if (tooManyModels) {
    command.addStringOption(option =>
      option
        .setName("model")
        .setDescription("Model to use (use /models stable_diffusion to see available models)")
        .setRequired(false)
    );
  } else {
    command.addStringOption(option =>
      option
        .setName("model")
        .setDescription("Model to use")
        .setRequired(false)
        .addChoices(
          models.map((model: Model) => ({
            name: `${model.model_name}`,
            value: model.model_name,
          }))
        )
    );
  }

  // Add the remaining options
  command
    .addNumberOption(option =>
      option
        .setName("width")
        .setDescription("Width of the image")
        .setRequired(false)
        .setMinValue(128)
        .setMaxValue(1024)
    )
    .addNumberOption(option =>
      option
        .setName("height")
        .setDescription("Height of the image")
        .setRequired(false)
        .setMinValue(128)
        .setMaxValue(1024)
    )
    .addNumberOption(option =>
      option
        .setName("steps")
        .setDescription("Number of steps")
        .setRequired(false)
        .setMinValue(5)
        .setMaxValue(20)
    )
    .addNumberOption(option =>
      option
        .setName("iterations")
        .setDescription("Iterations")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(5)
    )
    .addNumberOption(option =>
      option
        .setName("batch_size")
        .setDescription("Batch size")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(5)
    )
    .addBooleanOption(option =>
      option.setName("enhance_prompt").setDescription("Enhance prompt").setRequired(false)
    );

  return {
    command,
    handler: handleText2Img,
  };
}

async function handleText2Img(interaction: CommandInteraction) {
  const { options } = interaction;

  const prompt = options.get("prompt")!.value as string;
  const width = (options.get("width")?.value as number) ?? 256;
  const height = (options.get("height")?.value as number) ?? 256;
  const steps = (options.get("steps")?.value as number) ?? 10;
  const iterations = (options.get("iterations")?.value as number) ?? 1;
  const batchSize = (options.get("batch_size")?.value as number) ?? 1;
  const enhancePrompt = (options.get("enhance_prompt")?.value as boolean) ?? false;
  const model = options.get("model")?.value as string;

  await interaction.deferReply();
  try {
    const response: StableDiffusionResponse = await makeRequest(
      SERVER!,
      "/sdapi/v1/txt2img",
      METHOD.POST,
      {
        prompt,
        width,
        height,
        steps,
        num_inference_steps: steps,
        n_iter: iterations,
        batch_size: batchSize,
        enhance_prompt: enhancePrompt,
        override_settings: model ? { sd_model_checkpoint: model } : undefined,
      }
    );

    const images = response.images.map(image => Buffer.from(image, "base64"));
    await interaction.editReply({
      content: `Here are images from prompt \`${prompt}\``,
      files: images.slice(0, MAX_FILES_LENGTH),
    });

    if (images.length > MAX_FILES_LENGTH) {
      let message = await interaction.followUp({
        files: images.slice(MAX_FILES_LENGTH, MAX_FILES_LENGTH * 2),
      });
      for (let i = 2; i < Math.ceil(images.length / MAX_FILES_LENGTH); i++) {
        message = await message.reply({
          files: images.slice(MAX_FILES_LENGTH * i, MAX_FILES_LENGTH * (i + 1)),
        });
      }
    }
  } catch (error) {
    log(LogLevel.Error, error);
    await interaction.editReply({
      content: "Failed to generate images",
    });
  }
}

export default text2img;
