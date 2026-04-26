import { Events, MessageType } from "discord.js";
import axios from "axios";
import { config } from "../config.js";
import { log, logError } from "../utils/logger.js";
import { LogLevel } from "../types.js";
import { makeRequest } from "../api/ollama.js";
import { replySplitMessage } from "../utils/helpers.js";
import { messages, modelInfo, setModelInfo } from "../state/conversations.js";
import type { OllamaShowResponse, OllamaGenerateChunk } from "../types.js";
import type { Event } from "./index.js";

const event: Event<Events.MessageCreate> = {
	name: Events.MessageCreate,
	once: false,
	async execute(message) {
		let typing = false;
		try {
			await message.fetch();

			const channelID: string = message.channel.id;
			if (message.guild && !config.channels.includes(channelID)) return;

			if (!message.author.id) return;
			if (message.author.bot || message.author.id == message.client.user!.id) return;

			const botRole = message.guild?.members?.me?.roles?.botRole;
			const myMention = new RegExp(`<@((!?${message.client.user!.id}${botRole ? `)|(&${botRole.id}` : ""}))>`, "g");

			if (typeof message.content !== "string" || message.content.length == 0) {
				return;
			}

			let context: number[] | null = null;
			if (message.type == MessageType.Reply) {
				const reply = await message.fetchReference();
				if (!reply) return;
				if (reply.author.id != message.client.user!.id) return;
				if (messages[channelID] == null) return;
				const storedContext = messages[channelID][reply.id];
				if (storedContext == null || typeof storedContext === "number") return;
				context = storedContext;
			} else if (message.type != MessageType.Default) {
				return;
			}

			if (modelInfo == null) {
				let rawResponse: string | OllamaShowResponse = await makeRequest<string>("/api/show", "post", {
					name: config.model
				});
				if (typeof rawResponse === "string") rawResponse = JSON.parse(rawResponse) as OllamaShowResponse;
				if (typeof rawResponse !== "object") throw new Error("failed to fetch model information");
				setModelInfo(rawResponse);
			}

			const systemMessages: string[] = [];

			if (config.useModelSystemMessage && modelInfo!.system) {
				systemMessages.push(modelInfo!.system);
			}

			if (config.useCustomSystemMessage) {
				systemMessages.push(config.customSystemMessage!);
			}

			const systemMessage: string = systemMessages.join("\n\n");

			let userInput: string = message.content
				.replace(new RegExp("^\\s*" + myMention.source), "").trim();

			if (userInput.startsWith(".")) {
				const args = userInput.substring(1).split(/\s+/g);
				const cmd = args.shift();
				switch (cmd) {
					case "reset":
					case "clear":
						if (messages[channelID] != null) {
							const cleared = messages[channelID].amount;
							delete messages[channelID];
							if (cleared > 0) {
								await message.reply({ content: `Cleared conversation of ${cleared} messages` });
								break;
							}
						}
						await message.reply({ content: "No messages to clear" });
						break;
					case "help":
					case "?":
					case "h":
						await message.reply({ content: "Commands:\n- `.reset` `.clear`\n- `.help` `.?` `.h`\n- `.ping`\n- `.model`\n- `.system`" });
						break;
					case "model":
						await message.reply({
							content: `Current model: ${config.model}`
						});
						break;
					case "system":
						await replySplitMessage(message, `System message:\n\n${systemMessage}`);
						break;
					case "ping":
						try {
							const beforeTime = Date.now();
							const reply = await message.reply({ content: "Ping" });
							const afterTime = Date.now();
							const difference = afterTime - beforeTime;
							await reply.edit({ content: `Ping: ${difference}ms` });
						} catch (error) {
							logError(error);
							await message.reply({ content: "Error, please check the console" });
						}
						break;
					case "":
						break;
					default:
						await message.reply({ content: "Unknown command, type `.help` for a list of commands" });
						break;
				}
				return;
			}

			if (message.type == MessageType.Default && (config.requiresMention && message.guild && !message.content.match(myMention))) return;

			if (message.guild) {
				await message.guild.channels.fetch();
				await message.guild.members.fetch();
			}

			userInput = userInput
				.replace(myMention, "")
				.replace(/<#([0-9]+)>/g, (_, id: string) => {
					if (message.guild) {
						const chn = message.guild.channels.cache.get(id);
						if (chn) return `#${chn.name}`;
					}
					return "#unknown-channel";
				})
				.replace(/<@!?([0-9]+)>/g, (_, id: string) => {
					if (id == message.author.id) return message.author.username;
					if (message.guild) {
						const mem = message.guild.members.cache.get(id);
						if (mem) return `@${mem.user.username}`;
					}
					return "@unknown-user";
				})
				.replace(/<:([a-zA-Z0-9_]+):([0-9]+)>/g, (_, name: string) => {
					return `emoji:${name}:`;
				})
				.trim();

			if (userInput.length == 0) return;

			if (message.attachments.size > 0) {
				const textAttachments = Array.from(message.attachments, ([, value]) => value).filter(att => att.contentType?.startsWith("text"));
				if (textAttachments.length > 0) {
					try {
						const attachmentContents = await Promise.all(textAttachments.map(async (att, i) => {
							const response = await axios.get<string>(att.url);
							return `\n${i + 1}. File - ${att.name}:\n${response.data}`;
						}));
						userInput += attachmentContents.join("");
					} catch (error) {
						logError(error);
						await message.reply({ content: "Failed to download text files" });
						return;
					}
				}
			}

			if (messages[channelID] == null) {
				messages[channelID] = { amount: 0, last: null };
			}

			const channelName = "name" in message.channel ? message.channel.name : "DMs";
			log.log(LogLevel.Debug, `${message.guild ? `#${channelName}` : "DMs"} - ${message.author.username}: ${userInput}`);

			typing = true;
			if ("sendTyping" in message.channel) await message.channel.sendTyping();
			let typingInterval: ReturnType<typeof setInterval> | null = setInterval(async () => {
				try {
					if ("sendTyping" in message.channel) await message.channel.sendTyping();
				} catch (error) {
					logError(error);
					if (typingInterval != null) {
						clearInterval(typingInterval);
					}
					typingInterval = null;
				}
			}, 7000);

			let response: OllamaGenerateChunk[];
			try {
				if (context == null) {
					context = messages[channelID].last as number[] | null;
				}

				if (config.useInitialPrompt && messages[channelID].amount == 0) {
					userInput = `${config.initialPrompt}\n\n${userInput}`;
					log.log(LogLevel.Debug, "Adding initial prompt to message");
				}

				const rawResponse = await makeRequest<string>("/api/generate", "post", {
					model: config.model,
					prompt: userInput,
					system: systemMessage,
					context
				});

				if (typeof rawResponse != "string") {
					log.log(LogLevel.Debug, rawResponse);
					throw new TypeError("response is not a string, this may be an error with ollama");
				}

				response = rawResponse.split("\n").filter(e => !!e).map(e => {
					return JSON.parse(e) as OllamaGenerateChunk;
				});
			} catch (error) {
				if (typingInterval != null) {
					clearInterval(typingInterval);
				}
				typingInterval = null;
				throw error;
			}

			if (typingInterval != null) {
				clearInterval(typingInterval);
			}
			typingInterval = null;

			let responseText: string = response.map(e => e.response).filter(e => e != null).join("").trim();
			if (responseText.length == 0) {
				responseText = "(No response)";
			}

			log.log(LogLevel.Debug, `Response: ${responseText}`);

			const prefix: string = config.showStartOfConversation && messages[channelID].amount == 0 ?
				"> This is the beginning of the conversation, type `.help` for help.\n\n" : "";

			const replyMessageIDs: string[] = (await replySplitMessage(message, `${prefix}${responseText}`)).map(msg => msg.id);

			const doneChunk = response.find(e => e.done && e.context);
			if (doneChunk?.context) {
				const newContext = doneChunk.context;
				for (const id of replyMessageIDs) {
					messages[channelID][id] = newContext;
				}
				messages[channelID].last = newContext;
				++messages[channelID].amount;
			} else {
				log.log(LogLevel.Error, "Ollama response missing final context; conversation state not updated");
			}
		} catch (error) {
			if (typing) {
				try {
					await message.reply({ content: "Error, please check the console" });
				} catch (ignored) {
					logError(ignored);
				}
			}
			logError(error);
		}
	}
};

export default event;
