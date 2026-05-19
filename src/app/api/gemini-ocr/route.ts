import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Force Node.js runtime — required for Buffer operations
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GeminiElement {
  type:
    | "heading1"
    | "heading2"
    | "heading3"
    | "paragraph"
    | "bullet_list"
    | "numbered_list"
    | "table";
  text?: string;
  bold?: boolean;
  items?: string[];
  headers?: string[];
  rows?: string[][];
}

interface GeminiPage {
  page: number;
  elements: GeminiElement[];
}

interface GeminiOcrResponse {
  success: boolean;
  pages: GeminiPage[];
  batchIndex: number;
  totalBatches: number;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_TOTAL_SIZE = 20 * 1024 * 1024;
const GEMINI_TIMEOUT_MS = 60_000;

// Read model and API key from environment
// Primary: process.env.GEMINI_MODEL_NAME (default: gemini-3-flash-preview)
// Fallback: gemini-2.5-flash (auto-retry if primary not found)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL_PRIMARY = process.env.GEMINI_MODEL_NAME || "gemini-3-flash-preview";
const GEMINI_MODEL_FALLBACK = "gemini-2.5-flash";

// Rate limit: 3 second delay between API requests (free-tier safety)
// TODO: Remove this when paid billing is enabled
const RATE_LIMIT_DELAY_MS = 3000;
let lastApiCallTime = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiter
// ─────────────────────────────────────────────────────────────────────────────

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastApiCallTime;
  if (elapsed < RATE_LIMIT_DELAY_MS && lastApiCallTime > 0) {
    const waitTime = RATE_LIMIT_DELAY_MS - elapsed;
    console.log(
      `[GeminiOCR] Rate limit: waiting ${waitTime}ms before next API call...`,
    );
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
  lastApiCallTime = Date.now();
}

// ─────────────────────────────────────────────────────────────────────────────
// SDK Singleton
// ─────────────────────────────────────────────────────────────────────────────

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  }
  return genAI;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model Not-Found Detector
// ─────────────────────────────────────────────────────────────────────────────

function isModelNotFoundError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes("not found") ||
    lower.includes("does not exist") ||
    lower.includes("model not available") ||
    lower.includes("model does not support")
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildPrompt(language: string): string {
  return `You are an expert document analyzer for PdfCrux. Analyze the provided PDF page images and extract ALL text content with precise layout structure.

CRITICAL RULES:
1. Extract EVERY word from the images - nothing should be missed.
2. Identify document structure: headings (by font size), paragraphs, tables, lists.
3. For tables: extract column headers and ALL row data as 2D arrays.
4. Detect bold text visually.
5. Maintain reading order: top-to-bottom, left-to-right.
6. Output language MUST match the document's language (${language}).
7. Do NOT describe images/photos - only extract text content.
8. For numbered lists (1., 2., 3. etc), use "numbered_list" type.

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
}`;
}

function extractJson(raw: string): GeminiPage[] {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  try {
    const parsed = JSON.parse(text);
    return parsed.pages;
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(text.substring(firstBrace, lastBrace + 1)).pages;
    }
    throw new Error("Could not find valid JSON in response");
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = Buffer.from(await blob.arrayBuffer());
  return buffer.toString("base64");
}

