/**
 * PDF AI Tools — Client-side utilities for extracting and analyzing PDF content.
 *
 * All three analysis tools (Summary, Notes, Resume ATS Checker) use pure
 * rule-based logic — no external AI API is required.
 */

import type { TextItem } from "pdfjs-dist/types/src/display/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SummaryResult {
  title: string;
  bulletPoints: string[];
  wordCount: number;
  readingTime: string;
}

export interface NotesSection {
  heading: string;
  content: string[];
}

export interface NotesResult {
  title: string;
  sections: NotesSection[];
  totalSections: number;
  wordCount: number;
}

export interface ResumeResult {
  atsScore: number;
  grade: string;
  sections: { name: string; found: boolean; status: string }[];
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
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Indicator words that signal an important / summarizable paragraph. */
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
]);

/** Resume section keywords (case-insensitive). */
const RESUME_SECTION_KEYWORDS = [
  "summary",
  "objective",
  "skills",
  "experience",
  "education",
  "projects",
  "certifications",
  "languages",
  "references",
  "achievements",
];

/** Predefined ATS keyword pool (case-insensitive matching). */
const ATS_KEYWORD_POOL = [
  "communication",
  "leadership",
  "javascript",
  "python",
  "java",
  "react",
  "node",
  "management",
  "teamwork",
  "analytical",
  "problem-solving",
  "project management",
  "data analysis",
  "sql",
  "aws",
  "cloud",
  "agile",
  "scrum",
  "git",
  "html",
  "css",
  "typescript",
  "api",
  "database",
  "machine learning",
  "ai",
  "design",
  "testing",
  "development",
  "strategy",
  "marketing",
  "sales",
  "finance",
  "accounting",
  "research",
  "excel",
  "powerpoint",
  "crm",
  "erp",
  "collaboration",
  "presentation",
  "negotiation",
  "planning",
  "budgeting",
  "reporting",
  "consulting",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function estimateReadingTime(wordCount: number): string {
  const minutes = Math.max(1, Math.ceil(wordCount / 200));
  return `${minutes} min read`;
}

/**
 * Clean a string for use as a title: take the first meaningful line,
 * strip extra whitespace and trailing punctuation.
 */
function deriveTitle(text: string): string {
  const firstLine = text.split("\n").find((l) => l.trim().length > 0) ?? "";
  return firstLine.trim().replace(/[^a-zA-Z0-9\s\-–—:.,!?]/g, "").slice(0, 100);
}

// ---------------------------------------------------------------------------
// 1. PDF Text Extraction
// ---------------------------------------------------------------------------

/**
 * Extract all text from a PDF file using pdfjs-dist.
 *
 * The worker script is expected at `/pdf.worker.min.mjs` (served from `public/`).
 *
 * @param file - A PDF `File` object selected by the user.
 * @returns A single string containing the full text of every page.
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");

  // Configure the worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    useWorkerFetch: false,
  }).promise;

  const pageTexts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .filter((item): item is TextItem => "str" in item)
      .map((item) => item.str)
      .join(" ");

    pageTexts.push(pageText);
  }

  return pageTexts.join("\n\n");
}

// ---------------------------------------------------------------------------
// 2. Generate Summary
// ---------------------------------------------------------------------------

/**
 * Generate a summary of the given text as 5–10 bullet points.
 *
 * Uses a pure heuristic scoring algorithm:
 * 1. Split text into paragraphs.
 * 2. Score each paragraph by sentence count, average sentence length, and
 *    presence of key indicator words.
 * 3. Select the top-scoring paragraphs and convert them into concise bullets.
 *
 * @param text - The full document text.
 * @returns A `SummaryResult` with title, bullet points, word count, and reading time.
 */
export function generateSummary(text: string): SummaryResult {
  const wordCount = countWords(text);
  const title = deriveTitle(text);

  if (wordCount === 0) {
    return { title: "Empty Document", bulletPoints: [], wordCount: 0, readingTime: "0 min read" };
  }

  // Split into paragraphs
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 20);

  if (paragraphs.length === 0) {
    return {
      title,
      bulletPoints: [text.trim().slice(0, 120)],
      wordCount,
      readingTime: estimateReadingTime(wordCount),
    };
  }

  // Score each paragraph
  interface ScoredParagraph {
    text: string;
    score: number;
  }

  const scored: ScoredParagraph[] = paragraphs.map((para) => {
    const sentences = para
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const sentenceCount = sentences.length;
    const avgLength =
      sentenceCount > 0
        ? sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentenceCount
        : 0;

    // Count indicator words (case-insensitive)
    const lower = para.toLowerCase();
    const indicatorHits = INDICATOR_WORDS.size;
    let indicatorMatchCount = 0;
    INDICATOR_WORDS.forEach((word) => {
      if (lower.includes(word)) {
        indicatorMatchCount++;
      }
    });
    const indicatorRatio = indicatorHits > 0 ? indicatorMatchCount / indicatorHits : 0;

    // Weighted score
    const score =
      sentenceCount * 2 +
      Math.min(avgLength, 30) * 0.5 +
      indicatorRatio * 30;

    return { text: para, score };
  });

  // Sort descending by score and pick top 5-10
  scored.sort((a, b) => b.score - a.score);
  const topCount = Math.min(10, Math.max(5, Math.ceil(paragraphs.length * 0.3)));
  const selected = scored.slice(0, topCount);

  // Convert to concise bullets
  const bullets = new Set<string>();
  for (const para of selected) {
    // Take the first sentence, or truncate
    const firstSentence = para.text.split(/[.!?]+/)[0]?.trim() ?? "";
    const bullet =
      firstSentence.length > 20
        ? firstSentence.length > 120
          ? firstSentence.slice(0, 117) + "..."
          : firstSentence + "."
        : para.text.slice(0, 120) + (para.text.length > 120 ? "..." : "");
    bullets.add(bullet);
  }

  return {
    title,
    bulletPoints: Array.from(bullets).slice(0, 10),
    wordCount,
    readingTime: estimateReadingTime(wordCount),
  };
}

