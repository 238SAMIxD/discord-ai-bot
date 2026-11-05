import type {
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from "discord.js";

declare module "discord.js" {
  interface Client {
    shardID?: number;
  }
}

/**
 * Server instance for Ollama or Stable Diffusion endpoints.
 */
export interface Server {
  url: string;
  available: boolean;
}

/**
 * Request payload for the Ollama `/api/show` endpoint.
 */
export interface OllamaShowRequest {
  name: string;
}

/**
 * Response from the Ollama `/api/show` endpoint.
 */
export interface OllamaShowResponse {
  system?: string;
  template?: string;
  modelfile?: string;
  parameters?: string;
  capabilities?: string[];
  details?: {
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

/**
 * Request payload for the Ollama `/api/generate` endpoint.
 */
export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  system?: string;
  images?: string[];
}

export interface OllamaStats {
  model?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  context_length?: number;
}

/**
 * A model loaded in memory, as listed by the Ollama `/api/ps` endpoint.
 */
export interface OllamaPsModel {
  name?: string;
  model?: string;
  context_length?: number;
}

/**
 * Response from the Ollama `/api/ps` endpoint.
 */
export interface OllamaPsResponse {
  models?: OllamaPsModel[];
}

/**
 * Individual chunk from the Ollama `/api/generate` streaming response.
 */
export interface OllamaGenerateResponse extends OllamaStats {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
}

export interface OllamaChatMessage {
  role: string;
  content: string;
  images?: string[];
}

/**
 * Request payload for the Ollama `/api/chat` endpoint.
 */
export interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream?: boolean;
}

/**
 * Individual chunk from the Ollama `/api/chat` streaming response.
 */
export interface OllamaChatResponse extends OllamaStats {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

export type OllamaResponse = OllamaGenerateResponse | OllamaChatResponse;

/**
 * Request payload for the Stable Diffusion `/sdapi/v1/txt2img` endpoint.
 */
export interface SDTxt2ImgRequest {
  prompt: string;
  negative_prompt?: string;
  steps?: number;
  num_inference_steps?: number;
  width?: number;
  height?: number;
  cfg_scale?: number;
  sampler_name?: string;
  enable_hr?: boolean;
  hr_scale?: number;
  hr_upscaler?: string;
  batch_count?: number;
  batch_size?: number;
  enhance_prompt?: boolean;
}

/**
 * Response from the Stable Diffusion `/sdapi/v1/txt2img` endpoint.
 */
export interface SDResponse {
  images: string[];
  parameters?: SDTxt2ImgRequest;
  info?: string;
}

/**
 * IPC message sent from the shard manager to a shard.
 */
import type { LoggerData } from "./utils/logger.js";

export interface ShardMessage {
  shardID?: number;
  logger?: LoggerData;
}

export interface CommandFeatures {
  imageInput: boolean;
}

/**
 * Interface representing a slash command in the bot.
 */
export interface BotCommand {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | RESTPostAPIChatInputApplicationCommandsJSONBody
    | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  buildData?(features: CommandFeatures): BotCommand["data"];
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}
