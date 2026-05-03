/**
 * Resume Checker Tool — Public API
 *
 * End-to-end pipeline: file → extract → detect → score → report.
 * All scoring is fully deterministic — NO randomness.
 */

export { extractText, validateResumeFile, type ExtractionResult } from "./extractor";
export { detectSections, type SectionDetectionResult } from "./section-detector";
export { keywordScore, type KeywordMatchResult } from "./keyword-scorer";
export { structureScore, type StructureCheckResult } from "./structure-scorer";
export { lengthScore, type LengthCheckResult } from "./length-scorer";
export { calculateFinalScore } from "./score-calculator";
export type {
  ResumeAnalysisResult,
  ResumeSection,
  ScoreBreakdown,
} from "./types";

import { extractText, validateResumeFile } from "./extractor";
import { detectSections } from "./section-detector";
import { keywordScore } from "./keyword-scorer";
import { structureScore } from "./structure-scorer";
import { lengthScore } from "./length-scorer";
import { calculateFinalScore } from "./score-calculator";
import type { ResumeAnalysisResult } from "./types";

export async function analyzeResumeWithAI(
  _text: string
): Promise<ResumeAnalysisResult | null> {
  return null;
}

export async function analyzeResumeATS(
  file: File
): Promise<ResumeAnalysisResult> {
  const validationError = validateResumeFile(file, 10);
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

  const text = extraction.text;

  const sectionResult = detectSections(text);
  const keywordResult = keywordScore(text);
  const structureResult = structureScore(text);
  const lengthResult = lengthScore(text);

  const result = calculateFinalScore(
    sectionResult,
    keywordResult,
    structureResult,
    lengthResult
  );

  return result;
}
