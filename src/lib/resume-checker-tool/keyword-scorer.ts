/**
 * Resume Checker Tool — Keyword Matching (30 points)
 *
 * Matches resume text against a pool of ATS-friendly keywords.
 *
 * Scoring is strictly deterministic (stepped):
 *   - 0–2 keywords found  → 5 points
 *   - 3–5 keywords found  → 15 points
 *   - 6+ keywords found   → 30 points
 *
 * No randomness. No proportional scoring.
 */

import type { KeywordMatchResult } from "./types";

/** Comprehensive ATS keyword pool. */
const ATS_KEYWORDS: string[] = [
  // Soft skills
  "communication",
  "leadership",
  "teamwork",
  "problem-solving",
  "collaboration",
  "presentation",
  "negotiation",
  "planning",
  "analytical",
  "critical thinking",
  "time management",
  "interpersonal",
  "organizational",
  "decision making",
  "adaptability",
  // Technical skills
  "technical skills",
  "javascript",
  "python",
  "java",
  "react",
  "node",
  "typescript",
  "html",
  "css",
  "sql",
  "git",
  "api",
  "database",
  "cloud",
  "aws",
  "azure",
  "machine learning",
  "ai",
  "data analysis",
  "design",
  "testing",
  "development",
  "agile",
  "scrum",
  // Business / Domain
  "project management",
  "management",
  "strategy",
  "marketing",
  "sales",
  "finance",
  "accounting",
  "research",
  "consulting",
  "budgeting",
  "reporting",
  "crm",
  "erp",
  "operations",
  // Tools
  "excel",
  "powerpoint",
  "word",
  " photoshop",
  "illustration",
  "tableau",
  "jira",
  "figma",
  "slack",
];

/**
 * Escape a string for use in a regex pattern.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match keywords in the resume text and calculate score.
 *
 * @param text - The full extracted resume text (lowercased internally).
 * @returns A KeywordMatchResult with found/missing keywords and stepped score.
 */
export function keywordScore(text: string): KeywordMatchResult {
  const lower = text.toLowerCase();

  const found: string[] = [];
  const missing: string[] = [];

  for (const kw of ATS_KEYWORDS) {
    const regex = new RegExp(`\\b${escapeRegex(kw)}\\b`, "i");
    if (regex.test(lower)) {
      found.push(kw);
    } else {
      missing.push(kw);
    }
  }

  // Strict stepped scoring — NO randomness
  let score: number;
  if (found.length <= 2) {
    score = 5;
  } else if (found.length <= 5) {
    score = 15;
  } else {
    score = 30;
  }

  return {
    found,
    missing,
    matchCount: found.length,
    totalKeywords: ATS_KEYWORDS.length,
    score,
  };
}
