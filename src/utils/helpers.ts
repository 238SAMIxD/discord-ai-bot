import { CommandInteraction, Message } from "discord.js";
import axios from "axios";
import type { ResponseType } from "axios";

export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function splitText(str: string, length: number): string[] {
  str = str
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
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
    if (wordStr.length === 0) break;
    if (segment.length + wordStr.length > length) {
      if (segment.includes("\n")) {
        const beforeParagraph = segment.match(/^.*\n/s);
        if (beforeParagraph != null) {
          const lastParagraph = segment.substring(
            beforeParagraph[0].length,
            segment.length,
          );
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
  if (!str) return false;
  const normalized = str.trim().toLowerCase();
  return (
    normalized !== "" &&
    normalized !== "false" &&
    normalized !== "no" &&
    normalized !== "off" &&
    normalized !== "0"
  );
}

export function parsePositiveInt(
  str: string | undefined,
  fallback: number,
): number {
  if (str == null || str.trim().length === 0) return fallback;
  const parsed = Number(str);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid numeric value: ${str}`);
  }
  return parsed;
}


function unescapeMessageLine(line: string): string {
  let result = "";

  for (let i = 0; i < line.length; ++i) {
    if (line[i] !== "\\") {
      result += line[i];
      continue;
    }

    const nextChar = line[++i];
    if (nextChar === undefined) {
      result += "\\";
      break;
    }

    switch (nextChar) {
      case "\\":
        result += "\\";
        break;
      case '"':
        result += '"';
        break;
      case "/":
        result += "/";
        break;
      case "b":
        result += "\b";
        break;
      case "f":
        result += "\f";
        break;
      case "n":
        result += "\n";
        break;
      case "r":
        result += "\r";
        break;
      case "t":
        result += "\t";
        break;
      case "u": {
        const codePoint = line.slice(i + 1, i + 5);
        if (/^[0-9a-fA-F]{4}$/.test(codePoint)) {
          result += String.fromCharCode(Number.parseInt(codePoint, 16));
          i += 4;
          break;
        }
        result += "\\u";
        break;
      }
      default:
        result += `\\${nextChar}`;
        break;
    }
  }

  return result;
}


export function parseJSONMessage(str: string): string {
  return str
    .split(/[\r\n]+/g)
    .map(unescapeMessageLine)
    .join("\n");
}

export function parseEnvString(str: string | undefined): string | null {
  return typeof str === "string"
    ? parseJSONMessage(str).replace(/<date>/gi, new Date().toUTCString())
    : null;
}


export function downloadAttachment(
  url: string,
  responseType: ResponseType = "json",
) {
  return axios.get(url, {
    responseType,
  });
}

export async function replySplitInteraction(
  interaction: CommandInteraction,
  content: string,
  defer?: boolean,
): Promise<Message[]> {
  const responseMessages = splitText(content, 2000).map((text) => ({
    content: text,
  }));

  if (responseMessages.length === 0) {
    responseMessages.push({ content: "(No response)" });
  }

  const replyMessages: Message[] = [];
  if (defer) {
    const initialMessage = await interaction.editReply(responseMessages[0]);
    replyMessages.push(initialMessage);
  } else {
    const initialMessage = await interaction.reply({
      ...responseMessages[0],
      fetchReply: true,
    });
    replyMessages.push(initialMessage);
  }

  for (let i = 1; i < responseMessages.length; ++i) {
    const nextMessage = await interaction.followUp({
      ...responseMessages[i],
      fetchReply: true,
    });
    replyMessages.push(nextMessage);
  }
  return replyMessages;
}
