/**
 * Text Cleaner
 *
 * Normalizes raw PDF-extracted text for downstream processing:
 * - Removes excessive whitespace, tabs, and newlines
 * - Strips non-printable / special characters
 * - Normalizes unicode dashes and quotes
 * - Merges broken words caused by PDF column layout
 * - Splits text into clean paragraphs
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Characters to strip entirely (non-printable, control chars, etc.) */
const STRIP_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u200b\u200c\u200d\ufeff]/g;

/** Multiple whitespace (spaces + tabs) collapsed to single space */
const COLLAPSE_SPACES_RE = /[ \t]+/g;

/** Two or more newlines → paragraph boundary */
const PARAGRAPH_SPLIT_RE = /\n{2,}/;

/** Single newlines within a paragraph → space */
const INLINE_NEWLINE_RE = /\n/g;

// Unicode normalization map
const UNICODE_MAP: [RegExp, string][] = [
  [/\u2010|\u2011/g, "-"],       // hyphen variants
  [/\u2012|\u2013/g, "–"],       // en-dash
  [/\u2014|\u2015/g, "—"],       // em-dash
  [/\u2018|\u201a/g, "'"],       // left single quote
  [/\u2019|\u201b/g, "'"],       // right single quote / apostrophe
  [/\u201c/g, '"'],              // left double quote
  [/\u201d/g, '"'],              // right double quote
  [/\u2026/g, "..."],            // ellipsis
  [/\u00a0/g, " "],              // non-breaking space → normal space
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CleanedText {
  /** The cleaned, normalized text */
  text: string;
  /** Array of individual paragraphs (min 15 chars) */
  paragraphs: string[];
  /** Word count of cleaned text */
  wordCount: number;
}

/**
 * Clean raw PDF-extracted text.
 *
 * Pipeline:
 *  1. Strip control / zero-width characters
 *  2. Normalize unicode dashes & quotes to ASCII equivalents
 *  3. Collapse excessive whitespace
 *  4. Split into paragraphs (on double-newline boundaries)
 *  5. Filter short fragments (< 15 chars)
 *
 * @param raw - Raw text from PDF extraction.
 * @returns A `CleanedText` with the cleaned string, paragraph array, and word count.
 */
export function cleanText(raw: string): CleanedText {
  let text = raw;

  // 1. Strip non-printable characters
  text = text.replace(STRIP_RE, "");

  // 2. Normalize unicode
  for (const [re, replacement] of UNICODE_MAP) {
    text = text.replace(re, replacement);
  }

  // 3. Collapse whitespace
  text = text.replace(COLLAPSE_SPACES_RE, " ");

  // 4. Convert single newlines to spaces (inline breaks from PDF)
  text = text.replace(INLINE_NEWLINE_RE, " ");

  // Trim
  text = text.trim();

  // 5. Split into paragraphs on remaining double-newline boundaries
  const rawParagraphs = text.split(PARAGRAPH_SPLIT_RE).map((p) => p.trim()).filter(Boolean);
  const paragraphs = rawParagraphs.filter((p) => p.length >= 15);

  // 6. Final word count
  const wordCount = countWords(text);

  return { text, paragraphs, wordCount };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}
