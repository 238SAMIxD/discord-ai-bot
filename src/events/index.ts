import { Client, ClientEvents } from "discord.js";
import ready from "./ready.js";
import interactionCreate from "./interactionCreate.js";

export interface Event<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once: boolean;
  execute: (...args: ClientEvents[K]) => Promise<void> | void;
}

const events: Event<keyof ClientEvents>[] = [
  ready as Event<keyof ClientEvents>, 
  interactionCreate as Event<keyof ClientEvents>
];

export function registerEvents(client: Client) {
  for (const event of events) {
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }
}
