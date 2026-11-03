import test from "node:test";
import assert from "node:assert/strict";
import { extractTextFromPDF } from "./pdf.js";

test("extractTextFromPDF throws error on invalid pdf buffer", async () => {
  const dummyBuffer = Buffer.from("not a pdf");
  await assert.rejects(
    () => extractTextFromPDF(dummyBuffer),
    /Failed to extract text from PDF/,
  );
});
