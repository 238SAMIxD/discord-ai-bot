import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { clearConfigCache } from "../config.js";
import {
  cancelSlowmode,
  finishSlowmode,
  resetSlowmode,
  slowmodeMessage,
  tryStartSlowmode,
} from "./slowmode.js";

process.env.TOKEN = "test-token";
process.env.OLLAMA = "http://127.0.0.1:9";

function useDelay(ms: number) {
  process.env.SLOWMODE_DELAY = String(ms);
  clearConfigCache();
}

beforeEach(() => {
  resetSlowmode();
  useDelay(10_000);
});

test("tryStartSlowmode never blocks with a delay of 0", () => {
  useDelay(0);

  assert.equal(tryStartSlowmode("1", 0), 0);
  assert.equal(tryStartSlowmode("1", 0), 0);
  finishSlowmode("1", 0);
  assert.equal(tryStartSlowmode("1", 1), 0);
});

test("tryStartSlowmode blocks a user while their request is running", () => {
  assert.equal(tryStartSlowmode("1", 0), 0);
  assert.equal(tryStartSlowmode("1", 60_000), Infinity);
});

test("tryStartSlowmode blocks a user until the delay after their answer passes", () => {
  tryStartSlowmode("1", 0);
  finishSlowmode("1", 5_000);

  assert.equal(tryStartSlowmode("1", 6_000), 9_000);
  assert.equal(tryStartSlowmode("1", 14_999), 1);
  assert.equal(tryStartSlowmode("1", 15_000), 0);
  assert.equal(tryStartSlowmode("1", 15_000), Infinity);
});

test("tryStartSlowmode keeps each user's slow mode separate", () => {
  tryStartSlowmode("1", 0);

  assert.equal(tryStartSlowmode("2", 0), 0);
  finishSlowmode("2", 0);
  assert.equal(tryStartSlowmode("1", 1_000), Infinity);
  assert.equal(tryStartSlowmode("2", 1_000), 9_000);
});

test("finishSlowmode ignores a user without a running request", () => {
  finishSlowmode("1", 0);

  assert.equal(tryStartSlowmode("1", 1), 0);
});

test("cancelSlowmode frees the user without starting a cooldown", () => {
  tryStartSlowmode("1", 0);
  cancelSlowmode("1");

  assert.equal(tryStartSlowmode("1", 1), 0);
});

test("tryStartSlowmode drops every user's expired cooldown", () => {
  tryStartSlowmode("1", 0);
  finishSlowmode("1", 0);
  tryStartSlowmode("2", 0);
  finishSlowmode("2", 5_000);

  tryStartSlowmode("3", 12_000);

  assert.equal(tryStartSlowmode("1", 12_000), 0);
  assert.equal(tryStartSlowmode("2", 12_000), 3_000);
});

test("slowmodeMessage says when the user can ask again", () => {
  assert.equal(
    slowmodeMessage(Infinity),
    "Slow mode: wait until your current answer finishes.",
  );
  assert.equal(
    slowmodeMessage(9_000, 1_000_000),
    "Slow mode: you can ask again <t:1009:R>.",
  );
});
