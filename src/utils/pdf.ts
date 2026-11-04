import { PDFParse } from "pdf-parse";
import { log, LogLevel } from "./logger.js";

/**
 * Extract text content from a PDF buffer.
 */
export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
  try {
    const result = await parser.getText({ pageJoiner: "" });
    return (
      result.text.trim() || "No text content could be extracted from this PDF."
    );
  } catch (error) {
    log.log(LogLevel.Error, "Failed to extract text from PDF", error);
    throw new Error("Failed to extract text from PDF");
  } finally {
    await parser.destroy();
  }
}
