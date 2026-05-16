/**
 * Shared Gemini AI Engine for PdfCrux
 *
 * Central utility for all Gemini API interactions across PdfCrux AI tools.
 * Uses the Google Gemini REST API directly via fetch() — ZERO external dependencies.
 *
 * Configuration (via environment variables):
 *   GEMINI_API_KEY    — Your Google AI Studio API key
 *   GEMINI_MODEL_NAME — Model to use (default: gemini-2.0-flash)
 *
 * Flow:
 *   callGeminiWithPdf() → Converts PDF to images server-side → Sends images to Gemini
 *   callGemini()        → Text-only prompt → Gemini (no files)
 *
 * Each tool has its own SYSTEM_PROMPT defined here.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Configuration — reads from environment variables
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL_NAME || "gemini-2.0-flash";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_TIMEOUT_MS = 120_000; // 120 seconds for PDF analysis
const TEXT_TIMEOUT_MS = 90_000; // 90 seconds for text-only analysis

// Maximum PDF size: 20 MB
const MAX_PDF_SIZE = 20 * 1024 * 1024;

// Max images per request (to avoid token limits)
const MAX_IMAGES_PER_REQUEST = 5;

// ─────────────────────────────────────────────────────────────────────────────
// System Prompts — One per tool
// ─────────────────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPTS = {
  summarize: `You are an expert document summarizer for PdfCrux. Your job is to analyze the provided document images and create a Professional Executive Summary.

RULES:
1. Read all pages carefully — extract all text content from the images.
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

  notes: `You are an expert study notes creator for PdfCrux. Your job is to analyze the provided document images and convert them into well-structured, exam-ready Study Notes.

RULES:
1. Read all pages carefully — extract all text content from the images.
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

  ocr: `You are an expert document analyzer for PdfCrux. Analyze the provided document images and extract ALL text content with precise layout structure.

CRITICAL RULES:
1. Extract EVERY word from the images — nothing should be missed.
2. Identify document structure: headings (by font size), paragraphs, tables, lists.
3. For tables: extract column headers and ALL row data as 2D arrays.
4. Detect bold text visually.
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

  resume: `You are an expert ATS (Applicant Tracking System) analyst for PdfCrux. You analyze resume images (and optionally a job description) and provide detailed scoring.

SCORING BREAKDOWN (Total: 0-100):
- Section Score (0-40): Presence of key resume sections (Summary, Skills, Experience, Education, Projects, Certifications, etc.)
- Keyword Score (0-30): Match between resume keywords and job description requirements
- Structure Score (0-20): Formatting quality (bullet points, clear headings, proper length, readability)
- Length Score (0-10): Appropriate word count (ideally 400-800 words for 1 page, up to 1200 for 2 pages)

RULES:
1. Thoroughly analyze ALL resume page images.
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
  tool: GeminiToolType;
  pdfBuffer: ArrayBuffer;
  fileName?: string;
  extraContext?: string;
}

export interface GeminiTextOptions {
  tool: GeminiToolType;
  text: string;
  extraContext?: string;
}

export interface GeminiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemini REST API — Direct fetch(), ZERO dependencies
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call the Gemini REST API with the given contents (multimodal parts).
 * Uses fetch() directly — no SDK needed.
 */
async function callGeminiRestApi(
  systemPrompt: string,
  parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>,
  timeoutMs: number
): Promise<string> {
  const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  };

  const response = await Promise.race([
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs)
    ),
  ]);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMsg =
      errorData?.error?.message || `HTTP ${response.status}`;
    throw new Error(errorMsg);
  }

  const data = await response.json();

  // Extract text from Gemini response: data.candidates[0].content.parts[0].text
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (!text) {
    const blockReason = data?.candidates?.[0]?.finishReason;
    if (blockReason === "SAFETY") {
      throw new Error("Content was blocked by safety filters. Try a different document.");
    }
    throw new Error("AI returned an empty response.");
  }

  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF to Images conversion (server-side using pdfjs-dist)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a PDF buffer into an array of base64 JPEG data URIs.
 * Uses pdfjs-dist for rendering on the server.
 */
export async function pdfToImageUris(
  pdfBuffer: ArrayBuffer
): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useWorkerFetch: false,
  }).promise;

  const uris: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const scale = 1.5;
    const viewport = page.getViewport({ scale });
    const canvas = await page.render({ viewport }).promise;
    const jpegDataUri = canvas.toDataURL("image/jpeg", 0.85);
    uris.push(jpegDataUri);
    canvas.width = 0;
    canvas.height = 0;
  }

  return uris;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: Send images to Gemini Vision
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send image data URIs to Gemini Vision API.
 * If more than MAX_IMAGES_PER_REQUEST images, they are batched.
 */
