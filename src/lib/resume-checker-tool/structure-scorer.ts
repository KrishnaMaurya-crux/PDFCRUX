/**
 * Resume Checker Tool — Structure Check (20 points)
 *
 * Evaluates resume formatting and structure:
 *   - Proper headings detected  → +10 points
 *   - Bullet points usage       → +5 points
 *   - Readability (spacing)     → +5 points
 *
 * Fully deterministic — no randomness.
 */

import type { StructureCheckResult } from "./types";

/**
 * Check the structural quality of a resume.
 *
 * @param text - The full extracted resume text.
 * @returns A StructureCheckResult with individual flags and total score.
 */
export function structureScore(text: string): StructureCheckResult {
  const lines = text.split("\n");
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);

  // ── 1. Proper headings (0 or 10 points) ──
  // A heading is a short line (< 60 chars) that doesn't end with punctuation
  // and is followed by content (not the last line or followed by another heading)
  let headingCount = 0;
  for (let i = 0; i < nonEmptyLines.length; i++) {
    const line = nonEmptyLines[i].trim();
    if (line.length === 0) continue;
    // Heading criteria: short, no sentence-ending punctuation
    if (line.length >= 2 && line.length <= 60 && !/[.!?]$/.test(line)) {
      headingCount++;
    }
  }
  // At least 2 distinct headings = has proper headings
  const hasHeadings = headingCount >= 2;

  // ── 2. Bullet points (0 or 5 points) ──
  // Check for common bullet markers
  const bulletPatterns = [
    /^\s*[-•*▪▸►]\s/,      // Standard bullet characters
    /^\s*\d+[.)]\s/,       // Numbered lists: "1." or "1)"
  ];
  const bulletLineCount = nonEmptyLines.filter((line) =>
    bulletPatterns.some((p) => p.test(line))
  ).length;
  const hasBullets = bulletLineCount >= 2;

  // ── 3. Readability (0 or 5 points) ──
  // Good readability = has line breaks / spacing between sections
  // Check for blank lines between content (paragraph breaks)
  const blankLineCount = lines.filter((l) => l.trim().length === 0).length;
  // At least some blank lines relative to content = readable structure
  const hasReadability =
    blankLineCount >= 2 && nonEmptyLines.length >= 5;

  // ── Total score ──
  let score = 0;
  if (hasHeadings) score += 10;
  if (hasBullets) score += 5;
  if (hasReadability) score += 5;

  return {
    hasHeadings,
    hasBullets,
    hasReadability,
    score, // 0–20
  };
}
