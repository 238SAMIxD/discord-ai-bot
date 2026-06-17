import { Client, ClientEvents } from "discord.js";
import ready from "./ready.js";
import interactionCreate from "./interactionCreate.js";

export interface Event<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once: boolean;
  execute: (...args: ClientEvents[K]) => Promise<void> | void;
}

function register<K extends keyof ClientEvents>(
  client: Client,
  event: Event<K>,
) {
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

export function registerEvents(client: Client) {
  register(client, ready);
  register(client, interactionCreate);
}
