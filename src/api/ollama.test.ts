import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { getLoadedContextLength } from "./ollama.js";
import { Logger, setLogger } from "../utils/logger.js";

import type { AddressInfo } from "node:net";
import type { Server } from "../types.js";

process.env.TOKEN = "test-token";
process.env.OLLAMA = "http://localhost:11434";

setLogger(new Logger(true, "ollama.test"));

async function startPs(
  t: TestContext,
  body: unknown,
  status = 200,
): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.url !== "/api/ps") {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    available: false,
  };
}

const loaded = {
  models: [
    { name: "qwen3:8b", model: "qwen3:8b", context_length: 8192 },
    { name: "my-alias", model: "llama3.2:3b", context_length: 4096 },
    { name: "mistral:latest", model: "mistral:latest", context_length: 32768 },
  ],
};

test("getLoadedContextLength finds the model by its model or name", async (t) => {
  const server = await startPs(t, loaded);
  assert.equal(await getLoadedContextLength(server, "qwen3:8b"), 8192);
  assert.equal(await getLoadedContextLength(server, "llama3.2:3b"), 4096);
  assert.equal(await getLoadedContextLength(server, "my-alias"), 4096);
  assert.equal(await getLoadedContextLength(server, "mistral"), 32768);
  assert.equal(server.available, false);
});

test("getLoadedContextLength is undefined when the model is not loaded", async (t) => {
  const server = await startPs(t, loaded);
  assert.equal(await getLoadedContextLength(server, "gemma3:4b"), undefined);
});

test("getLoadedContextLength is undefined when Ollama does not report the context", async (t) => {
  const server = await startPs(t, {
    models: [
      { name: "qwen3:8b", model: "qwen3:8b" },
      { name: "llama3.2:3b", model: "llama3.2:3b", context_length: 0 },
      { name: "phi4:14b", model: "phi4:14b", context_length: "4096" },
    ],
  });
  assert.equal(await getLoadedContextLength(server, "qwen3:8b"), undefined);
  assert.equal(await getLoadedContextLength(server, "llama3.2:3b"), undefined);
  assert.equal(await getLoadedContextLength(server, "phi4:14b"), undefined);
  assert.equal(
    await getLoadedContextLength(await startPs(t, {}), "qwen3:8b"),
    undefined,
  );
});

test("getLoadedContextLength is undefined when the request fails", async (t) => {
  const server = await startPs(t, { error: "boom" }, 500);
  assert.equal(await getLoadedContextLength(server, "qwen3:8b"), undefined);
  assert.equal(
    await getLoadedContextLength(
      { url: "http://127.0.0.1:1", available: true },
      "qwen3:8b",
    ),
    undefined,
  );
});
