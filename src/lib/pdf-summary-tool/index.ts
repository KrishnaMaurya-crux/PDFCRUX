/**
 * PDF Summary Tool — Public API
 *
 * End-to-end pipeline: file → cleaned text → bullet-point summary.
 */

export {
  extractTextFromPDF,
  validatePDFFile,
  type ExtractionResult,
} from "./extractor";

export {
  cleanText,
  type CleanedText,
} from "./text-cleaner";

export {
  generateSummary,
  generateSummaryWithAI,
  type SummaryResult,
} from "./summary-engine";

import { extractTextFromPDF, validatePDFFile } from "./extractor";
import { cleanText } from "./text-cleaner";
import { generateSummary } from "./summary-engine";

export async function summarizePDF(
  file: File,
  options?: { minBullets?: number; maxBullets?: number }
) {
  const validationError = validatePDFFile(file, 50);
  if (validationError) {
    throw new Error(validationError);
  }

  const extraction = await extractTextFromPDF(file);
  if (!extraction.success || !extraction.text.trim()) {
    throw new Error(extraction.error ?? "Could not extract text from this PDF.");
  }
  if (extraction.text.trim().length < 50) {
    throw new Error(
      "Could not extract enough text from this PDF. Please try a text-based PDF."
    );
  }

  const cleaned = cleanText(extraction.text);
  const result = generateSummary(cleaned, options);

  return result;
}
