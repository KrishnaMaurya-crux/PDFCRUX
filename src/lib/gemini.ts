/**
 * Shared Gemini AI Engine
 *
 * Central utility for all Gemini API interactions across PdfCrux AI tools.
 * Uses z-ai-web-dev-sdk for API calls with gemini-2.0-flash model.
 *
 * Each tool has its own SYSTEM_PROMPT defined here.
 */

import ZAI from "z-ai-web-dev-sdk";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_TIMEOUT_MS = 90_000; // 90 seconds for text analysis

// ─────────────────────────────────────────────────────────────────────────────
// System Prompts — One per tool
// ─────────────────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPTS = {
  summarize: `You are an expert document summarizer for PdfCrux. Your job is to analyze the provided PDF text and create a Professional Executive Summary.

RULES:
1. Read the entire text carefully.
2. Identify the main topic, key arguments, conclusions, and supporting evidence.
3. Generate 7-12 bullet points that capture the essence of the document.
4. Each bullet should be concise (1-2 sentences), informative, and stand alone.
5. Prioritize: thesis/main point → key findings → supporting evidence → conclusions.
6. Use professional language.
7. If the document has a clear title, use it. Otherwise derive one from the content.

Return ONLY valid JSON — no markdown fences, no explanation:
{
  "title": "Document Title",
  "bulletPoints": ["First key point.", "Second key point.", "..."],
  "wordCount": 0,
  "readingTime": "X min read"
}`,

  notes: `You are an expert study notes creator for PdfCrux. Your job is to convert the provided PDF text into well-structured, exam-ready Study Notes.

RULES:
1. Analyze the document structure and identify logical sections/topics.
2. Create clear, descriptive headings for each section.
3. Under each heading, extract 3-5 key bullet points.
4. Each bullet should be a complete, self-contained fact or concept.
5. Prioritize definitions, formulas, key concepts, important dates/names, and conclusions.
6. Maintain the original reading order.
7. If no clear sections exist, create logical groupings.
8. Use simple, clear language suitable for revision.

Return ONLY valid JSON — no markdown fences, no explanation:
{
  "title": "Document Title",
  "sections": [
    {
      "heading": "Section Heading",
      "content": ["Key point 1.", "Key point 2.", "Key point 3."]
    }
  ],
  "totalSections": 0,
  "wordCount": 0
}`,

  resume: `You are an expert ATS (Applicant Tracking System) analyst for PdfCrux. You compare resumes against job descriptions and provide detailed scoring.

SCORING BREAKDOWN (Total: 0-100):
- Section Score (0-40): Presence of key resume sections (Summary, Skills, Experience, Education, Projects, Certifications, etc.)
- Keyword Score (0-30): Match between resume keywords and job description requirements
- Structure Score (0-20): Formatting quality (bullet points, clear headings, proper length, readability)
- Length Score (0-10): Appropriate word count (ideally 400-800 words for 1 page, up to 1200 for 2 pages)

RULES:
1. Thoroughly analyze BOTH the resume text AND the job description.
2. Score each category independently.
3. List specific keywords found and missing.
4. Provide 3-5 strengths, 3-5 weaknesses, and 5-8 actionable suggestions.
5. Grade: A+ (90+), A (80-89), B (70-79), C (60-69), D (50-59), F (<50)
6. Be honest but constructive — the goal is to help the candidate improve.

Return ONLY valid JSON — no markdown fences, no explanation:
{
  "atsScore": 0,
  "grade": "A",
  "sections": [
    {"name": "Summary", "found": true},
    {"name": "Skills", "found": true},
    {"name": "Experience", "found": false},
    {"name": "Education", "found": true},
    {"name": "Projects", "found": false},
    {"name": "Certifications", "found": false},
    {"name": "Languages", "found": false},
    {"name": "Achievements", "found": false}
  ],
  "keywordsFound": ["keyword1", "keyword2"],
  "keywordsMissing": ["keyword3", "keyword4"],
  "strengths": ["Strength 1.", "Strength 2."],
  "weaknesses": ["Weakness 1.", "Weakness 2."],
  "suggestions": ["Suggestion 1.", "Suggestion 2."],
  "stats": {
    "totalWords": 0,
    "pageCount": 1
  },
  "scoreBreakdown": {
    "sectionScore": 0,
    "keywordScore": 0,
    "structureScore": 0,
    "lengthScore": 0
  }
}`,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type GeminiToolType = keyof typeof SYSTEM_PROMPTS;

