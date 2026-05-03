/**
 * Resume Checker Tool — Section Detection (40 points)
 *
 * Checks for the 4 critical resume sections:
 *   - Summary / Objective → +10 points
 *   - Skills             → +10 points
 *   - Experience         → +10 points
 *   - Education          → +10 points
 *
 * Each section detected earns 10 points. Missing sections get 0.
 * Fully deterministic — no randomness.
 */

import type { ResumeSection, SectionDetectionResult } from "./types";

/** The 4 key sections to detect, with their regex patterns. */
const KEY_SECTIONS: { name: string; patterns: RegExp[] }[] = [
  {
    name: "Summary",
    patterns: [
      /(?:^|\n)\s*(?:professional\s+)?summary\s*(?::|$|\n)/i,
      /(?:^|\n)\s*(?:career\s+)?objective\s*(?::|$|\n)/i,
      /(?:^|\n)\s*profile\s*(?::|$|\n)/i,
      /(?:^|\n)\s*about\s+me\s*(?::|$|\n)/i,
      /(?:^|\n)\s*executive\s+summary\s*(?::|$|\n)/i,
    ],
  },
  {
    name: "Skills",
    patterns: [
      /(?:^|\n)\s*(?:technical\s+)?skills?\s*(?::|$|\n)/i,
      /(?:^|\n)\s*core\s+competenc(?:y|ies)\s*(?::|$|\n)/i,
      /(?:^|\n)\s*areas?\s+of\s+expertise\s*(?::|$|\n)/i,
      /(?:^|\n)\s*proficiencies?\s*(?::|$|\n)/i,
    ],
  },
  {
    name: "Experience",
    patterns: [
      /(?:^|\n)\s*(?:work\s+)?experience\s*(?::|$|\n)/i,
      /(?:^|\n)\s*professional\s+(?:experience|background)\s*(?::|$|\n)/i,
      /(?:^|\n)\s*employment\s+(?:history|record)\s*(?::|$|\n)/i,
      /(?:^|\n)\s*career\s+history\s*(?::|$|\n)/i,
    ],
  },
  {
    name: "Education",
    patterns: [
      /(?:^|\n)\s*education\s*(?::|$|\n)/i,
      /(?:^|\n)\s*academic\s+(?:background|qualifications?)\s*(?::|$|\n)/i,
      /(?:^|\n)\s*educational\s+qualifications?\s*(?::|$|\n)/i,
    ],
  },
];

/**
 * Detect the 4 key resume sections in the extracted text.
 *
 * Each section found = +10 points. Max 40.
 *
 * @param text - The full extracted resume text.
 * @returns A SectionDetectionResult with sections, count, and score.
 */
export function detectSections(text: string): SectionDetectionResult {
  const sections: ResumeSection[] = KEY_SECTIONS.map((sec) => {
    const found = sec.patterns.some((pattern) => pattern.test(text));
    return {
      name: sec.name,
      found,
      status: found ? ("Found" as const) : ("Missing" as const),
    };
  });

  const sectionCount = sections.filter((s) => s.found).length;

  // Each found section = 10 points, max 40
  const score = sectionCount * 10;

  return {
    sections,
    sectionCount,
    score,
  };
}
