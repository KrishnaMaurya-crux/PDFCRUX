/**
 * Summary Engine
 *
 * Generates a bullet-point summary from cleaned PDF text.
 * Uses a heuristic paragraph-ranking algorithm (Phase 1 — no AI API).
 * Includes a `generateSummaryWithAI()` stub ready for Gemini integration.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SCORING CRITERIA (per paragraph):
 *
 *   1. Sentence Count Score (0–30)
 *      Paragraphs with 3–8 sentences score highest.
 *
 *   2. Indicator Word Score (0–30)
 *      Presence of transitional / signal words like "therefore", "key",
 *      "conclusion", "significant", etc.
 *
 *   3. Length Score (0–20)
 *      Paragraphs between 50–300 words are ideal.
 *
 *   4. Position Bonus (0–10)
 *      First and last paragraphs often carry thesis / conclusion.
 *
 *   5. Keyword Density (0–10)
 *      How many unique content words the paragraph introduces.
 *
 * Total possible: 0–100 per paragraph.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { CleanedText } from "./text-cleaner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SummaryResult {
  /** Document title (first meaningful line) */
  title: string;
  /** Bullet-point summary (5–10 items) */
  bulletPoints: string[];
  /** Total word count of the original document */
  wordCount: number;
  /** Estimated reading time */
  readingTime: string;
  /** Total number of paragraphs analyzed */
  paragraphsAnalyzed: number;
  /** Number of paragraphs selected for summary */
  paragraphsSelected: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Signal words that indicate an important / summarizable paragraph. */
const INDICATOR_WORDS = new Set([
  "therefore",
  "because",
  "important",
  "key",
  "result",
  "conclusion",
  "significant",
  "main",
  "overall",
  "however",
  "furthermore",
  "moreover",
  "notably",
  "consequently",
  "essentially",
  "crucial",
  "fundamental",
  "critical",
  "primary",
  "notably",
  "evidence",
  "research",
  "study",
  "findings",
  "suggests",
  "demonstrates",
  "indicates",
  "according",
  "analysis",
  "data",
  "report",
  "survey",
  "impact",
  "effect",
  "benefit",
  "challenge",
  "solution",
  "approach",
  "method",
  "discovery",
  "development",
  "improvement",
  "increase",
  "decrease",
  "compared",
  "relative",
  "approximately",
  "estimated",
  "potential",
  "strategy",
  "recommendation",
]);

/** Common stop-words to exclude from keyword density check. */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "can", "shall", "it", "its", "this",
  "that", "these", "those", "as", "if", "then", "than", "so", "no", "not",
  "also", "just", "about", "above", "after", "again", "all", "am", "any",
  "because", "before", "between", "both", "each", "few", "more", "most",
  "other", "our", "out", "over", "own", "same", "some", "such", "up",
  "very", "we", "what", "when", "where", "which", "who", "whom", "how",
]);

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

interface ScoredParagraph {
  index: number;
  text: string;
  score: number;
  sentenceCount: number;
}

// ---------------------------------------------------------------------------
// Core Logic
// ---------------------------------------------------------------------------

/**
 * Generate a bullet-point summary from cleaned text using heuristic scoring.
 *
 * @param cleaned - The `CleanedText` from the text-cleaner module.
 * @param options - Optional overrides for bullet count range.
 * @returns A `SummaryResult`.
 */
