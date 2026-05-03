/**
 * Resume Checker Tool — Shared Types
 *
 * These types define the data structures used across all modules
 * in the resume-checker-tool pipeline.
 */

/** A single resume section with detection status. */
export interface ResumeSection {
  name: string;
  found: boolean;
  status: "Found" | "Missing";
}

/** Score breakdown for each category (max 100). */
export interface ScoreBreakdown {
  /** Section detection score (0–40) */
  sectionScore: number;
  /** Keyword matching score (0–30) */
  keywordScore: number;
  /** Structure check score (0–20) */
  structureScore: number;
  /** Length check score (0–10) */
  lengthScore: number;
}

/** Complete resume analysis result — compatible with AIToolPage ResumeResult. */
export interface ResumeAnalysisResult {
  atsScore: number;
  grade: string;
  sections: ResumeSection[];
  keywordsFound: string[];
  keywordsMissing: string[];
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  stats: {
    totalWords: number;
    pageCount: number;
    sectionCount: number;
    keywordMatch: number;
  };
  /** Detailed score breakdown per category. */
  scoreBreakdown: ScoreBreakdown;
}

/** Result from the text extraction step. */
export interface ExtractionResult {
  success: boolean;
  text: string;
  pageCount: number;
  error?: string;
}

/** Result from the section detection step. */
export interface SectionDetectionResult {
  sections: ResumeSection[];
  sectionCount: number;
  score: number; // 0–40
}

/** Result from the keyword matching step. */
export interface KeywordMatchResult {
  found: string[];
  missing: string[];
  matchCount: number;
  totalKeywords: number;
  score: number; // 5, 15, or 30
}

/** Result from the structure check step. */
export interface StructureCheckResult {
  hasHeadings: boolean;
  hasBullets: boolean;
  hasReadability: boolean;
  score: number; // 0–20
}

/** Result from the length check step. */
export interface LengthCheckResult {
  wordCount: number;
  label: string;
  score: number; // 0–10
}
