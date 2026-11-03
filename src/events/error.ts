import { Events } from "discord.js";
import { logError } from "../utils/logger.js";
import type { Event } from "./index.js";

const event: Event<Events.Error> = {
  name: Events.Error,
  once: false,
  execute(error) {
    logError(error);
  },
};

export default event;