export function generateSummary(
  cleaned: CleanedText,
  options?: { minBullets?: number; maxBullets?: number }
): SummaryResult {
  const { minBullets = 5, maxBullets = 10 } = options ?? {};
  const { text, paragraphs } = cleaned;
  const wordCount = cleaned.wordCount;
  const title = deriveTitle(text);

  // Edge case: empty
  if (wordCount === 0) {
    return {
      title: "Empty Document",
      bulletPoints: ["Could not extract any text from this PDF."],
      wordCount: 0,
      readingTime: "0 min read",
      paragraphsAnalyzed: 0,
      paragraphsSelected: 0,
    };
  }

  // Edge case: very short text — return as single bullet
  if (paragraphs.length === 0) {
    const fallback = text.trim().length > 20
      ? text.trim().slice(0, 150) + (text.trim().length > 150 ? "..." : "")
      : "Document contains very little extractable text.";
    return {
      title,
      bulletPoints: [fallback],
      wordCount,
      readingTime: estimateReadingTime(wordCount),
      paragraphsAnalyzed: 1,
      paragraphsSelected: 1,
    };
  }

  // ── Score each paragraph ──
  const totalParagraphs = paragraphs.length;
  const scored: ScoredParagraph[] = paragraphs.map((para, index) => {
    const sentences = splitSentences(para);
    const sentenceCount = sentences.length;
    const wordCountPara = para.split(/\s+/).filter((w) => w.length > 0).length;

    // 1. Sentence Count Score (0–30) — sweet spot: 3–8 sentences
    let sentenceScore: number;
    if (sentenceCount >= 3 && sentenceCount <= 8) {
      sentenceScore = 30;
    } else if (sentenceCount >= 2) {
      sentenceScore = 20;
    } else if (sentenceCount >= 1) {
      sentenceScore = 10;
    } else {
      sentenceScore = 5;
    }

    // 2. Indicator Word Score (0–30)
    const lower = para.toLowerCase();
    let indicatorHits = 0;
    INDICATOR_WORDS.forEach((word) => {
      if (lower.includes(word)) indicatorHits++;
    });
    const indicatorScore = Math.min(30, (indicatorHits / 5) * 30);

    // 3. Length Score (0–20) — sweet spot: 50–300 words
    let lengthScore: number;
    if (wordCountPara >= 50 && wordCountPara <= 300) {
      lengthScore = 20;
    } else if (wordCountPara >= 30 && wordCountPara <= 500) {
      lengthScore = 12;
    } else if (wordCountPara >= 15) {
      lengthScore = 6;
    } else {
      lengthScore = 2;
    }

    // 4. Position Bonus (0–10) — first & last paragraphs
    let positionBonus = 0;
    if (index === 0) positionBonus = 8;
    else if (index === totalParagraphs - 1) positionBonus = 6;
    else if (index <= 1) positionBonus = 4;
    else if (index >= totalParagraphs - 2) positionBonus = 3;

    // 5. Keyword Density (0–10) — unique non-stop-words
    const words = lower.split(/\s+/).filter((w) => w.length > 3 && !STOP_WORDS.has(w));
    const uniqueWords = new Set(words);
    const keywordScore = Math.min(10, (uniqueWords.size / 20) * 10);

    const score = sentenceScore + indicatorScore + lengthScore + positionBonus + keywordScore;

    return { index, text: para, score, sentenceCount };
  });

  // ── Select top paragraphs ──
  scored.sort((a, b) => b.score - a.score);

  // Take top 30–50% of paragraphs, clamped to min/max range
  const selectCount = Math.min(
    maxBullets,
    Math.max(minBullets, Math.ceil(totalParagraphs * 0.35))
  );
  const selected = scored.slice(0, selectCount);

  // Restore original order for readability
  selected.sort((a, b) => a.index - b.index);

  // ── Convert to bullet points ──
  const bullets = new Set<string>();

  for (const para of selected) {
    const sentences = splitSentences(para);

    // Try the first sentence as the bullet
    const firstSentence = sentences[0]?.trim() ?? "";

    if (firstSentence.length >= 25) {
      // Cap at ~130 chars, end cleanly
      const clean = firstSentence.length > 130
        ? firstSentence.slice(0, 127).replace(/\s+\S*$/, "") + "..."
        : firstSentence.endsWith(".") ? firstSentence : firstSentence + ".";
      bullets.add(clean);
    } else if (sentences.length >= 2) {
      // Combine first two short sentences
      const combined = (firstSentence + ". " + sentences[1]).trim();
      const capped = combined.length > 140
        ? combined.slice(0, 137).replace(/\s+\S*$/, "") + "..."
        : combined.endsWith(".") ? combined : combined + ".";
      bullets.add(capped);
    } else {
      // Very short — use the whole paragraph truncated
      const capped = para.length > 130
        ? para.slice(0, 127).replace(/\s+\S*$/, "") + "..."
        : para;
      bullets.add(capped);
    }
  }

  return {
    title,
    bulletPoints: Array.from(bullets).slice(0, maxBullets),
    wordCount,
    readingTime: estimateReadingTime(wordCount),
    paragraphsAnalyzed: totalParagraphs,
    paragraphsSelected: Math.min(bullets.size, maxBullets),
  };
}

// ---------------------------------------------------------------------------
// AI Integration Stub (Future: Gemini API)
// ---------------------------------------------------------------------------

/**
 * Generate a summary using AI (Gemini API).
 *
 * **Phase 1 (current)**: Falls back to local heuristic logic.
 * **Phase 2 (future)**: Replace the body with a Gemini API call.
 *
 * @param text - The cleaned document text.
 * @returns A promise resolving to bullet-point strings.
 *
 * @example
 * ```ts
 * // Phase 2 — integrate Gemini:
 * const bullets = await generateSummaryWithAI(cleanedText);
 * ```
 */
export async function generateSummaryWithAI(
  text: string
): Promise<string[]> {
  // ─── Phase 1: Local fallback ───
  // For now, use the heuristic engine.
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
  // //       content: 'You are a document summarizer. ...',
  // //     },
  // //     {
  // //       role: 'user',
  // //       content: text.slice(0, 15000),
  // //     },
  // //   ],
  // // });
  // //
  // // const raw = response.choices[0]?.message?.content ?? '';
  // // return raw.split('\\n').map((l) => l.trim()).filter((l) => l.length > 10);

  // Fallback: clean + summarize locally
  const { cleanText } = await import("./text-cleaner");
  const cleaned = cleanText(text);
  const result = generateSummary(cleaned);
  return result.bulletPoints;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split text into sentences on common terminators. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Estimate reading time at ~200 wpm. */
function estimateReadingTime(wordCount: number): string {
  const minutes = Math.max(1, Math.ceil(wordCount / 200));
  return `${minutes} min read`;
}

/** Derive a document title from the first meaningful line. */
function deriveTitle(text: string): string {
  const firstLine = text.split(/\n/).find((l) => l.trim().length > 0) ?? "";
  return firstLine
    .trim()
    .replace(/[^a-zA-Z0-9\s\-–—:.,!?]/g, "")
    .slice(0, 100) || "Untitled Document";
}
