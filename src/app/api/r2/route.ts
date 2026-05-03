import { NextRequest, NextResponse } from "next/server";
import { uploadToR2, downloadFromR2, deleteFromR2, listFromR2, generateFileKey } from "@/lib/r2";

/**
 * POST /api/r2/upload — Upload a file to Cloudflare R2
 * Body (FormData): file + optional folder
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const folder = (formData.get("folder") as string) || "uploads";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Max 100MB
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 100MB." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = generateFileKey(folder, file.name);
    const result = await uploadToR2(buffer, key, file.type || "application/pdf");

    return NextResponse.json({
      success: true,
      key: result.key,
      url: result.url,
      size: result.size,
      message: "File uploaded to cloud storage successfully.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("[R2 Upload Error]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/r2?key=xxx — Download a file from R2
 * Query params: key (required)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    const action = searchParams.get("action");

    // List files
    if (action === "list") {
      const prefix = searchParams.get("prefix") || undefined;
      const result = await listFromR2(prefix);
      return NextResponse.json({ success: true, ...result });
    }

    // Download file
    if (!key) {
      return NextResponse.json({ error: "Missing 'key' parameter" }, { status: 400 });
    }

    const buffer = await downloadFromR2(key);

    // Determine content type from key
    const ext = key.split(".").pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      zip: "application/zip",
    };

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentTypes[ext || ""] || "application/octet-stream",
        "Content-Disposition": `inline; filename="${key.split("/").pop()}"`,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Download failed";
    console.error("[R2 Download Error]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/r2?key=xxx — Delete a file from R2
 * Query params: key (required)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json({ error: "Missing 'key' parameter" }, { status: 400 });
    }

    await deleteFromR2(key);

    return NextResponse.json({
      success: true,
      message: "File deleted from cloud storage.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Delete failed";
    console.error("[R2 Delete Error]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
