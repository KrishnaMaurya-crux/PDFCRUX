import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/ocr-space
 *
 * FIXED version — BUG 1 & BUG 10 from original:
 *
 * BUG 1: Original built multipart body as a plain JS string joined with \r\n.
 *   This produces a malformed multipart body that OCR.space rejects with a 400/parse error.
 *   Fix: Use native FormData — the browser/Node runtime sets the correct
 *   Content-Type boundary automatically.
 *
 * BUG 10: Original closing boundary was `${boundary}--` (missing leading --).
 *   RFC 2046 requires `--${boundary}--`. Fixed by using FormData (no manual boundary).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { base64Image, language = "eng" } = body;

    if (!base64Image || typeof base64Image !== "string") {
      return NextResponse.json(
        { error: "base64Image is required and must be a string" },
        { status: 400 }
      );
    }

    const key = process.env.OCR_SPACE_API_KEY;
    if (!key) {
      console.error("OCR_SPACE_API_KEY is not set in environment variables");
      return NextResponse.json(
        { error: "OCR service is not configured. Please contact the administrator." },
        { status: 500 }
      );
    }

    // FIX: Use FormData — no manual multipart string, no boundary bugs
    const formData = new FormData();
    formData.append("base64Image", `data:image/jpeg;base64,${base64Image}`);
    formData.append("language", language);
    formData.append("isOverlayRequired", "true");
    formData.append("OCREngine", "2");
    formData.append("scale", "true");
    formData.append("detectOrientation", "true");
    // Do NOT set Content-Type header — let fetch auto-set it with the correct boundary

    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: {
        apikey: key,
        // Content-Type intentionally omitted — FormData sets it with boundary
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OCR.space API error ${response.status}:`, errorText);
      return NextResponse.json(
        { error: `OCR.space API returned ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.OCRExitCode !== 1) {
      console.warn("OCR.space non-success code:", data.OCRExitCode, data.ErrorMessage);
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("OCR.space proxy error:", err);
    return NextResponse.json(
      {
        error: "Failed to process OCR request",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
