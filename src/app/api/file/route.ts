import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { canDownloadMore, IS_DEV_MODE } from "@/lib/plan-config";

// ─────────────────────────────────────────────────────────────────
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// Lazy R2 import — don't crash the route if @aws-sdk is missing
// or R2 env vars are wrong. Eager import would crash at module load.
// ─────────────────────────────────────────────────────────────────

async function uploadToR2(file: Buffer, key: string, contentType: string) {
  const r2 = await import("@/lib/r2");
  return r2.uploadToR2(file, key, contentType);
}

async function downloadFromR2(key: string): Promise<Buffer> {
  const r2 = await import("@/lib/r2");
  return r2.downloadFromR2(key);
}

async function generateFileKey(folder: string, fileName: string): Promise<string> {
  const r2 = await import("@/lib/r2");
  return r2.generateFileKey(folder, fileName);
}

// ─────────────────────────────────────────────────────────────────
// Auth helper
// ─────────────────────────────────────────────────────────────────

async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Content-Type lookup from file extension
// ─────────────────────────────────────────────────────────────────────────

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  zip: "application/zip",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  webm: "video/webm",
};

function getContentType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/file?key=uploads/2026-06/abc123.pdf
//
// DOWNLOAD: Server-side proxy from R2 → Client
// No CORS needed — browser calls our own API, server fetches from R2.
//
// Optional query params:
//   key         — R2 object key (required for direct key download)
//   id          — History entry ID (alternative: looks up r2Key from DB)
//   fileName    — Override filename for Content-Disposition
// ─────────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  console.log("[Api:File] ═══ GET (download) ═══");

  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const supabaseUser = await getUserFromRequest(req);
  if (!supabaseUser?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const r2Key = url.searchParams.get("key");
  const historyId = url.searchParams.get("id");
  const overrideFileName = url.searchParams.get("fileName");

  if (!r2Key && !historyId) {
    return NextResponse.json(
      { error: "Missing key or id query param" },
      { status: 400 }
    );
  }

  try {
    let keyToFetch = r2Key;
    let entryFileName = overrideFileName || "download";
    let entryId: string | undefined;

    // If historyId provided, look up r2Key from database
    if (historyId) {
      const entry = await db.history.findFirst({ where: { id: historyId } });
      if (!entry || !entry.r2Key) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      keyToFetch = entry.r2Key;
      entryFileName = entry.fileName || "download";
      entryId = entry.id;

      // Verify ownership
      const user = await db.user.findUnique({
        where: { email: supabaseUser.email },
      });
      if (!user || user.id !== entry.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Check download limit (skip in dev mode)
      const plan = (user.plan as "free" | "premium" | "enterprise") || "free";
      if (!IS_DEV_MODE && !canDownloadMore(plan, user.downloadCount)) {
        return NextResponse.json(
          {
            error: "Download limit reached",
            reason: "upgrade",
            plan,
            downloadCount: user.downloadCount,
          },
          { status: 429 }
        );
      }
    }

    if (!keyToFetch) {
      return NextResponse.json({ error: "File key not found" }, { status: 404 });
    }

    // Fetch from R2 (server-side — no CORS issues)
    console.log("[Api:File] Fetching from R2:", keyToFetch);
    const buffer = await downloadFromR2(keyToFetch);

    // Increment download count if this was a history-based download
    if (historyId && entryId) {
      const user = await db.user.findUnique({
        where: { email: supabaseUser.email },
      });
      if (user) {
        await db.user.update({
          where: { id: user.id },
          data: { downloadCount: { increment: 1 } },
        });
      }
      await db.history.update({
        where: { id: entryId },
        data: { downloaded: true },
      });
    }

    const contentType = getContentType(entryFileName);

    console.log("[Api:File] ✅ Downloaded:", entryFileName, `(${buffer.length} bytes)`);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(entryFileName)}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Api:File] 💥 GET failed:", msg);
    return NextResponse.json({ error: "Download failed", debug: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// POST /api/file?toolId=xxx&fileName=yyy&toolName=zzz&resultSummary=aaa
//
// UPLOAD: Client → Our API → R2 (server-side proxy)
// No presigned URLs needed. No CORS issues.
//
// Request body: Raw file bytes (Blob / ArrayBuffer / Buffer)
// Query params: fileName, toolId, toolName (optional), resultSummary (optional)
//
// Response: { success: true, r2Key: string }
// ─────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  console.log("[Api:File] ═══ POST (upload) ═══");

  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const supabaseUser = await getUserFromRequest(req);
  if (!supabaseUser?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const fileName = url.searchParams.get("fileName") || "unknown";
  const toolId = url.searchParams.get("toolId") || "";
  const toolName = url.searchParams.get("toolName") || "";
  const resultSummary = url.searchParams.get("resultSummary") || "";

  if (!fileName || !toolId) {
    return NextResponse.json(
      { error: "Missing fileName or toolId query param" },
      { status: 400 }
    );
  }

  // Check R2 config
  if (
    !process.env.R2_ACCOUNT_ID ||
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY ||
    !process.env.R2_BUCKET_NAME
  ) {
    console.warn("[Api:File] R2 env vars not set — skipping upload");
    return NextResponse.json(
      { error: "R2 not configured", hint: "Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME" },
      { status: 503 }
    );
  }

  try {
    // Read file body as ArrayBuffer
    const fileBuffer = Buffer.from(await req.arrayBuffer());
    const fileSize = fileBuffer.byteLength;

    if (fileSize === 0) {
      return NextResponse.json({ error: "Empty file body" }, { status: 400 });
    }

    console.log("[Api:File] 📤 Uploading:", fileName, `(${fileSize} bytes)`);

    // Generate unique R2 key
    const r2Key = await generateFileKey("uploads", fileName);

    // Upload to R2 (server-side — no CORS, no presigned URLs)
    const contentType = getContentType(fileName);
    await uploadToR2(fileBuffer, r2Key, contentType);

    console.log("[Api:File] ✅ Uploaded to R2:", r2Key);

    // Update the most recent matching history entry with r2Key
    const user = await db.user.findUnique({
      where: { email: supabaseUser.email },
    });

    if (user && toolId) {
      const recentEntry = await db.history.findFirst({
        where: { userId: user.id, toolId, fileName },
        orderBy: { createdAt: "desc" },
      });

      if (recentEntry) {
        await db.history.update({
          where: { id: recentEntry.id },
          data: {
            r2Key,
            fileUrl: `r2://${process.env.R2_BUCKET_NAME}/${r2Key}`,
          },
        });
        console.log("[Api:File] ✅ History updated:", recentEntry.id);

        // Update user storageUsed
        await db.user.update({
          where: { id: user.id },
          data: { storageUsed: { increment: fileSize } },
        });
        console.log("[Api:File] 📊 Storage +", fileSize, "bytes");
      } else {
        console.log("[Api:File] ⚠️ No matching history entry for", { toolId, fileName });
      }
    }

    return NextResponse.json({
      success: true,
      r2Key,
      fileName,
      fileSize,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Api:File] 💥 POST failed:", msg);
    return NextResponse.json({ error: "Upload failed", debug: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// OPTIONS /api/file
//
// CORS preflight handler — allows browser to call this route
// from any origin (needed for cross-origin requests).
// ─────────────────────────────────────────────────────────────────────────
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Content-Length",
      "Access-Control-Max-Age": "86400",
    },
  });
}
