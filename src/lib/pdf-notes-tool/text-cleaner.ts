/**
 * PDF Notes Tool — Text Cleaner
 *
 * Normalizes raw PDF-extracted text for downstream notes generation:
 * - Removes excessive whitespace, tabs, and newlines
 * - Strips non-printable / special characters
 * - Normalizes unicode dashes and quotes
 * - Merges broken words caused by PDF column layout
 * - Preserves line breaks for section detection (unlike summary cleaner)
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Characters to strip entirely (non-printable, control chars, etc.) */
const STRIP_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u200b\u200c\u200d\ufeff]/g;

/** Multiple spaces/tabs collapsed to single space */
const COLLAPSE_SPACES_RE = /[ \t]+/g;

// Unicode normalization map
const UNICODE_MAP: [RegExp, string][] = [
  [/\u2010|\u2011/g, "-"],
  [/\u2012|\u2013/g, "-"],
  [/\u2014|\u2015/g, "-"],
  [/\u2018|\u201a/g, "'"],
  [/\u2019|\u201b/g, "'"],
  [/\u201c/g, '"'],
  [/\u201d/g, '"'],
  [/\u2026/g, "..."],
  [/\u00a0/g, " "],
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CleanedText {
  /** The cleaned, normalized text (preserves single newlines for section detection) */
  text: string;
  /** Array of non-empty lines (preserving structure) */
  lines: string[];
  /** Word count of cleaned text */
  wordCount: number;
}

/**
 * Clean raw PDF-extracted text while preserving line structure.
 *
 * Unlike the summary cleaner (which collapses everything into paragraphs),
 * this version preserves single newlines so that section headings and
 * structural breaks remain detectable.
 *
 * Pipeline:
 *  1. Strip control / zero-width characters
 *  2. Normalize unicode dashes & quotes
 *  3. Collapse excessive spaces/tabs (but NOT newlines)
 *  4. Trim each line and filter empty lines
 *  5. Collapse 3+ consecutive newlines to 2 (section boundary)
 *
 * @param raw - Raw text from PDF extraction.
 * @returns A `CleanedText` with preserved line structure.
 */
export function cleanText(raw: string): CleanedText {
  let text = raw;

  // 1. Strip non-printable characters
  text = text.replace(STRIP_RE, "");

  // 2. Normalize unicode
  for (const [re, replacement] of UNICODE_MAP) {
    text = text.replace(re, replacement);
  }

  // 3. Collapse spaces/tabs only (NOT newlines)
  text = text.replace(COLLAPSE_SPACES_RE, " ");

  // 4. Split into lines, trim, filter empty
  const rawLines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // 5. Collapse 3+ consecutive "empty-seeming" lines to single blank line
  // (marks section boundaries without losing them)
  const lines = collapseLineBreaks(rawLines);

  // 6. Rebuild text
  text = lines.join("\n");

  // 7. Word count
  const wordCount = countWords(text);

  return { text, lines, wordCount };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countWords(text: string): number {
  return text
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

/**
 * Collapse runs of very short lines (< 3 chars, likely page artifacts)
 * into single separators rather than removing them entirely.
 */
function collapseLineBreaks(lines: string[]): string[] {
  if (lines.length === 0) return [];

  const result: string[] = [];
  let lastWasShort = false;

  for (const line of lines) {
    const isShort = line.length <= 2 && !/[A-Za-z]/.test(line);

    if (isShort && lastWasShort) {
      // Skip consecutive artifact lines
      continue;
    }

    if (isShort) {
      // Keep single artifact line as a separator
      result.push("");
    } else {
      result.push(line);
    }

    lastWasShort = isShort;
  }

  return result;
}
