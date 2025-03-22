import channels from "./channels";
import chat, { ChatOptions } from "./chat";
import help from "./help";
import models from "./models";
import ping from "./ping";
import systemMessage from "./systemMessage";
import text2img, { Text2ImgOptions } from "./text2img";

export default [chat, text2img, ping, systemMessage, help, channels, models];

export type CommandsOptions = Text2ImgOptions | ChatOptions;
