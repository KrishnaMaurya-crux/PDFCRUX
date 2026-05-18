import { NextRequest, NextResponse } from "next/server";

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

/** Maximum total size of all images combined (20 MB) */
const MAX_TOTAL_SIZE = 20 * 1024 * 1024;

/** Timeout for Gemini API call (60 seconds) */
const GEMINI_TIMEOUT_MS = 60_000;

// Read model and API key from environment
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL_NAME || "gemini-2.0-flash";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * Convert a Blob to base64 string.
 */
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

    // ── Step 4: Convert images to base64 ──
    const imageDataUris: Array<{ inlineData: { mimeType: string; data: string } }> = [];

    for (const blob of blobs) {
      const base64 = await blobToBase64(blob);
      const mime = blob.type || "image/jpeg";
      imageDataUris.push({
        inlineData: {
          mimeType: mime,
          data: base64,
        },
      });
    }

    // ── Step 5: Build Gemini API request ──
    const prompt = buildPrompt(language);

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: prompt },
      ...imageDataUris,
    ];

    const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const requestBody = {
      contents: [
        {
          parts,
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 16384,
        responseMimeType: "application/json",
      },
    };

    // ── Step 6: Call Gemini API with timeout ──
    let rawResponse: string;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("[GeminiOCR] API error:", response.status, errorBody);

        if (response.status === 403) {
          return NextResponse.json<GeminiOcrResponse>(
            { success: false, pages: [], batchIndex, totalBatches, error: "AI API key is invalid or lacks permission." },
            { status: 502 }
          );
        }
        if (response.status === 429) {
          return NextResponse.json<GeminiOcrResponse>(
            { success: false, pages: [], batchIndex, totalBatches, error: "AI rate limit reached. Please wait and try again." },
            { status: 429 }
          );
        }
        return NextResponse.json<GeminiOcrResponse>(
          { success: false, pages: [], batchIndex, totalBatches, error: `AI service error (${response.status}). Please try again.` },
          { status: 502 }
        );
      }

      const data = await response.json();

      rawResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

      if (!rawResponse || typeof rawResponse !== "string") {
        console.error("[GeminiOCR] Unexpected response shape:", JSON.stringify(data).substring(0, 500));
        return NextResponse.json<GeminiOcrResponse>(
          { success: false, pages: [], batchIndex, totalBatches, error: "AI returned an unexpected response format." },
          { status: 502 }
        );
      }
    } catch (apiErr) {
      const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
      console.error("[GeminiOCR] API call failed:", msg);

      if (msg.includes("abort")) {
        return NextResponse.json<GeminiOcrResponse>(
          { success: false, pages: [], batchIndex, totalBatches, error: "AI processing timed out. Try splitting into smaller batches." },
          { status: 504 }
        );
      }

      return NextResponse.json<GeminiOcrResponse>(
        { success: false, pages: [], batchIndex, totalBatches, error: "AI service request failed. Please try again." },
        { status: 502 }
      );
    }

    // ── Step 7: Parse the JSON response ──
    let pages: GeminiPage[];
    try {
      pages = extractJson(rawResponse);
    } catch (parseErr) {
      console.error("[GeminiOCR] JSON parse failed:", parseErr);
      console.error("[GeminiOCR] Raw response (first 500 chars):", rawResponse.substring(0, 500));
      return NextResponse.json<GeminiOcrResponse>(
        { success: false, pages: [], batchIndex, totalBatches, error: "AI returned an invalid response. Please try again." },
        { status: 502 }
      );
    }

    // ── Step 8: Return success ──
    return NextResponse.json<GeminiOcrResponse>({
      success: true,
      pages,
      batchIndex,
      totalBatches,
    });
  } catch (initErr) {
    // Catch-all: unexpected errors
    const msg = initErr instanceof Error ? initErr.message : String(initErr);
    console.error("[GeminiOCR] Unhandled error:", msg);

    return NextResponse.json<GeminiOcrResponse>(
      { success: false, pages: [], batchIndex: 0, totalBatches: 1, error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
