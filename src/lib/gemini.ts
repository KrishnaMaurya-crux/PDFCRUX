/**
 * Shared Gemini AI Engine for PdfCrux
 *
 * Central utility for all Gemini API interactions across PdfCrux AI tools.
 * Uses the official @google/generative-ai SDK.
 *
 * Model: process.env.GEMINI_MODEL_NAME (default: gemini-3.0-flash)
 * API Key: process.env.GEMINI_API_KEY
 *
 * Two calling modes:
 *  1. callGeminiWithPdf() — Sends PDF file buffer directly via inlineData
 *  2. callGemini()        — Text-only prompt → Gemini (fallback)
 *
 * Each tool has its own SYSTEM_PROMPT defined here.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL_NAME || "gemini-3.0-flash";

const GEMINI_TIMEOUT_MS = 120_000; // 120 seconds for PDF analysis
const TEXT_TIMEOUT_MS = 90_000; // 90 seconds for text-only analysis

// Maximum PDF size: 20 MB
const MAX_PDF_SIZE = 20 * 1024 * 1024;

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiter — prevents hitting free-tier limits
// Ensures at least RATE_LIMIT_DELAY_MS between consecutive API calls.
// TODO: Remove entire rate limiter when paid billing is enabled.
// ─────────────────────────────────────────────────────────────────────────────

const RATE_LIMIT_DELAY_MS = 3000;
let lastApiCallTime = 0;

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastApiCallTime;
  if (elapsed < RATE_LIMIT_DELAY_MS && lastApiCallTime > 0) {
    const waitTime = RATE_LIMIT_DELAY_MS - elapsed;
    console.log(`[Gemini] Rate limit: waiting ${waitTime}ms before next API call...`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
  lastApiCallTime = Date.now();
}

// ─────────────────────────────────────────────────────────────────────────────
// SDK Singleton — lazily initialized, reused across calls
// ─────────────────────────────────────────────────────────────────────────────

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Set it in your environment variables.",
    );
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  }
  return genAI;
}

// ─────────────────────────────────────────────────────────────────────────────
// System Prompts — One per tool
// ─────────────────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPTS = {
  summarize: `You are an expert document summarizer for PdfCrux. Your job is to analyze the provided PDF document and create a Professional Executive Summary.

RULES:
1. Read the entire PDF carefully — extract all text content.
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

  notes: `You are an expert study notes creator for PdfCrux. Your job is to analyze the provided PDF document and convert it into well-structured, exam-ready Study Notes.

RULES:
1. Read the entire PDF carefully — extract all text content.
2. Analyze the document structure and identify logical sections/topics.
3. Create clear, descriptive headings for each section.
4. Under each heading, extract 3-5 key bullet points.
5. Each bullet should be a complete, self-contained fact or concept.
6. Prioritize definitions, formulas, key concepts, important dates/names, and conclusions.
7. Maintain the original reading order.
8. If no clear sections exist, create logical groupings.
9. Use simple, clear language suitable for revision.

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

  ocr: `You are an expert document analyzer for PdfCrux. Analyze the provided PDF document and extract ALL text content with precise layout structure.

CRITICAL RULES:
1. Extract EVERY word from the PDF — nothing should be missed.
2. Identify document structure: headings (by font size), paragraphs, tables, lists.
3. For tables: extract column headers and ALL row data as 2D arrays.
4. Detect bold text.
5. Maintain reading order: top-to-bottom, left-to-right.
6. Output language MUST match the document's language.
7. Do NOT describe images/photos — only extract text content.
8. For numbered lists (1., 2., 3. etc), use "numbered_list" type.
9. Return ALL pages. Do not skip any page.

Return ONLY valid JSON — no markdown fences, no explanation:
{
  "pages": [
    {
      "page": 1,
      "elements": [
        {"type": "heading1", "text": "Document Title"},
        {"type": "paragraph", "text": "Introduction text.", "bold": false},
        {"type": "heading2", "text": "Section Title"},
        {"type": "bullet_list", "items": ["Point one", "Point two"]},
        {"type": "table", "headers": ["Column A", "Column B"], "rows": [["val1", "val2"]]},
        {"type": "paragraph", "text": "More content here..."}
      ]
    }
  ]
}`,

  resume: `You are an expert ATS (Applicant Tracking System) analyst for PdfCrux. You analyze resume PDFs (and optionally a job description) and provide detailed scoring.

SCORING BREAKDOWN (Total: 0-100):
- Section Score (0-40): Presence of key resume sections (Summary, Skills, Experience, Education, Projects, Certifications, etc.)
- Keyword Score (0-30): Match between resume keywords and job description requirements
- Structure Score (0-20): Formatting quality (bullet points, clear headings, proper length, readability)
- Length Score (0-10): Appropriate word count (ideally 400-800 words for 1 page, up to 1200 for 2 pages)

RULES:
1. Thoroughly analyze the entire resume PDF.
2. If a job description is provided, compare the resume against it.
3. Score each category independently.
4. List specific keywords found and missing.
5. Provide 3-5 strengths, 3-5 weaknesses, and 5-8 actionable suggestions.
6. Grade: A+ (90+), A (80-89), B (70-79), C (60-69), D (50-59), F (<50)
7. Be honest but constructive — the goal is to help the candidate improve.

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

export interface GeminiPdfOptions {
  /** The tool type determines which system prompt to use */
  tool: GeminiToolType;
  /** PDF file buffer (ArrayBuffer) */
  pdfBuffer: ArrayBuffer;
  /** Original file name */
  fileName?: string;
  /** Optional: additional text context (e.g., job description for resume checker) */
  extraContext?: string;
}

