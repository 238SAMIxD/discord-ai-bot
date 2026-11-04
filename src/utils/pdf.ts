import { PDFParse } from "pdf-parse";
import { log, logError, LogLevel } from "./logger.js";

/**
 * Extract text content from a PDF buffer.
 */
export async function extractTextFromPDF(
  pdfBuffer: Buffer,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
  const stopParsing = () => void parser.destroy().catch(logError);
  signal?.addEventListener("abort", stopParsing, { once: true });
  try {
    const result = await parser.getText({ pageJoiner: "" });
    signal?.throwIfAborted();
    return (
      result.text.trim() || "No text content could be extracted from this PDF."
    );
  } catch (error) {
    signal?.throwIfAborted();
    log.log(LogLevel.Error, "Failed to extract text from PDF", error);
    throw new Error("Failed to extract text from PDF");
  } finally {
    signal?.removeEventListener("abort", stopParsing);
    await parser.destroy();
  }
}