// ---------------------------------------------------------------------------
// 3. Generate Notes
// ---------------------------------------------------------------------------

/**
 * Convert the given text into structured notes with headings and bullet points.
 *
 * Detection heuristics for headings:
 * - Lines that are ALL CAPS
 * - Lines ending with ":"
 * - Short lines (< 80 chars) that don't end with a period
 *
 * If no headings are found, logical sections are created from paragraph breaks.
 *
 * @param text - The full document text.
 * @returns A `NotesResult` with title, sections, and metadata.
 */
export function generateNotes(text: string): NotesResult {
  const wordCount = countWords(text);
  const title = deriveTitle(text);

  if (wordCount === 0) {
    return { title: "Empty Document", sections: [], totalSections: 0, wordCount: 0 };
  }

  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  // Detect headings
  const isHeading = (line: string): boolean => {
    // ALL CAPS (at least 3 chars, with at least one letter)
    if (line.length >= 3 && line === line.toUpperCase() && /[A-Z]/.test(line)) return true;
    // Ends with colon
    if (line.endsWith(":")) return true;
    // Short line that doesn't end with sentence punctuation
    if (line.length < 80 && !/[.!?]$/.test(line) && line.length >= 3) return true;
    return false;
  };

  // Build sections
  interface RawSection {
    heading: string;
    lines: string[];
  }

  const sections: RawSection[] = [];
  let currentSection: RawSection | null = null;

  for (const line of lines) {
    if (isHeading(line)) {
      const heading = line.replace(/:$/, "").trim();
      currentSection = { heading, lines: [] };
      sections.push(currentSection);
    } else if (currentSection) {
      currentSection.lines.push(line);
    } else {
      // No heading yet — create a generic one
      currentSection = { heading: "Introduction", lines: [line] };
      sections.push(currentSection);
    }
  }

  // If no sections were found, split by paragraph breaks
  if (sections.length === 0) {
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    paragraphs.forEach((para, idx) => {
      const sentences = para
        .split(/[.!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const heading =
        sentences[0]?.length > 80
          ? sentences[0].slice(0, 77) + "..."
          : sentences[0] ?? `Section ${idx + 1}`;
      const content = sentences.slice(1).map((s) => s + ".");
      sections.push({ heading: heading + ".", lines: content });
    });
  }

  // Convert to NotesSection format (up to 5 bullets each)
  const notesSections: NotesSection[] = sections.map((sec) => {
    // Re-split the accumulated lines into sentences for bullets
    const fullText = sec.lines.join(" ");
    const sentences = fullText
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const bullets = sentences.slice(0, 5).map((s) => s.endsWith(".") ? s : s + ".");
    return {
      heading: sec.heading,
      content: bullets,
    };
  });

  return {
    title,
    sections: notesSections,
    totalSections: notesSections.length,
    wordCount,
  };
}

// ---------------------------------------------------------------------------
// 4. Resume ATS Checker
// ---------------------------------------------------------------------------

/**
 * Analyze a resume's ATS (Applicant Tracking System) compatibility using
 * rule-based scoring.
 *
 * Scoring breakdown (0–100):
 * - **Section Score** (0–40): How many standard resume sections are present.
 * - **Keyword Score** (0–30): How many ATS-friendly keywords are matched.
 * - **Length Score** (0–20): Word count appropriateness.
 * - **Format Score** (0–10): Use of bullet points and structured layout.
 *
 * @param text - The full resume text.
 * @returns A `ResumeResult` with ATS score, grade, and detailed analysis.
 */
export function analyzeResume(text: string): ResumeResult {
  const lower = text.toLowerCase();
  const totalWords = countWords(text);

  // --- Section detection ---
  const sections = RESUME_SECTION_KEYWORDS.map((kw) => {
    // Look for the keyword as a standalone heading (line starts with it)
    const regex = new RegExp(`(?:^|\\n)\\s*${escapeRegex(kw)}s?\\s*(?::|\\n|$)`, "i");
    const found = regex.test(text);
    return {
      name: kw.charAt(0).toUpperCase() + kw.slice(1),
      found,
      status: found ? "Found" : "Missing",
    };
  });

  const sectionCount = sections.filter((s) => s.found).length;

  // --- Keyword detection ---
  const keywordsFound: string[] = [];
  const keywordsMissing: string[] = [];

  for (const kw of ATS_KEYWORD_POOL) {
    // Use word-boundary-aware matching
    const regex = new RegExp(`\\b${escapeRegex(kw)}\\b`, "i");
    if (regex.test(lower)) {
      keywordsFound.push(kw);
    } else {
      keywordsMissing.push(kw);
    }
  }

  // --- Bullet point / format detection ---
  const bulletLines = text.split("\n").filter((l) => /^\s*[-•*]\s/.test(l));
  const hasBullets = bulletLines.length > 0;
  const bulletRatio = totalWords > 0 ? bulletLines.length / (text.split("\n").length || 1) : 0;

  // --- Scoring ---
  // Section score: 0–40
  const sectionScore = Math.round(sectionCount * (40 / RESUME_SECTION_KEYWORDS.length));

  // Keyword score: 0–30
  const keywordScore = Math.round(Math.min((keywordsFound.length / 15) * 30, 30));

  // Length score: 0–20
  let lengthScore: number;
  if (totalWords >= 200 && totalWords <= 800) {
    lengthScore = 20;
  } else if (totalWords > 800 && totalWords <= 1500) {
    lengthScore = 15;
  } else if (totalWords > 1500) {
    lengthScore = 10;
  } else {
    lengthScore = 5;
  }

  // Format score: 0–10
  let formatScore = 0;
  if (hasBullets) formatScore += 5;
  if (bulletRatio > 0.2) formatScore += 3;
  if (sectionCount >= 4) formatScore += 2;
  formatScore = Math.min(formatScore, 10);

  const atsScore = sectionScore + keywordScore + lengthScore + formatScore;

  // --- Grade ---
  let grade: string;
  if (atsScore >= 90) grade = "A+";
  else if (atsScore >= 80) grade = "A";
  else if (atsScore >= 70) grade = "B";
  else if (atsScore >= 60) grade = "C";
  else if (atsScore >= 50) grade = "D";
  else grade = "F";

  // --- Strengths ---
  const strengths: string[] = [];
  if (sectionCount >= 7) strengths.push("Comprehensive resume structure with most standard sections.");
  else if (sectionCount >= 5) strengths.push("Good resume structure with several standard sections.");
  if (keywordsFound.length >= 15) strengths.push(`Strong keyword presence with ${keywordsFound.length} ATS-relevant terms.`);
  else if (keywordsFound.length >= 8) strengths.push(`Decent keyword coverage with ${keywordsFound.length} ATS-relevant terms.`);
  if (hasBullets) strengths.push("Uses bullet points for readability and ATS parsing.");
  if (totalWords >= 200 && totalWords <= 1500) strengths.push("Resume length is appropriate for ATS scanning.");
  if (sectionCount >= 3 && formatScore >= 5) strengths.push("Well-formatted document with structured layout.");

  if (strengths.length === 0) strengths.push("Resume has been submitted for analysis.");

  // --- Weaknesses ---
  const weaknesses: string[] = [];
  const missingSections = sections.filter((s) => !s.found);
  if (missingSections.length > 3) weaknesses.push(`Missing ${missingSections.length} common resume sections (e.g., ${missingSections.slice(0, 3).map((s) => s.name.toLowerCase()).join(", ")}).`);
  if (keywordsFound.length < 5) weaknesses.push("Very few ATS keywords detected — resume may not pass initial screening.");
  if (totalWords < 200) weaknesses.push("Resume appears too short — consider expanding content.");
  if (totalWords > 1500) weaknesses.push("Resume may be too long — consider trimming to 1–2 pages.");
  if (!hasBullets) weaknesses.push("No bullet points found — ATS systems prefer bulleted lists for experience and skills.");

  if (weaknesses.length === 0) weaknesses.push("No major weaknesses detected.");

  // --- Suggestions ---
  const suggestions: string[] = [];
  if (!sections.find((s) => s.name === "Summary" && s.found))
    suggestions.push("Add a professional summary at the top to immediately highlight your value.");
  if (!sections.find((s) => s.name === "Skills" && s.found))
    suggestions.push("Include a dedicated Skills section with relevant keywords for the target role.");
  if (!sections.find((s) => s.name === "Experience" && s.found))
    suggestions.push("Add a Work Experience section with quantified achievements using bullet points.");
  if (!sections.find((s) => s.name === "Education" && s.found))
    suggestions.push("Include an Education section with degrees, institutions, and graduation years.");
  if (keywordsFound.length < 10)
    suggestions.push(`Incorporate more industry keywords. Consider adding: ${keywordsMissing.slice(0, 5).join(", ")}.`);
  if (!hasBullets)
    suggestions.push("Use bullet points (•, -, *) to list achievements, responsibilities, and skills for better ATS parsing.");
  if (totalWords < 300)
    suggestions.push("Expand your resume content — aim for at least 400–800 words for a one-page resume.");
  if (totalWords > 1500)
    suggestions.push("Condense your resume to 1–2 pages. Remove outdated or less relevant experience.");

  if (suggestions.length === 0) suggestions.push("Resume looks solid! Consider tailoring keywords for each specific job application.");

  return {
    atsScore,
    grade,
    sections,
    keywordsFound,
    keywordsMissing,
    strengths,
    weaknesses,
    suggestions,
    stats: {
      totalWords,
      pageCount: estimatePageCount(totalWords),
      sectionCount,
      keywordMatch: keywordsFound.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function estimatePageCount(wordCount: number): number {
  // Average ~500 words per page for a resume-style document
  return Math.max(1, Math.round(wordCount / 500));
}
