import test from "node:test";
import assert from "node:assert/strict";
import { GatewayIntentBits, IntentsBitField, Partials } from "discord.js";
import { clientOptions } from "./clientOptions.js";

const intents = new IntentsBitField(clientOptions.intents);

test("the client requests the Guilds intent", () => {
  assert.equal(intents.has(GatewayIntentBits.Guilds), true);
});

test("the client requests no privileged intents, so Discord accepts the login without enabling them", () => {
  for (const privileged of [
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
  ]) {
    assert.equal(
      intents.has(privileged),
      false,
      `${GatewayIntentBits[privileged]} is a privileged intent`,
    );
  }
});

test("the client keeps the Channel partial so DM interactions have a channel", () => {
  assert.ok(clientOptions.partials?.includes(Partials.Channel));
});