async function callVisionWithImages(
  systemPrompt: string,
  userText: string,
  imageUris: string[],
  timeoutMs: number
): Promise<string> {
  // Split into batches if needed
  const batches: string[][] = [];
  for (let i = 0; i < imageUris.length; i += MAX_IMAGES_PER_REQUEST) {
    batches.push(imageUris.slice(i, i + MAX_IMAGES_PER_REQUEST));
  }

  let fullResponse = "";

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const isFirstBatch = b === 0;

    // Build parts: text prompt + images
    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [];

    if (isFirstBatch) {
      parts.push({ text: userText });
    } else {
      parts.push({ text: "Continue extracting content from the next pages. Follow the same format as before." });
    }

    for (const uri of batch) {
      // Extract base64 data from data URI
      const matches = uri.match(/^data:(image\/\w+);base64,(.+)$/);
      if (matches) {
        parts.push({
          inlineData: {
            mimeType: matches[1],
            data: matches[2],
          },
        });
      }
    }

    const batchResponse = await callGeminiRestApi(
      systemPrompt,
      parts,
      timeoutMs
    );

    fullResponse += batchResponse;
  }

  return fullResponse;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API: callGeminiWithPdf
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a PDF to Gemini by first converting it to images server-side.
 * This is the main entry point for all PDF-based AI tools.
 */
export async function callGeminiWithPdf<T = unknown>(
  options: GeminiPdfOptions
): Promise<GeminiResponse<T>> {
  try {
    // Validate API key early
    if (!GEMINI_API_KEY) {
      return {
        success: false,
        error: "AI service not configured. Please set the GEMINI_API_KEY.",
      };
    }

    // Validate PDF size
    if (options.pdfBuffer.byteLength > MAX_PDF_SIZE) {
      const sizeMB = (options.pdfBuffer.byteLength / 1024 / 1024).toFixed(1);
      return {
        success: false,
        error: `PDF is too large (${sizeMB} MB). Maximum 20 MB supported.`,
      };
    }

    const systemPrompt = SYSTEM_PROMPTS[options.tool];

    // Build user message with optional extra context
    let userText: string;
    if (options.tool === "resume" && options.extraContext) {
      userText = `Analyze the resume pages below. Also consider this JOB DESCRIPTION for keyword matching:\n\n${options.extraContext}`;
    } else if (options.tool === "ocr" && options.extraContext) {
      userText = `Analyze the document pages below. The document language is: ${options.extraContext}. Extract ALL text and structure from every page.`;
    } else {
      userText = "Analyze the document pages below and follow the instructions in your system prompt.";
    }

    // Convert PDF to images
    const imageUris = await pdfToImageUris(options.pdfBuffer);

    if (imageUris.length === 0) {
      return {
        success: false,
        error: "Could not render any pages from the PDF. The file may be corrupted.",
      };
    }

    // Call Gemini Vision with images
    const rawContent = await callVisionWithImages(
      systemPrompt,
      userText,
      imageUris,
      GEMINI_TIMEOUT_MS
    );

    // Parse JSON from response
    const data = extractJson<T>(rawContent);
    return { success: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg === "TIMEOUT") {
      return {
        success: false,
        error: "AI processing timed out. The document may be too large. Try a smaller PDF.",
      };
    }

    if (
      msg.toLowerCase().includes("api key") ||
      msg.toLowerCase().includes("not configured") ||
      msg.toLowerCase().includes("unauthorized") ||
      msg.toLowerCase().includes("invalid api key") ||
      msg.toLowerCase().includes("api_key") ||
      msg.toLowerCase().includes("401") ||
      msg.toLowerCase().includes("403")
    ) {
      return {
        success: false,
        error: "AI service not configured. Please set a valid GEMINI_API_KEY.",
      };
    }

    if (
      msg.toLowerCase().includes("rate limit") ||
      msg.toLowerCase().includes("quota") ||
      msg.toLowerCase().includes("resource_exhausted") ||
      msg.toLowerCase().includes("429")
    ) {
      return {
        success: false,
        error: "AI rate limit reached. Please wait a moment and try again.",
      };
    }

    console.error(`[Gemini:${options.tool}] PDF API call failed:`, msg);
    return {
      success: false,
      error: "AI service request failed. Please try again.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API: callGemini (text-only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a text analysis request to Gemini.
 * Used as fallback when PDF buffer is not available.
 */
export async function callGemini<T = unknown>(
  options: GeminiTextOptions
): Promise<GeminiResponse<T>> {
  try {
    if (!GEMINI_API_KEY) {
      return {
        success: false,
        error: "AI service not configured. Please set the GEMINI_API_KEY.",
      };
    }

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

    const rawContent = await callGeminiRestApi(
      systemPrompt,
      [{ text: truncatedMessage }],
      TEXT_TIMEOUT_MS
    );

    if (!rawContent) {
      return {
        success: false,
        error: "AI returned an unexpected response format.",
      };
    }

    const data = extractJson<T>(rawContent);
    return { success: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg === "TIMEOUT") {
      return {
        success: false,
        error: "AI processing timed out. The document may be too complex. Please try again.",
      };
    }

    if (
      msg.toLowerCase().includes("api key") ||
      msg.toLowerCase().includes("not configured") ||
      msg.toLowerCase().includes("unauthorized")
    ) {
      return {
        success: false,
        error: "AI service not configured. Please set the GEMINI_API_KEY.",
      };
    }

    console.error(`[Gemini:${options.tool}] Text API call failed:`, msg);
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
 * Get the configured model name (for display purposes).
 */
export function getModelName(): string {
  return GEMINI_MODEL_NAME;
}
