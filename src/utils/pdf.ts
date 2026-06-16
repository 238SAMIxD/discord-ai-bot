import pdfParse from "pdf-parse";
import { log } from "./logger.js";
import { LogLevel } from "../types.js";

/**
 * Extract text content from a PDF buffer.
 */
export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(pdfBuffer);
    return data.text || "No text content could be extracted from this PDF.";
  } catch (error) {
    log.log(LogLevel.Error, "Failed to extract text from PDF", error);
    throw new Error("Failed to extract text from PDF");
  }
}
