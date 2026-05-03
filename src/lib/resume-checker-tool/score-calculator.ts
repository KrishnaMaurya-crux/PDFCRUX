/**
 * Resume Checker Tool — Score Calculator
 *
 * Combines all individual scores into a final ATS score (max 100),
 * determines the grade, and generates strengths, weaknesses, and suggestions.
 *
 * ALL logic is deterministic — zero randomness.
 */

import type {
  ResumeAnalysisResult,
  ScoreBreakdown,
  SectionDetectionResult,
  KeywordMatchResult,
  StructureCheckResult,
  LengthCheckResult,
} from "./types";

/**
 * Estimate page count from word count.
 * Average resume: ~500 words per page.
 */
function estimatePageCount(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 500));
}

/**
 * Determine grade from total ATS score.
 *
 * 90+ → A+
 * 80+ → A
 * 70+ → B
 * 60+ → C
 * 50+ → D
 * <50 → F
 */
function calculateGrade(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
}

/**
 * Generate strengths based on individual analysis results.
 */
function generateStrengths(
  sectionResult: SectionDetectionResult,
  keywordResult: KeywordMatchResult,
  structureResult: StructureCheckResult,
  lengthResult: LengthCheckResult
): string[] {
  const strengths: string[] = [];

  // Section strengths
  if (sectionResult.sectionCount === 4) {
    strengths.push("All 4 critical resume sections are present (Summary, Skills, Experience, Education).");
  } else if (sectionResult.sectionCount === 3) {
    const found = sectionResult.sections.filter((s) => s.found).map((s) => s.name);
    strengths.push(`3 of 4 critical sections found (${found.join(", ")}).`);
  }

  // Keyword strengths
  if (keywordResult.matchCount >= 6) {
    strengths.push(`Strong keyword presence with ${keywordResult.matchCount} ATS-relevant terms detected.`);
  } else if (keywordResult.matchCount >= 3) {
    strengths.push(`Decent keyword coverage with ${keywordResult.matchCount} ATS keywords found.`);
  }

  // Structure strengths
  if (structureResult.hasBullets) {
    strengths.push("Uses bullet points for better readability and ATS parsing.");
  }
  if (structureResult.hasHeadings) {
    strengths.push("Resume has clear headings for structured navigation.");
  }
  if (structureResult.hasReadability) {
    strengths.push("Good use of spacing and line breaks for readability.");
  }

  // Length strengths
  if (lengthResult.score >= 10) {
    strengths.push("Resume length is ideal for ATS scanning (200–600 words).");
  }

  // Fallback
  if (strengths.length === 0) {
    strengths.push("Resume has been submitted for analysis.");
  }

  return strengths;
}

/**
 * Generate weaknesses based on individual analysis results.
 */
function generateWeaknesses(
  sectionResult: SectionDetectionResult,
  keywordResult: KeywordMatchResult,
  structureResult: StructureCheckResult,
  lengthResult: LengthCheckResult
): string[] {
  const weaknesses: string[] = [];

  // Section weaknesses
  const missingSections = sectionResult.sections.filter((s) => !s.found);
  if (missingSections.length > 0) {
    weaknesses.push(
      `Missing ${missingSections.length} critical section${missingSections.length > 1 ? "s" : ""}: ${missingSections.map((s) => s.name).join(", ")}.`
    );
  }

  // Keyword weaknesses
  if (keywordResult.matchCount <= 2) {
    weaknesses.push(
      "Very few ATS keywords detected — resume may not pass initial employer screening."
    );
  }

  // Structure weaknesses
  if (!structureResult.hasBullets) {
    weaknesses.push(
      "No bullet points found — ATS systems prefer bulleted lists for experience and skills."
    );
  }
  if (!structureResult.hasHeadings) {
    weaknesses.push(
      "Resume lacks clear headings — ATS parsers may struggle to identify sections."
    );
  }

  // Length weaknesses
  if (lengthResult.wordCount < 200) {
    weaknesses.push(
      "Resume appears too short — consider expanding content with more details."
    );
  } else if (lengthResult.wordCount > 1000) {
    weaknesses.push(
      "Resume may be too long — consider trimming to 1–2 pages."
    );
  }

  // Fallback
  if (weaknesses.length === 0) {
    weaknesses.push("No major weaknesses detected.");
  }

  return weaknesses;
}

/**
 * Generate rule-based suggestions for improvement.
 */
