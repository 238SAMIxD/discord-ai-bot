import {
  CommandInteraction,
  InteractionResponse,
  Message,
  OmitPartialGroupDMChannel,
  TextChannel,
} from "discord.js";

export function splitText(str: string, length: number) {
  str = str
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^\s+|\s+$/g, "");
  const segments: string[] = [];
  let segment = "";
  let word, suffix;
  function appendSegment() {
    segment = segment.replace(/^\s+|\s+$/g, "");
    if (segment.length > 0) {
      segments.push(segment);
      segment = "";
    }
  }
  while ((word = str.match(/^[^\s]*(?:\s+|$)/)) != null) {
    suffix = "";
    word = word[0];
    if (word.length == 0) break;
    if (segment.length + word.length > length) {
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
      if (word.length > length) {
        word = word.substring(0, length);
        if (length > 1 && word.match(/^[^\s]+$/)) {
          word = word.substring(0, word.length - 1);
          suffix = "-";
        }
      }
    }
    str = str.substring(word.length, str.length);
    segment += word + suffix;
  }
  appendSegment();
  return segments;
}

export function getBoolean(str: string) {
  return !!str && str != "false" && str != "no" && str != "off" && str != "0";
}

export function parseJSONMessage(str: string) {
  return str
    .split(/[\r\n]+/g)
    .map(line => {
      const result = JSON.parse(`"${line}"`);
      if (typeof result !== "string") throw new Error("Invalid syntax in .env file");
      return result;
    })
    .join("\n");
}

export function parseEnvString(str: string) {
  return typeof str === "string"
    ? parseJSONMessage(str).replace(/<date>/gi, new Date().toUTCString())
    : null;
}

export async function replySplitMessage(
  interaction: CommandInteraction,
  content: string,
  defer?: boolean
) {
  const responseMessages = splitText(content, 2000).map(text => ({
    content: text,
  }));

  const replyMessages: (OmitPartialGroupDMChannel<Message<boolean>> | Message)[] = [];
  if (defer) {
    await interaction.editReply(responseMessages[0].content);
  }
  for (let i = defer ? 1 : 0; i < responseMessages.length; ++i) {
    replyMessages.push(
      replyMessages.length === 0
        ? await interaction.followUp(responseMessages[i])
        : await replyMessages[replyMessages.length - 1].reply(responseMessages[i].content)
    );
  }
  return replyMessages;
}

export function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}
