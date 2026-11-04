import test from "node:test";
import assert from "node:assert/strict";
import { GuildMember } from "discord.js";
import { parseJSONMessage, parsePositiveInt, speakerName } from "./helpers.js";

import type { BaseInteraction } from "discord.js";

function interactionFrom(member: unknown): BaseInteraction {
  return {
    member,
    user: { displayName: "Alice A." },
  } as unknown as BaseInteraction;
}

function cachedMember(nickname: string | null): GuildMember {
  return Object.create(GuildMember.prototype, {
    nickname: { value: nickname },
    user: { value: { displayName: "Alice A." } },
  }) as GuildMember;
}

test("parseJSONMessage preserves plain quotes while decoding JSON-style escape sequences", () => {
  const input = String.raw`You said "hello"\nPath: C:\\Users\\bot`;
  const tabInput = String.raw`Column1\tColumn2`;
  const unicodeInput = String.raw`Smile: \u263A`;
  const surrogatePairInput = String.raw`Emoji: \uD83D\uDE00`;
  const miscEscapesInput = String.raw`Slash: \/ Backspace:\b FormFeed:\f`;

  assert.equal(
    parseJSONMessage(input),
    'You said "hello"\nPath: C:\\Users\\bot',
  );
  assert.equal(parseJSONMessage(tabInput), "Column1\tColumn2");
  assert.equal(parseJSONMessage(unicodeInput), "Smile: ☺");
  assert.equal(parseJSONMessage(surrogatePairInput), "Emoji: 😀");
  assert.equal(
    parseJSONMessage(miscEscapesInput),
    "Slash: / Backspace:\b FormFeed:\f",
  );
});

test("parsePositiveInt falls back when unset or blank, and validates numbers", () => {
  assert.equal(parsePositiveInt(undefined, 0), 0);
  assert.equal(parsePositiveInt("", 5000), 5000);
  assert.equal(parsePositiveInt("   ", 5000), 5000);
  assert.equal(parsePositiveInt("30000", 0), 30000);
  assert.equal(parsePositiveInt("0", 5000), 0);

  assert.throws(() => parsePositiveInt("-1", 0), /Invalid numeric value: -1/);
  assert.throws(() => parsePositiveInt("abc", 0), /Invalid numeric value: abc/);
});

test("speakerName uses the server nickname of a cached or uncached member", () => {
  assert.equal(
    speakerName(interactionFrom(cachedMember("Captain Alice"))),
    "Captain Alice",
  );
  assert.equal(
    speakerName(interactionFrom({ nick: "Captain Alice" })),
    "Captain Alice",
  );
});

test("speakerName falls back to the user's display name without a nickname or in DMs", () => {
  assert.equal(speakerName(interactionFrom(cachedMember(null))), "Alice A.");
  assert.equal(speakerName(interactionFrom({ nick: null })), "Alice A.");
  assert.equal(speakerName(interactionFrom(null)), "Alice A.");
});