function generateSuggestions(
  sectionResult: SectionDetectionResult,
  keywordResult: KeywordMatchResult,
  structureResult: StructureCheckResult,
  lengthResult: LengthCheckResult
): string[] {
  const suggestions: string[] = [];

  // Missing section suggestions
  if (!sectionResult.sections.find((s) => s.name === "Summary" && s.found)) {
    suggestions.push(
      "Add a professional summary at the top to immediately highlight your value to recruiters."
    );
  }
  if (!sectionResult.sections.find((s) => s.name === "Skills" && s.found)) {
    suggestions.push(
      "Include a dedicated Skills section with relevant keywords for the target role."
    );
  }
  if (!sectionResult.sections.find((s) => s.name === "Experience" && s.found)) {
    suggestions.push(
      "Add a Work Experience section with quantified achievements using bullet points."
    );
  }
  if (!sectionResult.sections.find((s) => s.name === "Education" && s.found)) {
    suggestions.push(
      "Include an Education section with degrees, institutions, and graduation years."
    );
  }

  // Keyword suggestions
  if (keywordResult.matchCount < 6) {
    const topMissing = keywordResult.missing.slice(0, 5);
    suggestions.push(
      `Incorporate more ATS keywords. Consider adding: ${topMissing.join(", ")}.`
    );
  }

  // Structure suggestions
  if (!structureResult.hasBullets) {
    suggestions.push(
      "Use bullet points (•, -, *) to list achievements, responsibilities, and skills for better ATS parsing."
    );
  }
  if (!structureResult.hasReadability) {
    suggestions.push(
      "Add spacing between sections and use blank lines to improve readability."
    );
  }

  // Length suggestions
  if (lengthResult.wordCount < 300) {
    suggestions.push(
      "Expand your resume content — aim for at least 400–600 words for a one-page resume."
    );
  } else if (lengthResult.wordCount > 1000) {
    suggestions.push(
      "Condense your resume to 1–2 pages. Remove outdated or less relevant experience."
    );
  }

  // Fallback
  if (suggestions.length === 0) {
    suggestions.push(
      "Resume looks solid! Consider tailoring keywords for each specific job application."
    );
  }

  return suggestions;
}

/**
 * Calculate the final ATS score and generate a complete analysis report.
 *
 * This is the main orchestrator — it takes the results from each individual
 * scoring module and combines them into the final ResumeAnalysisResult.
 *
 * NO RANDOMNESS is involved at any stage.
 *
 * @param sectionResult - Output from detectSections()
 * @param keywordResult - Output from keywordScore()
 * @param structureResult - Output from structureScore()
 * @param lengthResult - Output from lengthScore()
 * @returns A complete ResumeAnalysisResult.
 */
export function calculateFinalScore(
  sectionResult: SectionDetectionResult,
  keywordResult: KeywordMatchResult,
  structureResult: StructureCheckResult,
  lengthResult: LengthCheckResult
): ResumeAnalysisResult {
  // Build the score breakdown
  const scoreBreakdown: ScoreBreakdown = {
    sectionScore: sectionResult.score,
    keywordScore: keywordResult.score,
    structureScore: structureResult.score,
    lengthScore: lengthResult.score,
  };

  // Final score = sum of all categories (max 100)
  const atsScore =
    scoreBreakdown.sectionScore +
    scoreBreakdown.keywordScore +
    scoreBreakdown.structureScore +
    scoreBreakdown.lengthScore;

  // Grade
  const grade = calculateGrade(atsScore);

  // Generate strengths, weaknesses, and suggestions
  const strengths = generateStrengths(
    sectionResult,
    keywordResult,
    structureResult,
    lengthResult
  );
  const weaknesses = generateWeaknesses(
    sectionResult,
    keywordResult,
    structureResult,
    lengthResult
  );
  const suggestions = generateSuggestions(
    sectionResult,
    keywordResult,
    structureResult,
    lengthResult
  );

  return {
    atsScore,
    grade,
    sections: sectionResult.sections,
    keywordsFound: keywordResult.found,
    keywordsMissing: keywordResult.missing,
    strengths,
    weaknesses,
    suggestions,
    stats: {
      totalWords: lengthResult.wordCount,
      pageCount: estimatePageCount(lengthResult.wordCount),
      sectionCount: sectionResult.sectionCount,
      keywordMatch: keywordResult.matchCount,
    },
    scoreBreakdown,
  };
}
