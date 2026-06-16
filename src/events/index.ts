import { Client, ClientEvents } from "discord.js";
import ready from "./ready.js";
import interactionCreate from "./interactionCreate.js";
import messageCreate from "./messageCreate.js";

export interface Event<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once: boolean;
  execute: (...args: ClientEvents[K]) => Promise<void> | void;
}

const events = [ready, interactionCreate, messageCreate];

export function registerEvents(client: Client) {
  for (const e of events) {
    const event = e as unknown as Event<keyof ClientEvents>;
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }
}
