import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Force Node.js runtime (not Edge) — PDF rendering requires Node.js APIs
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

/** Maximum total size of all images combined (20 MB) */
const MAX_TOTAL_SIZE = 20 * 1024 * 1024;

/** Timeout for Gemini API call (60 seconds) */
const GEMINI_TIMEOUT_MS = 60_000;

/** Model to use — from environment variable with fallback */
const GEMINI_MODEL = process.env.GEMINI_MODEL_NAME || "gemini-2.0-flash";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a File / Blob into a base64 data-URI string suitable for the
 * Gemini inline data payload.
 */
async function blobToBase64Parts(blob: Blob): Promise<{ mimeType: string; data: string }> {
  const buffer = await blob.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const mime = blob.type || "image/jpeg";
  return { mimeType: mime, data: base64 };
}

/**
 * Build the analysis prompt with the target language interpolated.
 */
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

/**
 * Attempt to extract valid JSON from Gemini's response text.
 * Gemini sometimes wraps JSON in markdown fences (```json ... ```) or
 * prepends/trailing whitespace. This function handles those cases.
 */
function extractJson(raw: string): GeminiPage[] {
  let text = raw.trim();

  // Strip markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Try direct parse first
  try {
    const parsed = JSON.parse(text);
    return parsed.pages;
  } catch {
    // Try finding the first { and last } to extract the JSON object
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = text.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(candidate);
      return parsed.pages;
    }
    throw new Error("Could not find valid JSON in response");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── Step 1: Validate API key ──
    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json<GeminiOcrResponse>(
        {
          success: false,
          pages: [],
          batchIndex: 0,
          totalBatches: 1,
          error: "AI service not configured. Please set GEMINI_API_KEY.",
        },
        { status: 500 }
      );
    }

    // ── Step 2: Parse incoming FormData ──
    const form = await request.formData();

    // Extract all image files — client sends them under the "images" key
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
        { status: 400 }
      );
    }

    // Validate every entry is a Blob
    const blobs = imageFiles.filter((f): f is File | Blob => f instanceof Blob);
    if (blobs.length === 0) {
      return NextResponse.json<GeminiOcrResponse>(
        {
          success: false,
          pages: [],
          batchIndex,
          totalBatches,
          error: "Invalid image data. Please upload valid image files.",
        },
        { status: 400 }
      );
    }

    // Check total file size
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
        { status: 400 }
      );
    }

    // ── Step 4: Convert images to base64 parts ──
    let imageParts: Array<{ mimeType: string; data: string }>;
    try {
      imageParts = await Promise.all(blobs.map((blob) => blobToBase64Parts(blob)));
    } catch (conversionErr) {
      console.error("[GeminiOCR] Image conversion failed:", conversionErr);
      return NextResponse.json<GeminiOcrResponse>(
        {
          success: false,
          pages: [],
          batchIndex,
          totalBatches,
          error: "Failed to process one or more images. Please try different files.",
        },
        { status: 400 }
      );
    }

    // ── Step 5: Initialize Google Generative AI ──
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 16384,
      },
    });

    // ── Step 6: Build multimodal parts: prompt text + images ──
    const prompt = buildPrompt(language);
    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [{ text: prompt }];

    for (const imgPart of imageParts) {
      parts.push({ inlineData: imgPart });
    }

    // ── Step 7: Call Gemini with timeout ──
    let rawResponse: string;
    try {
      const result = await Promise.race([
        model.generateContent(parts),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT")), GEMINI_TIMEOUT_MS)
        ),
      ]);

      rawResponse = result.response.text();

      if (!rawResponse || typeof rawResponse !== "string") {
        console.error("[GeminiOCR] Unexpected response shape:", rawResponse);
        return NextResponse.json<GeminiOcrResponse>(
          {
            success: false,
            pages: [],
            batchIndex,
            totalBatches,
            error: "AI returned an unexpected response format.",
          },
          { status: 502 }
        );
      }
    } catch (apiErr) {
      const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
      console.error("[GeminiOCR] API call failed:", msg);

      if (msg === "TIMEOUT") {
        return NextResponse.json<GeminiOcrResponse>(
          {
            success: false,
            pages: [],
            batchIndex,
            totalBatches,
            error: "AI processing timed out. The document may be too complex. Try splitting into smaller batches.",
          },
          { status: 504 }
        );
      }

      if (
        msg.toLowerCase().includes("api key") ||
        msg.toLowerCase().includes("invalid") ||
        msg.toLowerCase().includes("unauthorized")
      ) {
        return NextResponse.json<GeminiOcrResponse>(
          {
            success: false,
            pages: [],
            batchIndex,
            totalBatches,
            error: "AI service not configured. Please set a valid GEMINI_API_KEY.",
          },
          { status: 500 }
        );
      }

      if (
        msg.toLowerCase().includes("rate limit") ||
        msg.toLowerCase().includes("quota") ||
        msg.toLowerCase().includes("resource_exhausted")
      ) {
        return NextResponse.json<GeminiOcrResponse>(
          {
            success: false,
            pages: [],
            batchIndex,
            totalBatches,
            error: "AI rate limit reached. Please wait a moment and try again.",
          },
          { status: 429 }
        );
      }

      return NextResponse.json<GeminiOcrResponse>(
        {
          success: false,
          pages: [],
          batchIndex,
          totalBatches,
          error: "AI service request failed. Please try again.",
        },
        { status: 502 }
      );
    }

    // ── Step 8: Parse the JSON response ──
    let pages: GeminiPage[];
    try {
      pages = extractJson(rawResponse);
    } catch (parseErr) {
      console.error("[GeminiOCR] JSON parse failed:", parseErr);
      console.error("[GeminiOCR] Raw response (first 500 chars):", rawResponse.substring(0, 500));
      return NextResponse.json<GeminiOcrResponse>(
        {
          success: false,
          pages: [],
          batchIndex,
          totalBatches,
          error: "AI returned an invalid response. Please try again.",
        },
        { status: 502 }
      );
    }

    // ── Step 9: Return success ──
    return NextResponse.json<GeminiOcrResponse>({
      success: true,
      pages,
      batchIndex,
      totalBatches,
    });
  } catch (initErr) {
    // Catch-all: SDK init failure, unexpected errors, etc.
    const msg = initErr instanceof Error ? initErr.message : String(initErr);
    console.error("[GeminiOCR] Unhandled error:", msg);

    return NextResponse.json<GeminiOcrResponse>(
      {
        success: false,
        pages: [],
        batchIndex: 0,
        totalBatches: 1,
        error: "An unexpected error occurred. Please try again.",
      },
      { status: 500 }
    );
  }
}
