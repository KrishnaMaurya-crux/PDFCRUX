import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { uploadToR2, generateFileKey } from "@/lib/r2";
import { getPlanConfig, IS_DEV_MODE } from "@/lib/plan-config";

// ─────────────────────────────────────────────────────────────────
// Force Node.js runtime — R2 + Prisma require it
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

async function findOrCreateUser(email: string) {
  let user = await db.user.findUnique({ where: { email } });
  if (user) return user;
  return db.user.create({ data: { email, name: email.split("@")[0] || "Unknown" } });
}

// ─────────────────────────────────────────────────────────────────
// POST /api/storage/upload
// FormData: file, toolId, toolName, fileName, resultSummary
//
// IMPORTANT: This route has a fallback — if R2 is not configured,
// it still saves history metadata-only (no fileUrl/r2Key).
// This ensures history ALWAYS works, with or without R2.
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
    process.env.R2_SECRET_ACCESS_KEY
  );

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const toolId = formData.get("toolId") as string;
    const toolName = formData.get("toolName") as string;
    const fileName = formData.get("fileName") as string;
    const resultSummary = (formData.get("resultSummary") as string) || "";

    if (!toolId || !toolName || !fileName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const fileSize = file ? file.size : 0;

    // ── FALLBACK: R2 NOT configured → save metadata-only history ──
    if (!r2Configured) {
      console.log("[Storage:Upload] ⚠️ R2 not configured — saving metadata-only history");
      const user = await findOrCreateUser(supabaseUser.email);
      const entry = await db.history.create({
        data: {
          userId: user.id,
          toolId,
          toolName,
          fileName,
          fileSize,
          resultSummary,
        },
      });
      console.log("[Storage:Upload] ✅ Metadata-only saved:", entry.id);
      return NextResponse.json({ success: true, entry, mode: "metadata-only" });
    }

    // ── FULL FLOW: R2 IS configured ──
    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const user = await findOrCreateUser(supabaseUser.email);
    const plan = (user.plan as "free" | "premium" | "enterprise") || "free";

    // Check storage limit
    const fileKB = Math.ceil(fileSize / 1024);
    if (!IS_DEV_MODE) {
      const config = getPlanConfig(plan);
      const currentStorage = user.storageUsed ?? 0;
      if (config.storageLimit > 0 && currentStorage + fileKB > config.storageLimit) {
        console.log("[Storage:Upload] ❌ Storage limit exceeded");
        return NextResponse.json({
          error: "Storage limit reached",
          reason: "upgrade",
          plan,
          storageUsed: currentStorage,
          storageLimit: config.storageLimit,
        }, { status: 429 });
      }
    }

    // Upload to R2
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const r2Key = generateFileKey(`history/${user.id}`, fileName);

    console.log("[Storage:Upload] R2 upload:", r2Key, `(${fileKB} KB)`);
    const uploadResult = await uploadToR2(fileBuffer, r2Key, file.type || "application/octet-stream");

    // Save history entry with file reference
    const entry = await db.history.create({
      data: {
        userId: user.id,
        toolId,
        toolName,
        fileName,
        fileSize,
        fileUrl: uploadResult.url,
        r2Key: uploadResult.key,
        resultSummary,
      },
    });

    // Update user storage used
    await db.user.update({
      where: { id: user.id },
      data: { storageUsed: { increment: fileKB } },
    });

    const updatedUser = await db.user.findUnique({ where: { id: user.id } });

    console.log("[Storage:Upload] ✅", entry.id, `Storage: ${updatedUser?.storageUsed || 0} KB`);

    return NextResponse.json({
      success: true,
      entry,
      storageUsed: updatedUser?.storageUsed || 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Storage:Upload] 💥", msg);

    // FALLBACK: If R2 upload crashes, try metadata-only save
    try {
      const clonedReq = req.clone();
      const formData = await clonedReq.formData();
      const toolId = formData.get("toolId") as string;
      const toolName = formData.get("toolName") as string;
      const fileName = formData.get("fileName") as string;
      const resultSummary = (formData.get("resultSummary") as string) || "";
      const fileSize = (formData.get("file") as File | null)?.size || 0;

      if (toolId && toolName && fileName) {
        const user = await findOrCreateUser(supabaseUser.email);
        const entry = await db.history.create({
          data: { userId: user.id, toolId, toolName, fileName, fileSize, resultSummary },
        });
        console.log("[Storage:Upload] ✅ Fallback metadata-only saved:", entry.id);
        return NextResponse.json({ success: true, entry, mode: "fallback" });
      }
    } catch (fallbackErr) {
      console.error("[Storage:Upload] Fallback also failed:", fallbackErr);
    }

    return NextResponse.json({ error: "Upload failed", debug: msg }, { status: 500 });
  }
}
