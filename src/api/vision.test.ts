import test, { beforeEach, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { text } from "node:stream/consumers";
import {
  buildSystemMessage,
  clearModelInfoCache,
  getVisionModels,
  OllamaUnreachableError,
  supportsVision,
} from "./ollama.js";
import { clearConfigCache } from "../config.js";
import { Logger, setLogger } from "../utils/logger.js";

import type { AddressInfo } from "node:net";
import type { OllamaShowResponse } from "../types.js";

setLogger(new Logger(true, "vision.test"));
process.env.TOKEN = "test-token";
process.env.USE_SYSTEM = "false";
process.env.USE_BOT_CONTEXT = "false";
process.env.USE_MODEL_SYSTEM = "true";

const SHOWN: Record<string, OllamaShowResponse> = {
  "llava:latest": {
    system: "You see things.",
    capabilities: ["completion", "vision"],
  },
  "qwen3:8b": {
    capabilities: ["completion", "tools"],
    details: {
      format: "gguf",
      family: "qwen3",
      families: ["qwen3", "clip"],
      parameter_size: "8B",
      quantization_level: "Q4_K_M",
    },
  },
  "old-llava": {
    details: {
      format: "gguf",
      family: "llama",
      families: ["llama", "clip"],
      parameter_size: "7B",
      quantization_level: "Q4_0",
    },
  },
  "old-vision": {
    details: {
      format: "gguf",
      family: "mllama",
      families: ["mllama"],
      parameter_size: "11B",
      quantization_level: "Q4_K_M",
    },
  },
  "old-text": {
    details: {
      format: "gguf",
      family: "llama",
      families: null,
      parameter_size: "7B",
      quantization_level: "Q4_0",
    },
  },
};

beforeEach(() => clearModelInfoCache());

async function startFakeOllama(t: TestContext) {
  const shows: string[] = [];
  const server = createServer(async (req, res) => {
    if (req.url === "/api/tags") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          models: Object.keys(SHOWN).map((name) => ({ name, model: name })),
        }),
      );
      return;
    }
    if (req.url !== "/api/show") {
      res.writeHead(404).end();
      return;
    }
    const { name } = JSON.parse(await text(req)) as { name: string };
    shows.push(name);
    const info = SHOWN[name];
    res.writeHead(info ? 200 : 404, { "Content-Type": "application/json" });
    res.end(JSON.stringify(info ?? { error: `model '${name}' not found` }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  process.env.OLLAMA = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  clearConfigCache();
  return { shows };
}

test("supportsVision follows the capabilities Ollama reports", async (t) => {
  await startFakeOllama(t);
  assert.equal(await supportsVision("llava:latest"), true);
  assert.equal(await supportsVision("qwen3:8b"), false);
});

test("supportsVision falls back to the model families on older Ollama", async (t) => {
  await startFakeOllama(t);
  assert.equal(await supportsVision("old-llava"), true);
  assert.equal(await supportsVision("old-vision"), true);
  assert.equal(await supportsVision("old-text"), false);
});

test("supportsVision is false when Ollama cannot tell", async (t) => {
  const ollama = await startFakeOllama(t);
  assert.equal(await supportsVision("missing"), false);
  assert.equal(await supportsVision("missing"), false);
  assert.deepEqual(ollama.shows, ["missing", "missing"]);

  process.env.OLLAMA = "http://127.0.0.1:1";
  clearConfigCache();
  assert.equal(await supportsVision("llava:latest"), false);
});

test("supportsVision rethrows when it is stopped", async (t) => {
  await startFakeOllama(t);
  await assert.rejects(supportsVision("llava:latest", AbortSignal.abort()));
  assert.equal(await supportsVision("llava:latest"), true);
  await assert.rejects(supportsVision("llava:latest", AbortSignal.abort()));
});

test("supportsVision checks a model without vision again after a while", async (t) => {
  const ollama = await startFakeOllama(t);
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  SHOWN["changing"] = { capabilities: ["completion"] };
  t.after(() => delete SHOWN["changing"]);

  assert.equal(await supportsVision("changing"), false);
  SHOWN["changing"] = { capabilities: ["completion", "vision"] };
  assert.equal(await supportsVision("changing"), false);
  t.mock.timers.tick(5 * 60_000);
  assert.equal(await supportsVision("changing"), true);
  t.mock.timers.tick(60 * 60_000);
  assert.equal(await supportsVision("changing"), true);
  assert.deepEqual(ollama.shows, ["changing", "changing"]);
});

test("supportsVision shares one /api/show request with the model system message", async (t) => {
  const ollama = await startFakeOllama(t);
  assert.equal(await supportsVision("llava:latest"), true);
  assert.equal(await buildSystemMessage("llava:latest"), "You see things.");
  assert.equal(await supportsVision("llava:latest"), true);
  assert.deepEqual(ollama.shows, ["llava:latest"]);
});

test("getVisionModels lists the models that can read images", async (t) => {
  await startFakeOllama(t);
  assert.deepEqual(
    (await getVisionModels()).map((m) => m.model),
    ["llava:latest", "old-llava", "old-vision"],
  );
});

test("getVisionModels fails when no Ollama server answers", async () => {
  process.env.OLLAMA = "http://127.0.0.1:1";
  clearConfigCache();
  await assert.rejects(getVisionModels(), OllamaUnreachableError);
});
