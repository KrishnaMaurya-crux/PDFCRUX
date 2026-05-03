/**
 * PDF Notes Tool — Section Processor
 *
 * Splits cleaned text into logical sections based on document structure:
 * - Detects headings from formatting patterns
 * - Groups content under headings
 * - Falls back to paragraph-based chunking when no structure found
 *
 * HEADING DETECTION RULES:
 *   1. ALL CAPS lines (3+ chars, at least one letter)
 *   2. Lines ending with ":" (definition/list headers)
 *   3. Short lines (< 80 chars) not ending with sentence punctuation
 *   4. Numbered patterns: "1.", "Chapter 3:", "Section 2", etc.
 *   5. Lines that look like titles (mixed case, short, centered-feel)
 */

import type { CleanedText } from "./text-cleaner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawSection {
  /** Detected or generated heading */
  heading: string;
  /** All text lines belonging to this section */
  lines: string[];
  /** Whether this heading was auto-detected vs. generated */
  headingDetected: boolean;
}

export interface ProcessedSections {
  /** All detected sections */
  sections: RawSection[];
  /** Total lines processed */
  totalLines: number;
  /** Number of headings auto-detected */
  headingsDetected: number;
}

// ---------------------------------------------------------------------------
// Heading Detection Patterns
// ---------------------------------------------------------------------------

/** Numbered heading patterns: "1.", "1.1", "Chapter 3:", "Section 2", "Part I" */
const NUMBERED_HEADING_RE =
  /^(?:chapter|section|part|unit|module)\s+[\dIVX]+[.:)]?\s*/i;

/** Roman numeral heading: "I.", "II.", "III." */
const ROMAN_RE = /^\s*[IVX]+\.\s+[A-Z]/;

/** Numbered list heading: "1.", "2.", "1.1", etc. */
const NUMBER_DOT_RE = /^\s*\d+(\.\d+)*\.\s+[A-Z]/;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Process cleaned text into structured sections.
 *
 * @param cleaned - The `CleanedText` from the text-cleaner module.
 * @param maxSections - Maximum number of sections to create (default: 15).
 * @returns A `ProcessedSections` with heading-grouped content.
 */
export function processSections(
  cleaned: CleanedText,
  maxSections = 15
): ProcessedSections {
  const { lines } = cleaned;
  const totalLines = lines.length;

  if (totalLines === 0) {
    return {
      sections: [],
      totalLines: 0,
      headingsDetected: 0,
    };
  }

  // ── Phase 1: Detect headings and build sections ──
  const sections: RawSection[] = [];
  let currentSection: RawSection | null = null;
  let headingsDetected = 0;

  for (const line of lines) {
    if (line.trim() === "") {
      // Blank line — skip, serves as natural separator
      continue;
    }

    if (isHeading(line)) {
      const heading = formatHeading(line);
      currentSection = {
        heading,
        lines: [],
        headingDetected: true,
      };
      sections.push(currentSection);
      headingsDetected++;
    } else if (currentSection) {
      currentSection.lines.push(line);
    } else {
      // No heading seen yet — start with "Introduction"
      currentSection = {
        heading: "Introduction",
        lines: [line],
        headingDetected: false,
      };
      sections.push(currentSection);
    }
  }

  // ── Phase 2: Fallback if no headings detected ──
  if (sections.length === 0 || (sections.length === 1 && !sections[0].headingDetected && sections[0].heading === "Introduction")) {
    return buildParagraphSections(lines, maxSections);
  }

  // ── Phase 3: Merge very short sections into neighbors ──
  const merged = mergeShortSections(sections);

  // ── Phase 4: Limit total sections ──
  const limited = merged.length > maxSections
    ? consolidateSections(merged, maxSections)
    : merged;

  // ── Phase 5: Assign sequential numbers to detected headings ──
  let sectionCounter = 0;
  for (const sec of limited) {
    sectionCounter++;
    if (sec.headingDetected) {
      // Keep detected heading as-is
    } else if (limited.length > 1) {
      sec.heading = `Section ${sectionCounter}`;
    }
  }

  return {
    sections: limited,
    totalLines,
    headingsDetected,
  };
}

// ---------------------------------------------------------------------------
// Heading Detection
// ---------------------------------------------------------------------------

/**
 * Determine if a line qualifies as a section heading.
 */
function isHeading(line: string): boolean {
  const trimmed = line.trim();

  // Must have minimum length
  if (trimmed.length < 3) return false;

  // Skip if it's a complete sentence (likely body text)
  if (/^[A-Z]/.test(trimmed) && /[.!?]$/.test(trimmed) && trimmed.length > 60) {
    return false;
  }

  // 1. ALL CAPS (at least 3 chars, with at least 2 letters)
  if (
    trimmed.length >= 3 &&
    trimmed === trimmed.toUpperCase() &&
    (trimmed.match(/[A-Z]/g) ?? []).length >= 2
  ) {
    return true;
  }

  // 2. Ends with colon (list/definition header)
  if (trimmed.endsWith(":") && trimmed.length <= 100) {
    return true;
  }

  // 3. Numbered heading patterns
  if (NUMBERED_HEADING_RE.test(trimmed) && trimmed.length <= 100) {
    return true;
  }
  if (ROMAN_RE.test(trimmed) && trimmed.length <= 80) {
    return true;
  }
  if (NUMBER_DOT_RE.test(trimmed) && trimmed.length <= 80) {
    return true;
  }

  // 4. Short line without sentence-ending punctuation
  if (
    trimmed.length < 80 &&
    !/[.!?]$/.test(trimmed) &&
    /^[A-Z]/.test(trimmed) &&
    trimmed.split(/\s+/).length <= 12
  ) {
    return true;
  }

  // 5. Title-like: starts with uppercase, contains no lowercase after first word,
  //    and is reasonably short
  if (
    trimmed.length >= 4 &&
    trimmed.length <= 60 &&
    /^[A-Z]/.test(trimmed) &&
    !/[.!?;:]$/.test(trimmed) &&
    trimmed.split(/\s+/).length <= 8
  ) {
    // Check if most words start with uppercase (title case)
    const words = trimmed.split(/\s+/);
    const uppercaseWords = words.filter(
      (w) => /^[A-Z]/.test(w) || w.length <= 2
    ).length;
    if (uppercaseWords / words.length >= 0.6) {
      return true;
    }
  }

  return false;
}

