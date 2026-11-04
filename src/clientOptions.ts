import { GatewayIntentBits, Partials } from "discord.js";
import type { ClientOptions } from "discord.js";

export const clientOptions: ClientOptions = {
  intents: [GatewayIntentBits.Guilds],
  allowedMentions: { users: [], roles: [], repliedUser: false },
  partials: [Partials.Channel],
};
