import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getPlanConfig, canStoreMore, IS_DEV_MODE } from "@/lib/plan-config";

// ─────────────────────────────────────────────────────────────────
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// Lazy R2 import — only loads @aws-sdk/client-s3 when actually needed.
// This prevents crash if the package is missing or R2 is not configured.
// ─────────────────────────────────────────────────────────────────

type R2UploadFn = (file: Buffer, key: string, contentType: string) => Promise<{ key: string; url: string; size: number }>;
type R2KeyGenFn = (folder: string, fileName: string) => string;

async function getR2Helpers(): Promise<{ uploadToR2: R2UploadFn; generateFileKey: R2KeyGenFn } | null> {
  try {
    if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
      console.log("[Storage:Upload] R2 not configured — skipping cloud upload");
      return null;
    }

    const r2Module = await import("@/lib/r2");
    return {
      uploadToR2: r2Module.uploadToR2 as R2UploadFn,
      generateFileKey: r2Module.generateFileKey as R2KeyGenFn,
    };
  } catch (err) {
    console.warn("[Storage:Upload] R2 import failed:", err instanceof Error ? err.message : err);
    return null;
  }
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
// POST /api/storage/upload
//
// This endpoint has TWO modes of operation:
//
// MODE 1 — "upgrade" (default): A history entry was ALREADY saved by
//   saveHistory(). This route uploads the file to R2 and then FINDS
//   and UPDATES the most recent matching history entry with r2Key/fileUrl.
//   No duplicate entries created.
//
// MODE 2 — "standalone": If `?standalone=true` is passed, this creates
//   a NEW history entry (for backward compatibility).
//
// This design ensures:
// - History ALWAYS saves first (via /api/history POST)
// - R2 upload is a best-effort enhancement
// - No duplicate entries even if called after saveHistory()
// ─────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  console.log("[Storage:Upload] ═══ POST ═══");

  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const supabaseUser = await getUserFromRequest(req);
  if (!supabaseUser?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await db.user.findUnique({ where: { email: supabaseUser.email } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const plan = (user.plan as "free" | "premium" | "enterprise") || "free";

    // Parse FormData
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const toolId = formData.get("toolId") as string | null;
    const toolName = formData.get("toolName") as string | null;
    const fileName = formData.get("fileName") as string | null;
    const resultSummary = formData.get("resultSummary") as string | null;

    if (!file || !toolId || !toolName || !fileName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const fileSizeKB = Math.ceil(file.size / 1024);
    const currentStorageKB = Math.max(0, Number(user.storageUsed ?? 0));

    // Check storage limit (skip in dev mode)
    if (!IS_DEV_MODE && !canStoreMore(plan, currentStorageKB, fileSizeKB)) {
      return NextResponse.json({ error: "Storage limit reached", reason: "upgrade" }, { status: 429 });
    }

    // ── Try R2 upload ──
    let r2Key: string | null = null;
    let fileUrl: string | null = null;

    const r2 = await getR2Helpers();
    if (r2) {
      console.log("[Storage:Upload] R2 helpers loaded, bucket:", process.env.R2_BUCKET_NAME);
      try {
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        r2Key = r2.generateFileKey("uploads", fileName);

        console.log("[Storage:Upload] Uploading to R2:", r2Key, `(${fileBuffer.length} bytes)`);
        const uploadResult = await r2.uploadToR2(fileBuffer, r2Key, file.type || "application/octet-stream");
        fileUrl = uploadResult.url;

        console.log("[Storage:Upload] ✅ R2 upload success:", r2Key, "size:", uploadResult.size);
      } catch (r2Err) {
        const msg = r2Err instanceof Error ? r2Err.message : String(r2Err);
        const name = r2Err instanceof Error ? r2Err.name : "UnknownError";
        console.error("[Storage:Upload] ❌ R2 upload failed:", name, msg);
        // Also return error info so client can see it
        r2Key = null;
        fileUrl = null;
      }
    } else {
      console.warn("[Storage:Upload] ⚠️ R2 not configured — env vars missing");
    }

    if (!r2Key) {
      // R2 upload didn't happen — tell client it was metadata-only
      console.log("[Storage:Upload] No R2 upload — returning metadata-only response");
      return NextResponse.json({ uploaded: false, r2Key: null });
    }

    // ── R2 upload succeeded → UPDATE existing history entry ──
    // Find the most recent matching history entry (created by saveHistory earlier)
    const recentEntry = await db.history.findFirst({
      where: {
        userId: user.id,
        toolId,
        fileName,
      },
      orderBy: { createdAt: "desc" },
    });

    if (recentEntry) {
      // Update the existing entry with R2 info
      await db.history.update({
        where: { id: recentEntry.id },
        data: { r2Key, fileUrl },
      });
      console.log("[Storage:Upload] ✅ Updated existing entry:", recentEntry.id, "with R2 key");
    } else {
      // No matching entry found — create a new one
      await db.history.create({
        data: {
          userId: user.id,
          toolId,
          toolName,
          fileName,
          fileSize: file.size,
          resultSummary: resultSummary || "",
          r2Key,
          fileUrl,
        },
      });
      console.log("[Storage:Upload] ✅ Created new entry with R2 key");
    }

    // Update user storageUsed
    await db.user.update({
      where: { id: user.id },
      data: { storageUsed: { increment: fileSizeKB } },
    }).catch(() => {
      console.warn("[Storage:Upload] Failed to update storageUsed");
    });

    return NextResponse.json({ uploaded: true, r2Key });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Storage:Upload] 💥", msg);
    return NextResponse.json({ error: "Upload failed", debug: msg }, { status: 500 });
  }
}
