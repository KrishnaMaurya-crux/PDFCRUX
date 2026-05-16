import { NextRequest, NextResponse } from "next/server";
import { callGeminiWithPdf } from "@/lib/gemini";

// Force Node.js runtime (not Edge) — Gemini SDK requires Node.js APIs
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SummaryResponse {
  success: boolean;
  title?: string;
  bulletPoints?: string[];
  wordCount?: number;
  readingTime?: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20MB

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
      return NextResponse.json<SummaryResponse>(
        { success: false, error: "Invalid request format. Please upload a valid PDF." },
        { status: 400 }
      );
    }

    const file = form.get("file") as File | null;

    // ── Validate inputs ──
    if (!file) {
      return NextResponse.json<SummaryResponse>(
        { success: false, error: "No PDF file provided." },
        { status: 400 }
      );
    }

    // Validate file type
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json<SummaryResponse>(
        { success: false, error: "Please upload a PDF file." },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_PDF_SIZE) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      return NextResponse.json<SummaryResponse>(
        { success: false, error: `PDF is too large (${sizeMB} MB). Maximum 20 MB supported.` },
        { status: 400 }
      );
    }

    // ── Read PDF buffer ──
    const pdfBuffer = await file.arrayBuffer();

    // ── Call Gemini with PDF buffer directly ──
    const result = await callGeminiWithPdf<{
      title: string;
      bulletPoints: string[];
      wordCount: number;
      readingTime: string;
    }>({
      tool: "summarize",
      pdfBuffer,
      fileName: file.name,
    });

    if (!result.success || !result.data) {
      return NextResponse.json<SummaryResponse>(
        { success: false, error: result.error || "AI analysis failed." },
        { status: 502 }
      );
    }

    const { data } = result;

    // Validate required fields
    if (!Array.isArray(data.bulletPoints) || data.bulletPoints.length === 0) {
      return NextResponse.json<SummaryResponse>(
        { success: false, error: "AI returned an invalid summary. Please try again." },
        { status: 502 }
      );
    }

    const wordCount = data.wordCount || 0;
    const readingTime = data.readingTime || estimateReadingTime(wordCount);

    return NextResponse.json<SummaryResponse>({
      success: true,
      title: data.title || "Untitled Document",
      bulletPoints: data.bulletPoints,
      wordCount,
      readingTime,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Gemini:Summarize] Unhandled error:", msg);
    return NextResponse.json<SummaryResponse>(
      { success: false, error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function estimateReadingTime(wordCount: number): string {
  const minutes = Math.max(1, Math.ceil(wordCount / 200));
  return `${minutes} min read`;
}