export interface GeminiTextOptions {
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
// Core: Send PDF directly to Gemini via inlineData (official SDK)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a PDF file directly to Gemini via the official SDK.
 * Uses inlineData — Gemini natively reads PDF files. NO image conversion needed.
 */
export async function callGeminiWithPdf<T = unknown>(
  options: GeminiPdfOptions,
): Promise<GeminiResponse<T>> {
  try {
    // Validate PDF size
    if (options.pdfBuffer.byteLength > MAX_PDF_SIZE) {
      const sizeMB = (options.pdfBuffer.byteLength / 1024 / 1024).toFixed(1);
      return {
        success: false,
        error: `PDF is too large (${sizeMB} MB). Maximum 20 MB supported.`,
      };
    }

    const systemPrompt = SYSTEM_PROMPTS[options.tool];

    // Build user message text
    let userText: string;
    if (options.tool === "resume" && options.extraContext) {
      userText = `Analyze the resume PDF below. Also consider this JOB DESCRIPTION for keyword matching:\n\n${options.extraContext}`;
    } else if (options.tool === "ocr" && options.extraContext) {
      userText = `Analyze the PDF document below. The document language is: ${options.extraContext}. Extract ALL text and structure from every page.`;
    } else {
      userText =
        "Analyze the PDF document below and follow the instructions in your system prompt.";
    }

    // Rate limit: wait before making the API call
    await waitForRateLimit();

    // Initialize SDK and get model
    const ai = getGenAI();
    const model = ai.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });

    // Convert PDF buffer to base64
    const base64 = Buffer.from(options.pdfBuffer).toString("base64");

    // Send PDF with text prompt
    const result = await Promise.race([
      model.generateContent([
        { text: userText },
        {
          inlineData: {
            mimeType: "application/pdf",
            data: base64,
          },
        },
      ]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT")), GEMINI_TIMEOUT_MS),
      ),
    ]);

    const response = result.response;
    const rawContent = response.text();

    if (!rawContent) {
      return {
        success: false,
        error: "AI returned an empty response. Please try again.",
      };
    }

    // Parse JSON from response
    const data = extractJson<T>(rawContent);
    return { success: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return handleApiError(options.tool, msg);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: Call Gemini Text API (text-only, no files)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a text analysis request to Gemini via the official SDK.
 * Used as fallback when PDF buffer is not available.
 */
export async function callGemini<T = unknown>(
  options: GeminiTextOptions,
): Promise<GeminiResponse<T>> {
  try {
    const systemPrompt = SYSTEM_PROMPTS[options.tool];

    let userMessage = "";
    if (options.tool === "resume" && options.extraContext) {
      userMessage = `RESUME TEXT:\n${options.text}\n\n---\n\nJOB DESCRIPTION:\n${options.extraContext}`;
    } else {
      userMessage = options.text;
    }

    // Truncate if too long
    const MAX_CHARS = 100_000;
    const truncatedMessage =
      userMessage.length > MAX_CHARS
        ? userMessage.slice(0, MAX_CHARS) +
          "\n\n[... Document truncated due to length. Analyze the above content.]"
        : userMessage;

    // Rate limit: wait before making the API call
    await waitForRateLimit();

    // Initialize SDK and get model
    const ai = getGenAI();
    const model = ai.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });

    const result = await Promise.race([
      model.generateContent(truncatedMessage),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT")), TEXT_TIMEOUT_MS),
      ),
    ]);

    const response = result.response;
    const rawContent = response.text();

    if (!rawContent) {
      return {
        success: false,
        error: "AI returned an empty response. Please try again.",
      };
    }

    const data = extractJson<T>(rawContent);
    return { success: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return handleApiError(options.tool, msg);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Handler — logs clearly, never crashes
// ─────────────────────────────────────────────────────────────────────────────

function handleApiError(
  tool: string,
  msg: string,
): GeminiResponse<never> {
  // Timeout
  if (msg === "TIMEOUT" || msg.includes("abort")) {
    return {
      success: false,
      error:
        "AI processing timed out. The document may be too large or complex. Try a smaller PDF.",
    };
  }

  // Missing API key
  if (
    msg.toLowerCase().includes("api_key") ||
    msg.toLowerCase().includes("not configured") ||
    msg.toLowerCase().includes("api key")
  ) {
    return {
      success: false,
      error:
        "AI service not configured. Please set the GEMINI_API_KEY environment variable.",
    };
  }

  // Zero quota — specific helpful message
  if (msg.includes("quota") || msg.includes("429")) {
    if (msg.includes("limit: 0") || msg.includes("ZERO_RESULTS")) {
      console.error(
        `[Gemini:${tool}] API key has zero quota. Generate a fresh key at aistudio.google.com`,
      );
      return {
        success: false,
        error:
          "Your API key has zero quota. Generate a fresh key at aistudio.google.com → paste in GEMINI_API_KEY.",
      };
    }
    console.error(`[Gemini:${tool}] Rate limit hit: ${msg}`);
    return {
      success: false,
      error:
        "AI rate limit reached (too many requests). Wait 60 seconds and try again.",
    };
  }

  // Invalid model
  if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("does not exist")) {
    console.error(
      `[Gemini:${tool}] Model "${GEMINI_MODEL}" not found. Check GEMINI_MODEL_NAME env var. Error: ${msg}`,
    );
    return {
      success: false,
      error: `AI model "${GEMINI_MODEL}" is not available. Check your GEMINI_MODEL_NAME setting.`,
    };
  }

  // Generic error — log it, don't crash
  console.error(`[Gemini:${tool}] API call failed:`, msg);
  return {
    success: false,
    error: "AI service request failed. Please try again.",
  };
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
