import { NextRequest, NextResponse } from "next/server";
import { callGemini, extractTextFromPDF } from "@/lib/gemini";

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
// Route Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── Parse FormData ──
    const form = await request.formData();
    const resumeFile = form.get("resume") as File | null;
    const jobDescription = (form.get("jobDescription") as string) || "";

    if (!resumeFile) {
      return NextResponse.json<ResumeResponse>(
        { success: false, error: "No resume file provided." },
        { status: 400 }
      );
    }

    // Validate file type
    if (
      resumeFile.type !== "application/pdf" &&
      !resumeFile.name.toLowerCase().endsWith(".pdf")
    ) {
      return NextResponse.json<ResumeResponse>(
        { success: false, error: "Please upload a PDF file for the resume." },
        { status: 400 }
      );
    }

    // ── Extract text from resume PDF ──
    let resumeText: string;
    try {
      resumeText = await extractTextFromPDF(resumeFile);
    } catch (extractErr) {
      console.error("[Gemini:Resume] Text extraction failed:", extractErr);
      return NextResponse.json<ResumeResponse>(
        {
          success: false,
          error: "Failed to read the resume PDF. Please try a text-based PDF.",
        },
        { status: 400 }
      );
    }

    if (!resumeText || resumeText.trim().length < 30) {
      return NextResponse.json<ResumeResponse>(
        {
          success: false,
          error:
            "Could not extract enough text from the resume. Please try a text-based PDF.",
        },
        { status: 400 }
      );
    }

    // ── Call Gemini ──
    const result = await callGemini<{
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
      text: resumeText,
      extraContext: jobDescription || undefined,
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
        {
          success: false,
          error: "AI returned an invalid score. Please try again.",
        },
        { status: 502 }
      );
    }

    // Clamp score to 0-100
    data.atsScore = Math.max(0, Math.min(100, data.atsScore));

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
      stats: data.stats || {
        totalWords: countWords(resumeText),
        pageCount: 1,
      },
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
      {
        success: false,
        error: "An unexpected error occurred. Please try again.",
      },
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
