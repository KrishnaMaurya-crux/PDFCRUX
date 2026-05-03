/**
 * Resume Checker Tool — Length Check (10 points)
 *
 * Evaluates resume length based on word count:
 *   - Too short  (< 200 words)  → 2 points
 *   - Ideal      (200–600 words) → 10 points
 *   - Long       (600–1000 words) → Linear interpolation 10→5
 *   - Too long   (> 1000 words)  → 5 points
 *
 * Fully deterministic — no randomness.
 */

import type { LengthCheckResult } from "./types";

/**
 * Count words in a text string.
 */
function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

/**
 * Evaluate the resume length and score it.
 *
 * @param text - The full extracted resume text.
 * @returns A LengthCheckResult with word count and score.
 */
export function lengthScore(text: string): LengthCheckResult {
  const wordCount = countWords(text);

  let score: number;
  let label: string;

  if (wordCount < 200) {
    score = 2;
    label = "Too short";
  } else if (wordCount <= 600) {
    score = 10;
    label = "Ideal length";
  } else if (wordCount <= 1000) {
    // Linear interpolation: 600→10, 1000→5
    const ratio = (wordCount - 600) / (1000 - 600);
    score = Math.round(10 - ratio * 5);
    label = "Slightly long";
  } else {
    score = 5;
    label = "Too long";
  }

  return {
    wordCount,
    label,
    score, // 0–10
  };
}
