import test from "node:test";
import assert from "node:assert/strict";
import { parseJSONLines, parseJSONMessage, stripLeadingMention } from "./helpers.js";

test("stripLeadingMention removes a leading mention after whitespace", () => {
	const mentionPattern = new RegExp("<@((!?123)|(&456))>", "g");

	assert.equal(stripLeadingMention("   <@123> .help", mentionPattern), ".help");
	assert.equal(stripLeadingMention("\n\t<@&456> .reset", mentionPattern), ".reset");
});

test("stripLeadingMention only removes mentions at the start of the message", () => {
	const mentionPattern = new RegExp("<@!?123>", "g");

	assert.equal(stripLeadingMention("hello <@123> .help", mentionPattern), "hello <@123> .help");
});

test("parseJSONMessage preserves plain quotes while decoding escaped sequences", () => {
	const input = String.raw`You said "hello"\nPath: C:\Users\bot`;

	assert.equal(parseJSONMessage(input), "You said \"hello\"\nPath: C:\\Users\\bot");
});

test("parseJSONLines parses newline-delimited JSON and reports malformed lines", () => {
	assert.deepEqual(parseJSONLines<{ response: string }>("{\"response\":\"first\"}\n{\"response\":\"second\"}", "test stream"), [
		{ response: "first" },
		{ response: "second" }
	]);

	assert.throws(
		() => parseJSONLines("{\"response\":\"ok\"}\n{\"response\":", "test stream"),
		(error: unknown) => error instanceof Error && error.message === "Invalid test stream JSON on line 2"
	);
});
