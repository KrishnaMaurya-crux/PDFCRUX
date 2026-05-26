import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { uploadToR2, generateFileKey, BUCKET_NAME } from "@/lib/r2";
import { getPlanConfig, canStoreMore, IS_DEV_MODE } from "@/lib/plan-config";

// ─────────────────────────────────────────────────────────────────
export const runtime = "nodejs";

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

// ─────────────────────────────────────────────────────────────────
// POST /api/storage/upload
// Receives FormData with file + metadata.
// Uploads to R2, saves history entry with r2Key, updates storageUsed.
// Falls back gracefully if R2 is not configured.
// ─────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  console.log("[Storage:Upload] ═══ POST ═══");

  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const supabaseUser = await getUserFromRequest(req);
  if (!supabaseUser?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if R2 is configured
  const r2Configured = !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );

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
      return NextResponse.json(
        { error: "Missing required fields (file, toolId, toolName, fileName)" },
        { status: 400 }
      );
    }

    const fileSizeKB = Math.ceil(file.size / 1024);
    const currentStorageKB = Math.max(0, Number(user.storageUsed ?? 0));

    // Check storage limit (skip in dev mode)
    if (!IS_DEV_MODE && !canStoreMore(plan, currentStorageKB, fileSizeKB)) {
      return NextResponse.json(
        { error: "Storage limit reached", reason: "upgrade" },
        { status: 429 }
      );
    }

    // ── Attempt R2 upload ──
    let r2Key: string | null = null;
    let fileUrl: string | null = null;

    if (r2Configured) {
      try {
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        r2Key = generateFileKey("uploads", fileName);

        console.log("[Storage:Upload] Uploading to R2:", r2Key, `(${fileBuffer.length} bytes)`);
        const uploadResult = await uploadToR2(fileBuffer, r2Key, file.type || "application/octet-stream");
        fileUrl = uploadResult.url;

        console.log("[Storage:Upload] ✅ R2 upload success:", r2Key);
      } catch (r2Err) {
        const msg = r2Err instanceof Error ? r2Err.message : String(r2Err);
        console.error("[Storage:Upload] ⚠️ R2 upload failed, saving metadata-only:", msg);
        r2Key = null;
        fileUrl = null;
      }
    } else {
      console.log("[Storage:Upload] ⚠️ R2 not configured — saving metadata-only");
    }

    // ── Save history entry ──
    const entry = await db.history.create({
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

    // ── Update user storageUsed ──
    if (file.size > 0) {
      await db.user.update({
        where: { id: user.id },
        data: { storageUsed: { increment: fileSizeKB } },
      }).catch(() => {
        // Don't fail if increment fails
        console.warn("[Storage:Upload] Failed to update storageUsed");
      });
    }

    console.log("[Storage:Upload] ✅ Saved:", entry.id, r2Key ? "(with R2)" : "(metadata-only)");

    return NextResponse.json({
      entry,
      uploaded: !!r2Key,
      r2Key,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Storage:Upload] 💥", msg);
    return NextResponse.json({ error: "Upload failed", debug: msg }, { status: 500 });
  }
}
