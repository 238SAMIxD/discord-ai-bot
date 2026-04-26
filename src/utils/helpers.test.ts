import test from "node:test";
import assert from "node:assert/strict";
import { stripLeadingMention } from "./helpers.js";

test("stripLeadingMention removes a leading mention after whitespace", () => {
	const mentionPattern = new RegExp("<@((!?123)|(&456))>", "g");

	assert.equal(stripLeadingMention("   <@123> .help", mentionPattern), ".help");
	assert.equal(stripLeadingMention("\n\t<@&456> .reset", mentionPattern), ".reset");
});

test("stripLeadingMention only removes mentions at the start of the message", () => {
	const mentionPattern = new RegExp("<@!?123>", "g");

	assert.equal(stripLeadingMention("hello <@123> .help", mentionPattern), "hello <@123> .help");
});
