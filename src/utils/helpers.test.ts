import test from "node:test";
import assert from "node:assert/strict";
import {
  parseJSONMessage,
  parseTimeout,
} from "./helpers.js";


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



test("parseTimeout falls back when unset or blank, and validates numbers", () => {
  assert.equal(parseTimeout(undefined, 0), 0);
  assert.equal(parseTimeout("", 5000), 5000);
  assert.equal(parseTimeout("   ", 5000), 5000);
  assert.equal(parseTimeout("30000", 0), 30000);
  assert.equal(parseTimeout("0", 5000), 0);

  assert.throws(() => parseTimeout("-1", 0), /Invalid timeout value: -1/);
  assert.throws(() => parseTimeout("abc", 0), /Invalid timeout value: abc/);
});
