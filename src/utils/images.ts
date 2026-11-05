import { getConfig } from "../config.js";
import { getVisionModels, supportsVision } from "../api/ollama.js";
import { downloadAttachment } from "./helpers.js";
import { log, LogLevel } from "./logger.js";

import type { Attachment } from "discord.js";

export type ImageAttachment = Pick<
  Attachment,
  "name" | "size" | "contentType" | "url"
>;

const MAX_LISTED_MODELS = 10;

function code(text: string): string {
  return `\`${text.replace(/`/g, "'")}\``;
}

export function isImageAttachment(
  attachment: Pick<Attachment, "contentType">,
): boolean {
  return attachment.contentType?.startsWith("image/") ?? false;
}

export function imageAttachmentError(
  attachment: ImageAttachment,
): string | null {
  if (!isImageAttachment(attachment)) {
    return `${code(attachment.name)} isn't an image. Attach a PNG, JPEG, GIF or WebP file.`;
  }
  const maxMb = getConfig().maxImageSizeMb;
  if (attachment.size > maxMb * 1024 * 1024) {
    return `${code(attachment.name)} is too big. Images must be under ${maxMb} MB.`;
  }
  return null;
}

export async function visionRejection(
  model: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (await supportsVision(model, signal)) return null;

  let names: string[] = [];
  try {
    names = (await getVisionModels()).map((m) => code(m.model));
  } catch (e) {
    log.log(LogLevel.Debug, "Could not list the vision models", e);
  }
  signal?.throwIfAborted();

  if (names.length === 0) {
    return `${code(model)} can't read images, and no vision model is installed on the Ollama server.`;
  }
  const listed = names.slice(0, MAX_LISTED_MODELS).join(", ");
  const more = names.length > MAX_LISTED_MODELS ? ", …" : "";
  return `${code(model)} can't read images. Vision models available: ${listed}${more} — pick one with the \`model\` option.`;
}

export async function downloadImage(
  attachment: ImageAttachment,
  signal?: AbortSignal,
): Promise<string> {
  const res = await downloadAttachment(attachment.url, "arraybuffer", signal);
  return Buffer.from(res.data as ArrayBuffer).toString("base64");
}

export function ignoredImagesMessage(attachments: ImageAttachment[]): string {
  const names = attachments.map((a) => code(a.name)).join(", ");
  const verb = attachments.length === 1 ? "was" : "were";
  return `Image input is turned off on this bot, so ${names} ${verb} ignored.`;
}

export function imageMarker(attachment: ImageAttachment): string {
  return `[image: ${attachment.name}]`;
}
