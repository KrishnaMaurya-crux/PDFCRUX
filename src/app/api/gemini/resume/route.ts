import { NextRequest, NextResponse } from "next/server";
import { callGeminiWithPdf } from "@/lib/gemini";

// Force Node.js runtime (not Edge) — Gemini SDK requires Node.js APIs
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ResumeResponse {
  success: boolean;
  atsScore?: number;
  grade?: string;
  sections?: { name: string; found: boolean }[];
  keywordsFound?: string[];
  keywordsMissing?: string[];
  strengths?: string[];
  weaknesses?: string[];
  suggestions?: string[];
  stats?: { totalWords: number; pageCount: number };
  scoreBreakdown?: {
    sectionScore: number;
    keywordScore: number;
    structureScore: number;
    lengthScore: number;
  };
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
      return NextResponse.json<ResumeResponse>(
        { success: false, error: "Invalid request format. Please upload a valid PDF." },
        { status: 400 }
      );
    }

    const resumeFile = form.get("resume") as File | null;
    const jobDescription = (form.get("jobDescription") as string) || "";

    // ── Validate inputs ──
    if (!resumeFile) {
      return NextResponse.json<ResumeResponse>(
        { success: false, error: "No resume PDF provided." },
        { status: 400 }
      );
    }

    if (
      resumeFile.type !== "application/pdf" &&
      !resumeFile.name.toLowerCase().endsWith(".pdf")
    ) {
      return NextResponse.json<ResumeResponse>(
        { success: false, error: "Please upload a PDF file for the resume." },
        { status: 400 }
      );
    }

    if (resumeFile.size > MAX_PDF_SIZE) {
      const sizeMB = (resumeFile.size / 1024 / 1024).toFixed(1);
      return NextResponse.json<ResumeResponse>(
        { success: false, error: `Resume is too large (${sizeMB} MB). Maximum 20 MB supported.` },
        { status: 400 }
      );
    }

    // ── Read PDF buffer ──
    const pdfBuffer = await resumeFile.arrayBuffer();

    // ── Call Gemini with PDF buffer directly ──
    const result = await callGeminiWithPdf<{
      atsScore: number;
      grade: string;
      sections: { name: string; found: boolean }[];
      keywordsFound: string[];
      keywordsMissing: string[];
      strengths: string[];
      weaknesses: string[];
      suggestions: string[];
      stats: { totalWords: number; pageCount: number };
      scoreBreakdown: {
        sectionScore: number;
        keywordScore: number;
        structureScore: number;
        lengthScore: number;
      };
    }>({
      tool: "resume",
      pdfBuffer,
      fileName: resumeFile.name,
      extraContext: jobDescription.trim() || undefined,
    });

    if (!result.success || !result.data) {
      return NextResponse.json<ResumeResponse>(
        { success: false, error: result.error || "AI analysis failed." },
        { status: 502 }
      );
    }

    const { data } = result;

    // Validate required fields
    if (typeof data.atsScore !== "number" || !data.grade) {
      return NextResponse.json<ResumeResponse>(
        { success: false, error: "AI returned an invalid score. Please try again." },
        { status: 502 }
      );
    }

    // Clamp score to 0-100
    data.atsScore = Math.max(0, Math.min(100, Math.round(data.atsScore)));

    return NextResponse.json<ResumeResponse>({
      success: true,
      atsScore: data.atsScore,
      grade: data.grade,
      sections: data.sections || [],
      keywordsFound: data.keywordsFound || [],
      keywordsMissing: data.keywordsMissing || [],
      strengths: data.strengths || [],
      weaknesses: data.weaknesses || [],
      suggestions: data.suggestions || [],
      stats: data.stats || { totalWords: 0, pageCount: 1 },
      scoreBreakdown: data.scoreBreakdown || {
        sectionScore: 0,
        keywordScore: 0,
        structureScore: 0,
        lengthScore: 0,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Gemini:Resume] Unhandled error:", msg);
    return NextResponse.json<ResumeResponse>(
      { success: false, error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
