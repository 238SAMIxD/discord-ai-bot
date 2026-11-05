import { readFile, rm, writeFile } from "node:fs/promises";

const marker = "<!--app-html-->";
const indexFile = new URL("../dist/index.html", import.meta.url);
const serverDir = new URL("../dist-ssr/", import.meta.url);

const { render } = await import(new URL("entry-server.js", serverDir).href);
const template = await readFile(indexFile, "utf8");
if (!template.includes(marker)) {
  throw new Error(`dist/index.html has no ${marker} marker`);
}

await writeFile(
  indexFile,
  template.replace(marker, () => render()),
);
await rm(serverDir, { recursive: true, force: true });
console.log("Prerendered dist/index.html");
