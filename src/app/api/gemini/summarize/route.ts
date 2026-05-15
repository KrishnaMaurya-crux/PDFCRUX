import { NextRequest, NextResponse } from "next/server";
import { callGemini, extractTextFromPDF } from "@/lib/gemini";

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
// Route Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── Parse FormData ──
    const form = await request.formData();
    const file = form.get("file") as File | null;

    if (!file) {
      return NextResponse.json<SummaryResponse>(
        { success: false, error: "No file provided." },
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

    // ── Extract text from PDF ──
    let text: string;
    try {
      text = await extractTextFromPDF(file);
    } catch (extractErr) {
      console.error("[Gemini:Summarize] Text extraction failed:", extractErr);
      return NextResponse.json<SummaryResponse>(
        { success: false, error: "Failed to read the PDF. Please try a text-based PDF." },
        { status: 400 }
      );
    }

    if (!text || text.trim().length < 50) {
      return NextResponse.json<SummaryResponse>(
        { success: false, error: "Could not extract enough text from this PDF. Please try a text-based PDF." },
        { status: 400 }
      );
    }

    // ── Call Gemini ──
    const result = await callGemini<{
      title: string;
      bulletPoints: string[];
      wordCount: number;
      readingTime: string;
    }>({
      tool: "summarize",
      text,
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

    return NextResponse.json<SummaryResponse>({
      success: true,
      title: data.title || "Untitled Document",
      bulletPoints: data.bulletPoints,
      wordCount: data.wordCount || countWords(text),
      readingTime: data.readingTime || estimateReadingTime(countWords(text)),
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

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

function estimateReadingTime(wordCount: number): string {
  const minutes = Math.max(1, Math.ceil(wordCount / 200));
  return `${minutes} min read`;
}