// ─────────────────────────────────────────────────────────────────────────────
// Route Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── Step 1: Validate API Key ──
    if (!GEMINI_API_KEY) {
      return NextResponse.json<GeminiOcrResponse>(
        {
          success: false,
          pages: [],
          batchIndex: 0,
          totalBatches: 1,
          error: "AI service not configured. Please set GEMINI_API_KEY.",
        },
        { status: 500 },
      );
    }

    // ── Step 2: Parse incoming FormData ──
    const form = await request.formData();
    const imageFiles = form.getAll("images");
    const language = (form.get("language") as string) || "English";
    const batchIndex = Number(form.get("batchIndex")) || 0;
    const totalBatches = Number(form.get("totalBatches")) || 1;

    // ── Step 3: Validate inputs ──
    if (!imageFiles.length) {
      return NextResponse.json<GeminiOcrResponse>(
        {
          success: false,
          pages: [],
          batchIndex,
          totalBatches,
          error: "No images provided. Please upload at least one page.",
        },
        { status: 400 },
      );
    }

    const blobs = imageFiles.filter(
      (f): f is File | Blob => f instanceof Blob,
    );
    if (blobs.length === 0) {
      return NextResponse.json<GeminiOcrResponse>(
        {
          success: false,
          pages: [],
          batchIndex,
          totalBatches,
          error: "Invalid image data. Please upload valid image files.",
        },
        { status: 400 },
      );
    }

    const totalSize = blobs.reduce((sum, b) => sum + b.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      const sizeMB = (totalSize / 1024 / 1024).toFixed(1);
      return NextResponse.json<GeminiOcrResponse>(
        {
          success: false,
          pages: [],
          batchIndex,
          totalBatches,
          error: `Total image size (${sizeMB} MB) exceeds the 20 MB limit. Try fewer pages or lower resolution.`,
        },
        { status: 400 },
      );
    }

    // ── Step 4: Convert images to base64 (sequential, not parallel) ──
    const imageParts: Array<{
      inlineData: { mimeType: string; data: string };
    }> = [];

    for (const blob of blobs) {
      const base64 = await blobToBase64(blob);
      const mime = blob.type || "image/jpeg";
      imageParts.push({ inlineData: { mimeType: mime, data: base64 } });
    }

    // ── Step 5: Call Gemini via official SDK with model fallback ──
    const prompt = buildPrompt(language);
    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [{ text: prompt }, ...imageParts];

    const modelsToTry = [GEMINI_MODEL_PRIMARY, GEMINI_MODEL_FALLBACK];
    let rawResponse: string | null = null;
    let usedModel = "";

    for (const modelName of modelsToTry) {
      try {
        // Rate limit: wait before making the API call
        await waitForRateLimit();

        const ai = getGenAI();
        const model = ai.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 16384,
            responseMimeType: "application/json",
          },
        });

        // Call with timeout
        const result = await Promise.race([
          model.generateContent(parts),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("TIMEOUT")), GEMINI_TIMEOUT_MS),
          ),
        ]);

        rawResponse = result.response.text();
        usedModel = modelName;

        if (!rawResponse) {
          // Empty response → try next model
          console.warn(
            `[GeminiOCR] Model "${modelName}" returned empty response. Trying fallback...`,
          );
          continue;
        }

        // Success!
        console.log(`[GeminiOCR] Success with model: ${modelName}`);
        break;
      } catch (apiErr) {
        const msg =
          apiErr instanceof Error ? apiErr.message : String(apiErr);
        console.error(
          `[GeminiOCR] Model "${modelName}" failed: ${msg}`,
        );

        // If model not found → try fallback
        if (isModelNotFoundError(msg)) {
          console.warn(
            `[GeminiOCR] Model "${modelName}" not available. Trying fallback "${GEMINI_MODEL_FALLBACK}"...`,
          );
          continue;
        }

        // Timeout → return error immediately
        if (msg === "TIMEOUT" || msg.includes("abort")) {
          return NextResponse.json<GeminiOcrResponse>(
            {
              success: false,
              pages: [],
              batchIndex,
              totalBatches,
              error:
                "AI processing timed out. Try splitting into smaller batches.",
            },
            { status: 504 },
          );
        }

        // Quota error → return error immediately
        if (msg.includes("quota") || msg.includes("429")) {
          if (msg.includes("limit: 0")) {
            return NextResponse.json<GeminiOcrResponse>(
              {
                success: false,
                pages: [],
                batchIndex,
                totalBatches,
                error:
                  "Your API key has zero quota. Generate a fresh key at aistudio.google.com.",
              },
              { status: 429 },
            );
          }
          return NextResponse.json<GeminiOcrResponse>(
            {
              success: false,
              pages: [],
              batchIndex,
              totalBatches,
              error:
                "AI rate limit reached. Wait 60 seconds and try again.",
            },
            { status: 429 },
          );
        }

        // Any other error → try fallback
        console.warn(
          `[GeminiOCR] Unexpected error with "${modelName}". Trying fallback...`,
        );
      }
    }

    // If no model worked
    if (!rawResponse) {
      return NextResponse.json<GeminiOcrResponse>(
        {
          success: false,
          pages: [],
          batchIndex,
          totalBatches,
          error: `AI model "${GEMINI_MODEL_PRIMARY}" unavailable and fallback "${GEMINI_MODEL_FALLBACK}" also failed.`,
        },
        { status: 502 },
      );
    }

    // ── Step 6: Parse the JSON response ──
    let pages: GeminiPage[];
    try {
      pages = extractJson(rawResponse);
    } catch (parseErr) {
      console.error("[GeminiOCR] JSON parse failed:", parseErr);
      console.error(
        "[GeminiOCR] Raw response (first 500 chars):",
        rawResponse.substring(0, 500),
      );
      return NextResponse.json<GeminiOcrResponse>(
        {
          success: false,
          pages: [],
          batchIndex,
          totalBatches,
          error: "AI returned an invalid response. Please try again.",
        },
        { status: 502 },
      );
    }

    // ── Step 7: Return success ──
    return NextResponse.json<GeminiOcrResponse>({
      success: true,
      pages,
      batchIndex,
      totalBatches,
    });
  } catch (initErr) {
    // Catch-all: log clearly, never crash
    const msg =
      initErr instanceof Error ? initErr.message : String(initErr);
    console.error("[GeminiOCR] Unhandled error:", msg);

    return NextResponse.json<GeminiOcrResponse>(
      {
        success: false,
        pages: [],
        batchIndex: 0,
        totalBatches: 1,
        error: "An unexpected error occurred. Please try again.",
      },
      { status: 500 },
    );
  }
}
