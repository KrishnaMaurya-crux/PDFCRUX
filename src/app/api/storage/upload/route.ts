import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { uploadToR2, generateFileKey } from "@/lib/r2";
import { getPlanConfig, canStoreMore, IS_DEV_MODE } from "@/lib/plan-config";

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

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const toolId = formData.get("toolId") as string;
    const toolName = formData.get("toolName") as string;
    const fileName = formData.get("fileName") as string;
    const resultSummary = (formData.get("resultSummary") as string) || "";

    if (!file || !toolId || !toolName || !fileName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const user = await findOrCreateUser(supabaseUser.email);
    const plan = (user.plan as "free" | "premium" | "enterprise") || "free";

    // Check storage limit
    const fileKB = Math.ceil(file.size / 1024);
    if (!IS_DEV_MODE) {
      const config = getPlanConfig(plan);
      if (config.storageLimit > 0 && user.storageUsed + fileKB > config.storageLimit) {
        console.log("[Storage:Upload] ❌ Storage limit exceeded");
        return NextResponse.json({
          error: "Storage limit reached",
          reason: "upgrade",
          plan,
          storageUsed: user.storageUsed,
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
        fileSize: file.size,
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
    return NextResponse.json({ error: "Upload failed", debug: msg }, { status: 500 });
  }
}
