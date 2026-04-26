import { Message } from "discord.js";

export function shuffleArray<T>(array: T[]): T[] {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}

export function splitText(str: string, length: number): string[] {
	str = str
		.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
		.replace(/^\s+|\s+$/g, "");
	const segments: string[] = [];
	let segment = "";
	let word: RegExpMatchArray | null;
	let suffix: string;
	function appendSegment(): void {
		segment = segment.replace(/^\s+|\s+$/g, "");
		if (segment.length > 0) {
			segments.push(segment);
			segment = "";
		}
	}
	while ((word = str.match(/^[^\s]*(?:\s+|$)/)) != null) {
		suffix = "";
		const wordStr = word[0];
		if (wordStr.length == 0) break;
		if (segment.length + wordStr.length > length) {
			if (segment.includes("\n")) {
				const beforeParagraph = segment.match(/^.*\n/s);
				if (beforeParagraph != null) {
					const lastParagraph = segment.substring(beforeParagraph[0].length, segment.length);
					segment = beforeParagraph[0];
					appendSegment();
					segment = lastParagraph;
					continue;
				}
			}
			appendSegment();
			let currentWord = wordStr;
			if (currentWord.length > length) {
				currentWord = currentWord.substring(0, length);
				if (length > 1 && currentWord.match(/^[^\s]+$/)) {
					currentWord = currentWord.substring(0, currentWord.length - 1);
					suffix = "-";
				}
			}
			str = str.substring(currentWord.length, str.length);
			segment += currentWord + suffix;
			continue;
		}
		str = str.substring(wordStr.length, str.length);
		segment += wordStr + suffix;
	}
	appendSegment();
	return segments;
}

export function getBoolean(str: string | undefined): boolean {
	return !!str && str != "false" && str != "no" && str != "off" && str != "0";
}

export function parseJSONMessage(str: string): string {
	return str.split(/[\r\n]+/g).map(line => {
		const result: unknown = JSON.parse(`"${line}"`);
		if (typeof result !== "string") throw new Error("Invalid syntax in .env file");
		return result;
	}).join("\n");
}

export function parseEnvString(str: string | undefined): string | null {
	return typeof str === "string" ?
		parseJSONMessage(str).replace(/<date>/gi, new Date().toUTCString()) : null;
}

export async function replySplitMessage(replyMessage: Message, content: string): Promise<Message[]> {
	const responseMessages = splitText(content, 2000).map(text => ({ content: text }));

	const replyMessages: Message[] = [];
	for (let i = 0; i < responseMessages.length; ++i) {
		if (i == 0) {
			replyMessages.push(await replyMessage.reply(responseMessages[i]));
		} else if ("send" in replyMessage.channel) {
			replyMessages.push(await replyMessage.channel.send(responseMessages[i]));
		}
	}
	return replyMessages;
}
