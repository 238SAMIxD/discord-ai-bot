import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { MessageFlags } from "discord.js";
import { getCommands } from "../commands/commands.js";
import event from "./interactionCreate.js";

import type { Interaction } from "discord.js";
import type { BotCommand } from "../types.js";

process.env.TOKEN = "test-token";
process.env.OLLAMA = "http://localhost:11434";
process.env.CHANNELS = "111";

function chatCommand(): Required<BotCommand> {
  const command = getCommands().find((c) => c.data.name === "chat");
  assert.ok(command?.autocomplete);
  return command as Required<BotCommand>;
}

function fakeInteraction(type: "autocomplete" | "command", channelId: string) {
  return {
    commandName: "chat",
    channelId,
    channel: { parentId: null, isThread: () => false },
    deferred: false,
    replied: false,
    inGuild: () => true,
    isAutocomplete: () => type === "autocomplete",
    isChatInputCommand: () => type === "command",
    respond: mock.fn(),
    reply: mock.fn(),
  };
}

test("interactionCreate replies ephemerally instead of running a command in a blocked channel", async (t) => {
  const execute = t.mock.method(
    chatCommand(),
    "execute",
    async () => undefined,
  );
  const interaction = fakeInteraction("command", "333");
  await event.execute(interaction as unknown as Interaction);
  assert.equal(execute.mock.callCount(), 0);
  assert.equal(interaction.reply.mock.callCount(), 1);
  assert.deepEqual(interaction.reply.mock.calls[0]?.arguments, [
    {
      content: "This bot isn't enabled in this channel.",
      flags: MessageFlags.Ephemeral,
    },
  ]);
});

test("interactionCreate runs a command in an allowed channel", async (t) => {
  const execute = t.mock.method(
    chatCommand(),
    "execute",
    async () => undefined,
  );
  const interaction = fakeInteraction("command", "111");
  await event.execute(interaction as unknown as Interaction);
  assert.equal(execute.mock.callCount(), 1);
  assert.equal(interaction.reply.mock.callCount(), 0);
});

test("interactionCreate answers autocomplete in a blocked channel with no choices", async (t) => {
  const autocomplete = t.mock.method(
    chatCommand(),
    "autocomplete",
    async () => undefined,
  );
  const interaction = fakeInteraction("autocomplete", "333");
  await event.execute(interaction as unknown as Interaction);
  assert.equal(autocomplete.mock.callCount(), 0);
  assert.equal(interaction.respond.mock.callCount(), 1);
  assert.deepEqual(interaction.respond.mock.calls[0]?.arguments, [[]]);
});

test("interactionCreate runs autocomplete in an allowed channel", async (t) => {
  const autocomplete = t.mock.method(
    chatCommand(),
    "autocomplete",
    async () => undefined,
  );
  const interaction = fakeInteraction("autocomplete", "111");
  await event.execute(interaction as unknown as Interaction);
  assert.equal(autocomplete.mock.callCount(), 1);
  assert.equal(interaction.respond.mock.callCount(), 0);
});
