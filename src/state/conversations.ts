import type { ChannelMessages, OllamaShowResponse } from "../types.js";

export const messages: Record<string, ChannelMessages> = {};

export let modelInfo: OllamaShowResponse | null = null;

export function setModelInfo(info: OllamaShowResponse) {
  modelInfo = info;
}
