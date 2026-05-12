import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/ocr-space
 *
 * Server-side proxy for OCR.space API.
 * Needed because OCR.space has CORS restrictions and API keys must stay server-side.
 *
 * Body: { base64Image: string, apiKey: string, language: string }
 * Returns: OCR.space JSON response with TextOverlay data
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { base64Image, apiKey, language = "eng" } = body;

    if (!base64Image || typeof base64Image !== "string") {
      return NextResponse.json(
        { error: "base64Image is required and must be a string" },
        { status: 400 }
      );
    }

    // Use the built-in fallback key if the user didn't provide one
    const key = apiKey && apiKey.trim() !== "" ? apiKey.trim() : "K87397566888957";

    // Build the multipart form data manually
    const boundary = `----PdfCruxOCR${Date.now()}`;
    const parts: string[] = [];

    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="base64Image"\r\n\r\n${"data:image/jpeg;base64,"}${base64Image}`
    );
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}`
    );
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="isOverlayRequired"\r\n\r\ntrue`
    );
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="OCREngine"\r\n\r\n2`
    );
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="scale"\r\n\r\ntrue`
    );
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="detectTables"\r\n\r\ntrue`
    );
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="tableRecognitionMethod"\r\n\r\n1`
    );
    parts.push(`${boundary}--\r\n`);

    const formData = parts.join("\r\n");

    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OCR.space API error ${response.status}:`, errorText);
      return NextResponse.json(
        {
          error: `OCR.space API returned ${response.status}`,
          details: errorText,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Check for OCR processing errors
    if (data.OCRExitCode !== 1) {
      console.warn("OCR.space returned non-success code:", data.OCRExitCode, data.ErrorMessage);
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
