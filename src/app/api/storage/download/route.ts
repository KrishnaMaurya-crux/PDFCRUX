import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { canDownloadMore, IS_DEV_MODE } from "@/lib/plan-config";

// ─────────────────────────────────────────────────────────────────
// Lazy R2 import — don't crash the route if @aws-sdk is missing
// or R2 env vars are wrong. Eager import would crash at module load.
// ─────────────────────────────────────────────────────────────────
async function downloadFromR2(key: string): Promise<Buffer> {
  const r2 = await import("@/lib/r2");
  return r2.downloadFromR2(key);
}

// ─────────────────────────────────────────────────────────────────
export const runtime = "nodejs";

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

// ─────────────────────────────────────────────────────────────────
// GET /api/storage/download?id=xxx
// Proxies file from R2 to client + increments download count
// ─────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  console.log("[Storage:Download] ═══ GET ═══");

  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const supabaseUser = await getUserFromRequest(req);
  if (!supabaseUser?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const historyId = url.searchParams.get("id");

  if (!historyId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    // Find the history entry
    const entry = await db.history.findFirst({
      where: { id: historyId },
    });

    if (!entry || !entry.r2Key) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Verify ownership
    const user = await db.user.findUnique({ where: { email: supabaseUser.email } });
    if (!user || user.id !== entry.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check download limit (skip in dev mode)
    const plan = (user.plan as "free" | "premium" | "enterprise") || "free";
    if (!IS_DEV_MODE && !canDownloadMore(plan, user.downloadCount)) {
      return NextResponse.json({
        error: "Download limit reached",
        reason: "upgrade",
        plan,
        downloadCount: user.downloadCount,
      }, { status: 429 });
    }

    // Download from R2
    console.log("[Storage:Download] Fetching from R2:", entry.r2Key);
    const buffer = await downloadFromR2(entry.r2Key);

    // Increment download count
    await db.user.update({
      where: { id: user.id },
      data: { downloadCount: { increment: 1 } },
    });

    // Mark history entry as downloaded
    await db.history.update({
      where: { id: historyId },
      data: { downloaded: true },
    });

    // Determine content type from fileName
    const ext = entry.fileName.split(".").pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      pdf: "application/pdf",
      zip: "application/zip",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };
    const contentType = contentTypes[ext || ""] || "application/octet-stream";

    console.log("[Storage:Download] ✅", entry.fileName, `(${buffer.length} bytes)`);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(entry.fileName)}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Storage:Download] 💥", msg);
    return NextResponse.json({ error: "Download failed", debug: msg }, { status: 500 });
  }
}
