/**
 * PDF Notes Tool — Notes Formatter
 *
 * Converts processed sections into structured, readable study notes:
 * - Creates clean headings
 * - Extracts and formats key points as bullet points
 * - Highlights important lines (bold keywords, definitions, etc.)
 * - Limits bullet count per section for readability
 *
 * BULLET POINT EXTRACTION:
 *   1. Split section text into sentences
 *   2. Score sentences by importance (length, keywords, position)
 *   3. Select top sentences as bullet points
 *   4. Clean and format each bullet for readability
 */

import type { ProcessedSections } from "./section-processor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotesSection {
  /** Section heading */
  heading: string;
  /** Bullet-point summary of key content */
  content: string[];
  /** Number of original lines in this section */
  lineCount: number;
}

export interface NotesResult {
  /** Document title (first meaningful line) */
  title: string;
  /** Structured notes sections */
  sections: NotesSection[];
  /** Total number of sections */
  totalSections: number;
  /** Original document word count */
  wordCount: number;
  /** Estimated reading time for the notes */
  readingTime: string;
  /** Total bullet points generated */
  totalBullets: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max bullet points per section */
const MAX_BULLETS_PER_SECTION = 5;

/** Min bullet points per section (if content available) */
const MIN_BULLETS_PER_SECTION = 2;

/** Important signal words that boost sentence score */
const SIGNAL_WORDS = new Set([
  "important",
  "key",
  "main",
  "crucial",
  "essential",
  "significant",
  "critical",
  "fundamental",
  "primary",
  "therefore",
  "because",
  "conclusion",
  "result",
  "overall",
  "however",
  "furthermore",
  "notably",
  "consequently",
  "defined as",
  "refers to",
  "known as",
  "characterized by",
  "consists of",
  "includes",
  "provides",
  "enables",
  "ensures",
  "example",
  "instance",
  "specifically",
  "particularly",
  "note that",
  "remember",
  "highlight",
  "focus",
  "purpose",
  "goal",
  "objective",
  "benefit",
  "advantage",
  "disadvantage",
  "challenge",
  "solution",
  "approach",
  "method",
  "process",
  "function",
  "feature",
  "concept",
  "principle",
  "theory",
  "model",
  "framework",
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Format processed sections into structured study notes.
 *
 * @param processed - The `ProcessedSections` from the section processor.
 * @param wordCount - Total word count of the original document.
 * @param options - Optional overrides.
 * @returns A `NotesResult` with structured notes.
 */
export function formatNotes(
  processed: ProcessedSections,
  wordCount: number,
  options?: { maxBullets?: number; minBullets?: number }
): NotesResult {
  const { maxBullets = MAX_BULLETS_PER_SECTION, minBullets = MIN_BULLETS_PER_SECTION } = options ?? {};
  const { sections } = processed;

  if (sections.length === 0) {
    return {
      title: "Empty Document",
      sections: [],
      totalSections: 0,
      wordCount,
      readingTime: "0 min read",
      totalBullets: 0,
    };
  }

  // Derive title from first section heading or first line
  const title = deriveTitle(sections);

  // Convert each section to notes
  const notesSections: NotesSection[] = sections.map((sec) => {
    const bullets = extractBulletPoints(sec.lines, maxBullets, minBullets);
    return {
      heading: sec.heading,
      content: bullets,
      lineCount: sec.lines.length,
    };
  });

  const totalBullets = notesSections.reduce(
    (sum, s) => sum + s.content.length,
    0
  );

  return {
    title,
    sections: notesSections,
    totalSections: notesSections.length,
    wordCount,
    readingTime: estimateReadingTime(totalBullets * 15), // ~15 words per bullet
    totalBullets,
  };
}

// ---------------------------------------------------------------------------
// Bullet Point Extraction
// ---------------------------------------------------------------------------

/**
 * Extract the most important sentences from a section as bullet points.
 */
function extractBulletPoints(
  lines: string[],
  maxBullets: number,
  minBullets: number
): string[] {
  // Join all lines into section text
  const sectionText = lines.join(" ");
  if (sectionText.trim().length < 10) return [];

  // Split into sentences
  const sentences = splitSentences(sectionText);
  if (sentences.length === 0) return [sectionText.trim().slice(0, 150)];

  // Score each sentence
  const scored = sentences.map((sentence, index) => ({
    text: sentence,
    score: scoreSentence(sentence, index, sentences.length),
    index,
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Select top bullets (clamped to available sentences)
  const selectCount = Math.min(
    maxBullets,
    Math.max(minBullets, Math.min(sentences.length, 4))
  );
  const selected = scored.slice(0, selectCount);

  // Restore original order for readability
  selected.sort((a, b) => a.index - b.index);

  // Format each bullet
  return selected.map((s) => formatBullet(s.text));
}

/**
 * Score a sentence for importance.
 *
 * Criteria:
 *   1. Length (0–25): Ideal 10–40 words
 *   2. Signal words (0–25): Contains important indicator words
 *   3. Position (0–15): First sentences of a section score higher
 *   4. Information density (0–15): Has numbers, definitions, or lists
 *   5. Uniqueness (0–20): Contains unique vocabulary
 */
function scoreSentence(
  sentence: string,
  index: number,
  total: number
): number {
  const words = sentence.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;
  const lower = sentence.toLowerCase();

  // 1. Length score (0–25) — ideal: 10–40 words
  let lengthScore: number;
  if (wordCount >= 10 && wordCount <= 40) {
    lengthScore = 25;
  } else if (wordCount >= 5 && wordCount <= 60) {
    lengthScore = 15;
  } else if (wordCount >= 3) {
    lengthScore = 8;
  } else {
    lengthScore = 3;
  }

  // 2. Signal word score (0–25)
  let signalHits = 0;
  SIGNAL_WORDS.forEach((word) => {
    if (lower.includes(word)) signalHits++;
  });
  const signalScore = Math.min(25, signalHits * 5);

  // 3. Position score (0–15) — first 2 sentences score highest
  let positionScore: number;
  if (index === 0) positionScore = 15;
  else if (index === 1) positionScore = 10;
  else if (index <= 2) positionScore = 5;
  else positionScore = 0;

  // 4. Information density (0–15)
  let densityScore = 0;
  // Has numbers (data, statistics)
  if (/\d+/.test(sentence)) densityScore += 5;
  // Has definition pattern
  if (/is (?:defined as|known as|called|referred to|a |an )/i.test(sentence)) {
    densityScore += 5;
  }
  // Has list/comma pattern (enumeration)
  if (/,/.test(sentence) && words.length > 8) {
    densityScore += 3;
  }
  // Has quotes or emphasis
  if (/[""''()]/.test(sentence)) {
    densityScore += 2;
  }
  densityScore = Math.min(15, densityScore);

  // 5. Uniqueness (0–20) — longer unique words
  const longWords = words.filter((w) => w.length > 5).length;
  const uniqueScore = Math.min(20, (longWords / Math.max(wordCount, 1)) * 30);

  return lengthScore + signalScore + positionScore + densityScore + uniqueScore;
}

/**
 * Format a sentence into a clean bullet point.
 */
function formatBullet(sentence: string): string {
  let bullet = sentence.trim();

  // Ensure ends with period
  if (bullet.length > 0 && !/[.!?]$/.test(bullet)) {
    bullet += ".";
  }

  // Cap at ~180 chars for readability
  if (bullet.length > 180) {
    bullet = bullet.slice(0, 177).replace(/\s+\S*$/, "") + "...";
  }

  return bullet;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split text into sentences on common terminators. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5); // Skip very short fragments
}

/** Estimate reading time at ~200 wpm. */
function estimateReadingTime(wordCount: number): string {
  const minutes = Math.max(1, Math.ceil(wordCount / 200));
  return `${minutes} min read`;
}

// ---------------------------------------------------------------------------
// AI Integration Stub (Future: Gemini API)
// ---------------------------------------------------------------------------

/**
 * Generate study notes using AI (Gemini API).
 *
 * **Phase 1 (current)**: Falls back to local rule-based logic.
 * **Phase 2 (future)**: Replace the body with a Gemini API call.
 *
 * @param text - The cleaned document text.
 * @returns A promise resolving to structured notes sections.
 *
 * @example
 * ```ts
 * // Phase 2 — integrate Gemini:
 * const notes = await generateNotesWithAI(cleanedText);
 * // notes → [{ heading: "...", content: ["...", ...] }, ...]
 * ```
 */
export async function generateNotesWithAI(
  text: string
): Promise<NotesResult> {
  // ─── Phase 1: Local fallback ───
  // For now, use the rule-based engine.
  // When Gemini API is ready, replace this with an API call:
  //
  // // ─── Phase 2: Gemini API integration ───
  // //
  // // import ZAI from 'z-ai-web-dev-sdk';
  // //
  // // const zai = await ZAI.create();
  // // const response = await zai.chat.completions.create({
  // //   model: 'gemini-2.0-flash',
  // //   messages: [
  // //     {
  // //       role: 'system',
  // //       content: `You are a study notes generator. Convert the given text into
  // //        structured study notes with clear headings and bullet points.
  // //        Return JSON: { title: string, sections: [{ heading: string, content: string[] }] }`,
  // //     },
  // //     {
  // //       role: 'user',
  // //       content: text.slice(0, 15000),
  // //     },
  // //   ],
  // // });
  // //
  // // const raw = response.choices[0]?.message?.content ?? '';
  // // const parsed = JSON.parse(raw);
  // // return parsed as NotesResult;

  // Fallback: clean + process + format locally
  const { cleanText: clean } = await import("./text-cleaner");
  const { processSections: process } = await import("./section-processor");

  const cleaned = clean(text);
  const processed = process(cleaned);
  return formatNotes(processed, cleaned.wordCount);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive document title from first section. */
function deriveTitle(sections: { heading: string; lines: string[] }[]): string {
  if (sections.length === 0) return "Untitled Document";

  const firstHeading = sections[0].heading;

  // If first heading is generic, try to get title from first content line
  if (
    firstHeading === "Introduction" ||
    firstHeading === "Section 1" ||
    firstHeading.startsWith("Section ")
  ) {
    const firstLine = sections[0].lines[0];
    if (firstLine && firstLine.length > 5) {
      return firstLine
        .trim()
        .replace(/[^a-zA-Z0-9\s\-:.,!?]/g, "")
        .slice(0, 80);
    }
  }

  return firstHeading.slice(0, 80) || "Untitled Document";
}
