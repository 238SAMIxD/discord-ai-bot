/**
 * Server instance for Ollama or Stable Diffusion endpoints.
 */
export interface Server {
	url: URL;
	available: boolean;
}

/**
 * Conversation context stored per channel.
 */
export interface ChannelMessages {
	amount: number;
	last: number[] | null;
	[messageId: string]: number[] | number | null;
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
 * Individual chunk from the Ollama `/api/generate` streaming response.
 */
export interface OllamaGenerateChunk {
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
 * Response from the Stable Diffusion `/sdapi/v1/txt2img` endpoint.
 */
export interface StableDiffusionResponse {
	images: string[];
	parameters?: Record<string, unknown>;
	info?: string;
}

/**
 * IPC message sent from the shard manager to a shard.
 */
export interface ShardMessage {
	shardID?: number;
	logger?: LoggerData;
}

/**
 * Serializable logger state for IPC transfer.
 */
export interface LoggerData {
	production: boolean;
	name: string;
}

/**
 * Log severity levels.
 */
export enum LogLevel {
	Info = "info",
	Debug = "debug",
	Error = "error"
}

/**
 * Simple logger that supports production/debug modes and named contexts.
 *
 * The instance is callable via the `log()` method.
 */
export class Logger {
	public readonly data: LoggerData;
	private readonly production: boolean;
	private readonly name: string;

	constructor(production: boolean, name: string);
	constructor(data: LoggerData);
	constructor(productionOrData: boolean | LoggerData, name?: string) {
		if (typeof productionOrData === "object") {
			this.data = productionOrData;
			this.production = productionOrData.production;
			this.name = productionOrData.name;
		} else {
			this.production = productionOrData;
			this.name = name ?? "Logger";
			this.data = { production: this.production, name: this.name };
		}
	}

	/**
	 * Log a message at the given severity level.
	 * Debug messages are suppressed in production mode.
	 */
	log(level: LogLevel, ...args: unknown[]): void {
		if (level === LogLevel.Debug && this.production) return;

		const timestamp = new Date().toISOString();
		const prefix = `[${timestamp}] [${this.name}] [${level.toUpperCase()}]`;

		switch (level) {
			case LogLevel.Error:
				console.error(prefix, ...args);
				break;
			case LogLevel.Debug:
				console.debug(prefix, ...args);
				break;
			case LogLevel.Info:
			default:
				console.log(prefix, ...args);
				break;
		}
	}
}
