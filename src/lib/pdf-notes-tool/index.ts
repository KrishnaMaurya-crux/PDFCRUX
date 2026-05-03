/**
 * PDF Notes Tool — Public API
 *
 * End-to-end pipeline: file → cleaned text → sections → structured notes.
 */

export {
  extractText,
  validatePDFFile,
  type ExtractionResult,
} from "./extractor";

export {
  cleanText,
  type CleanedText,
} from "./text-cleaner";

export {
  processSections,
  type RawSection,
  type ProcessedSections,
} from "./section-processor";

export {
  formatNotes,
  generateNotesWithAI,
  type NotesSection,
  type NotesResult,
} from "./notes-formatter";

import { extractText, validatePDFFile } from "./extractor";
import { cleanText } from "./text-cleaner";
import { processSections } from "./section-processor";
import { formatNotes } from "./notes-formatter";

export async function generatePDFNotes(
  file: File,
  options?: { maxBullets?: number; minBullets?: number }
) {
  const validationError = validatePDFFile(file, 50);
  if (validationError) {
    throw new Error(validationError);
  }

  const extraction = await extractText(file);
  if (!extraction.success || !extraction.text.trim()) {
    throw new Error(
      extraction.error ?? "Could not extract text from this PDF."
    );
  }
  if (extraction.text.trim().length < 50) {
    throw new Error(
      "Could not extract enough text from this PDF. Please try a text-based PDF."
    );
  }

  const cleaned = cleanText(extraction.text);
  const processed = processSections(cleaned);
  const result = formatNotes(processed, cleaned.wordCount, options);

  return result;
}
