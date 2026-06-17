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
 * Conversation context stored per channel.
 */
export interface ChannelMessages {
  amount: number;
  last: number[] | null;
  [messageId: string]: number[] | number | null | undefined;
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

/**
 * Individual chunk from the Ollama `/api/generate` streaming response.
 */
export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Request payload for the Ollama `/api/chat` endpoint.
 */
export interface OllamaChatRequest {
  model: string;
  messages: { role: string; content: string }[];
  stream?: boolean;
}

/**
 * Individual chunk from the Ollama `/api/chat` streaming response.
 */
export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
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

/**
 * Interface representing a slash command in the bot.
 */
export interface BotCommand {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | RESTPostAPIChatInputApplicationCommandsJSONBody
    | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}