/**
 * Clean a detected heading for display.
 */
function formatHeading(raw: string): string {
  let heading = raw.trim();

  // Remove trailing colon
  heading = heading.replace(/[:.]$/, "").trim();

  // Remove leading numbering if it's very generic (keep for "Chapter 3" style)
  if (/^\d+\.$/.test(heading) || /^\d+\.\d+$/.test(heading)) {
    return `Section ${heading.replace(".", "")}`;
  }

  return heading;
}

// ---------------------------------------------------------------------------
// Section Building (Fallback)
// ---------------------------------------------------------------------------

/**
 * When no headings are detected, split by paragraph clusters.
 * Groups consecutive paragraphs into meaningful sections.
 */
function buildParagraphSections(
  lines: string[],
  maxSections: number
): ProcessedSections {
  // Group lines into paragraphs (separated by blank lines)
  const paragraphs: string[] = [];
  let currentPara = "";

  for (const line of lines) {
    if (line.trim() === "") {
      if (currentPara.trim()) {
        paragraphs.push(currentPara.trim());
        currentPara = "";
      }
    } else {
      currentPara += (currentPara ? " " : "") + line;
    }
  }
  if (currentPara.trim()) {
    paragraphs.push(currentPara.trim());
  }

  if (paragraphs.length === 0) {
    return { sections: [], totalLines: lines.length, headingsDetected: 0 };
  }

  // Calculate target section size
  const targetSectionCount = Math.min(
    maxSections,
    Math.max(3, Math.ceil(paragraphs.length / 2))
  );
  const paragraphsPerSection = Math.max(
    1,
    Math.ceil(paragraphs.length / targetSectionCount)
  );

  const sections: RawSection[] = [];

  for (let i = 0; i < paragraphs.length; i += paragraphsPerSection) {
    const chunk = paragraphs.slice(i, i + paragraphsPerSection);
    const sectionNum = sections.length + 1;

    // Use first sentence of first paragraph as heading
    const firstSentence = chunk[0]
      ?.split(/[.!?]+/)[0]
      ?.trim() ?? "";

    const heading =
      firstSentence.length > 5 && firstSentence.length <= 80
        ? firstSentence.endsWith(".")
          ? firstSentence.slice(0, -1)
          : firstSentence
        : `Section ${sectionNum}`;

    sections.push({
      heading,
      lines: chunk,
      headingDetected: firstSentence.length > 5,
    });
  }

  return {
    sections,
    totalLines: lines.length,
    headingsDetected: sections.filter((s) => s.headingDetected).length,
  };
}

// ---------------------------------------------------------------------------
// Section Merging & Consolidation
// ---------------------------------------------------------------------------

/**
 * Merge sections with very little content into their neighbors.
 */
function mergeShortSections(sections: RawSection[]): RawSection[] {
  if (sections.length <= 1) return sections;

  const MIN_WORDS = 15;
  const result: RawSection[] = [];

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const wordCount = sec.lines.join(" ").split(/\s+/).filter((w) => w.length > 0).length;

    // If this section is too short and not the first/last, merge with previous
    if (
      wordCount < MIN_WORDS &&
      result.length > 0 &&
      i < sections.length - 1
    ) {
      // Merge into previous section
      const prev = result[result.length - 1];
      prev.lines.push(...sec.lines);
    } else {
      // Keep as-is (or clone to avoid mutation)
      result.push({ ...sec, lines: [...sec.lines] });
    }
  }

  return result;
}

/**
 * Consolidate many sections into fewer by merging adjacent ones.
 */
function consolidateSections(
  sections: RawSection[],
  target: number
): RawSection[] {
  if (sections.length <= target) return sections;

  const mergeRatio = Math.ceil(sections.length / target);
  const result: RawSection[] = [];

  for (let i = 0; i < sections.length; i += mergeRatio) {
    const chunk = sections.slice(i, i + mergeRatio);
    if (chunk.length === 0) continue;

    // Use the first detected heading, or generate one
    const firstDetected = chunk.find((s) => s.headingDetected);
    const heading = firstDetected
      ? firstDetected.heading
      : `Section ${result.length + 1}`;

    const allLines = chunk.flatMap((s) => s.lines);

    result.push({
      heading,
      lines: allLines,
      headingDetected: !!firstDetected,
    });
  }

  return result;
}