export interface GeminiRequestOptions {
  /** The tool type determines which system prompt to use */
  tool: GeminiToolType;
  /** The text content to analyze */
  text: string;
  /** Optional: additional context (e.g., job description for resume checker) */
  extraContext?: string;
}

export interface GeminiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: Call Gemini API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a text analysis request to Gemini via z-ai-web-dev-sdk.
 * Uses the specified tool's system prompt.
 */
export async function callGemini<T = unknown>(
  options: GeminiRequestOptions
): Promise<GeminiResponse<T>> {
  try {
    const zai = await ZAI.create();

    const systemPrompt = SYSTEM_PROMPTS[options.tool];

    // Build user message
    let userMessage = "";
    if (options.tool === "resume" && options.extraContext) {
      userMessage = `RESUME TEXT:\n${options.text}\n\n---\n\nJOB DESCRIPTION:\n${options.extraContext}`;
    } else {
      userMessage = options.text;
    }

    // Truncate if too long (Gemini Flash handles ~1M tokens, but let's be safe)
    const MAX_CHARS = 100_000;
    const truncatedMessage =
      userMessage.length > MAX_CHARS
        ? userMessage.slice(0, MAX_CHARS) +
          "\n\n[... Document truncated due to length. Analyze the above content.]"
        : userMessage;

    const completion = await Promise.race([
      zai.chat.completions.create({
        model: GEMINI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: truncatedMessage },
        ],
        stream: false,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT")), GEMINI_TIMEOUT_MS)
      ),
    ]);

    const rawContent =
      completion?.choices?.[0]?.message?.content ??
      completion?.content ??
      "";

    if (!rawContent || typeof rawContent !== "string") {
      return {
        success: false,
        error: "AI returned an unexpected response format.",
      };
    }

    // Parse JSON from response
    const data = extractJson<T>(rawContent);
    return { success: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg === "TIMEOUT") {
      return {
        success: false,
        error:
          "AI processing timed out. The document may be too complex. Please try again.",
      };
    }

    if (
      msg.toLowerCase().includes("api key") ||
      msg.toLowerCase().includes("not configured")
    ) {
      return {
        success: false,
        error: "AI service not configured. Please set the GEMINI_API_KEY.",
      };
    }

    console.error(`[Gemini:${options.tool}] API call failed:`, msg);
    return {
      success: false,
      error: "AI service request failed. Please try again.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract valid JSON from Gemini's response.
 * Handles markdown fences, leading/trailing whitespace, etc.
 */
export function extractJson<T = unknown>(raw: string): T {
  let text = raw.trim();

  // Strip markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Try direct parse
  try {
    return JSON.parse(text) as T;
  } catch {
    // Try finding the first { and last }
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = text.substring(firstBrace, lastBrace + 1);
      return JSON.parse(candidate) as T;
    }

    throw new Error("Could not find valid JSON in response");
  }
}

/**
 * Extract text from a PDF File using pdfjs-dist (server-side).
 */
export async function extractTextFromPDF(file: File | Blob): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");

  // Server-side: use the worker from node_modules
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "pdfjs-dist/build/pdf.worker.min.mjs";

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
      .filter((item): item is { str: string } => "str" in item)
      .map((item) => item.str)
      .join(" ");

    pageTexts.push(pageText);
  }

  return pageTexts.join("\n\n");
}
