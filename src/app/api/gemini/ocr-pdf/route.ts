import { NextRequest, NextResponse } from "next/server";
import { callGeminiWithPdf } from "@/lib/gemini";

// Force Node.js runtime (not Edge) — Gemini SDK requires Node.js APIs
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GeminiElement {
  type: "heading1" | "heading2" | "heading3" | "paragraph" | "bullet_list" | "numbered_list" | "table";
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

interface OcrPdfResponse {
  success: boolean;
  pages?: GeminiPage[];
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20 MB

// ─────────────────────────────────────────────────────────────────────────────
// Route Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── Parse FormData ──
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json<OcrPdfResponse>(
        { success: false, error: "Invalid request format. Please upload a valid PDF." },
        { status: 400 }
      );
    }

    const file = form.get("file") as File | null;
    const language = (form.get("language") as string) || "English";

    // ── Validate inputs ──
    if (!file) {
      return NextResponse.json<OcrPdfResponse>(
        { success: false, error: "No PDF file provided." },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json<OcrPdfResponse>(
        { success: false, error: "Please upload a PDF file." },
        { status: 400 }
      );
    }

    if (file.size > MAX_PDF_SIZE) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      return NextResponse.json<OcrPdfResponse>(
        { success: false, error: `PDF is too large (${sizeMB} MB). Maximum 20 MB supported.` },
        { status: 400 }
      );
    }

    // ── Read PDF buffer ──
    const pdfBuffer = await file.arrayBuffer();

    // ── Call Gemini with native PDF support ──
    const result = await callGeminiWithPdf<{
      pages: GeminiPage[];
    }>({
      tool: "ocr",
      pdfBuffer,
      fileName: file.name,
      extraContext: language,
    });

    if (!result.success || !result.data) {
      return NextResponse.json<OcrPdfResponse>(
        { success: false, error: result.error || "AI OCR analysis failed." },
        { status: 502 }
      );
    }

    const { data } = result;

    // Validate response has pages
    if (!Array.isArray(data.pages) || data.pages.length === 0) {
      return NextResponse.json<OcrPdfResponse>(
        { success: false, error: "AI returned no pages. The PDF may be empty or unreadable." },
        { status: 502 }
      );
    }

    // Sort pages by page number to ensure correct order
    data.pages.sort((a, b) => a.page - b.page);

    return NextResponse.json<OcrPdfResponse>({
      success: true,
      pages: data.pages,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Gemini:OcrPdf] Unhandled error:", msg);
    return NextResponse.json<OcrPdfResponse>(
      { success: false, error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
