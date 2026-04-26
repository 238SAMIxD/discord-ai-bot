import dotenv from "dotenv";
import { getBoolean, parseEnvString } from "./utils/helpers.js";
import type { Server } from "./types.js";

dotenv.config();

const customSystemMessage = parseEnvString(process.env.SYSTEM);
const initialPrompt = parseEnvString(process.env.INITIAL_PROMPT);
const token = process.env.TOKEN;

if (!token) {
	throw new Error("TOKEN environment variable is required");
}

function parseServerUrl(url: string, envName: string): URL {
	try {
		return new URL(url);
	} catch {
		throw new Error(`Invalid URL in ${envName}: ${url}`);
	}
}

function parseServers(value: string | undefined, envName: string): Server[] {
	return (value ?? "")
		.split(",")
		.map(url => url.trim())
		.filter(url => url.length > 0)
		.map((url): Server => ({ url: parseServerUrl(url, envName), available: true }));
}

export const config = {
	token,
	model: process.env.MODEL ?? "orca",
	servers: parseServers(process.env.OLLAMA, "OLLAMA"),
	stableDiffusionServers: parseServers(process.env.STABLE_DIFFUSION, "STABLE_DIFFUSION"),
	channels: (process.env.CHANNELS ?? "").split(",").filter(c => c.length > 0),
	customSystemMessage,
	useCustomSystemMessage: getBoolean(process.env.USE_SYSTEM) && !!customSystemMessage,
	useModelSystemMessage: getBoolean(process.env.USE_MODEL_SYSTEM),
	showStartOfConversation: getBoolean(process.env.SHOW_START_OF_CONVERSATION),
	randomServer: getBoolean(process.env.RANDOM_SERVER),
	initialPrompt,
	useInitialPrompt: getBoolean(process.env.USE_INITIAL_PROMPT) && !!initialPrompt,
	requiresMention: getBoolean(process.env.REQUIRES_MENTION)
};

if (config.servers.length === 0) {
	throw new Error("No servers available");
}
if (process.env.CHANNELS === undefined) {
	throw new Error("CHANNELS environment variable is missing. If DM-only mode is intended, set it to an empty string.");
}
