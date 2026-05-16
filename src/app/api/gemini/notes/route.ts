import { NextRequest, NextResponse } from "next/server";
import { callGeminiWithPdf } from "@/lib/gemini";

// Force Node.js runtime (not Edge) — Gemini SDK requires Node.js APIs
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface NotesResponse {
  success: boolean;
  title?: string;
  sections?: { heading: string; content: string[] }[];
  totalSections?: number;
  wordCount?: number;
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
      return NextResponse.json<NotesResponse>(
        { success: false, error: "Invalid request format. Please upload a valid PDF." },
        { status: 400 }
      );
    }

    const file = form.get("file") as File | null;

    // ── Validate inputs ──
    if (!file) {
      return NextResponse.json<NotesResponse>(
        { success: false, error: "No PDF file provided." },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json<NotesResponse>(
        { success: false, error: "Please upload a PDF file." },
        { status: 400 }
      );
    }

    if (file.size > MAX_PDF_SIZE) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      return NextResponse.json<NotesResponse>(
        { success: false, error: `PDF is too large (${sizeMB} MB). Maximum 20 MB supported.` },
        { status: 400 }
      );
    }

    // ── Read PDF buffer ──
    const pdfBuffer = await file.arrayBuffer();

    // ── Call Gemini with PDF buffer directly ──
    const result = await callGeminiWithPdf<{
      title: string;
      sections: { heading: string; content: string[] }[];
      totalSections: number;
      wordCount: number;
    }>({
      tool: "notes",
      pdfBuffer,
      fileName: file.name,
    });

    if (!result.success || !result.data) {
      return NextResponse.json<NotesResponse>(
        { success: false, error: result.error || "AI analysis failed." },
        { status: 502 }
      );
    }

    const { data } = result;

    // Validate required fields
    if (!Array.isArray(data.sections) || data.sections.length === 0) {
      return NextResponse.json<NotesResponse>(
        { success: false, error: "AI returned invalid notes. Please try again." },
        { status: 502 }
      );
    }

    return NextResponse.json<NotesResponse>({
      success: true,
      title: data.title || "Untitled Document",
      sections: data.sections,
      totalSections: data.totalSections || data.sections.length,
      wordCount: data.wordCount || 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Gemini:Notes] Unhandled error:", msg);
    return NextResponse.json<NotesResponse>(
      { success: false, error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
