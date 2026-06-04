import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// POST /api/storage/confirm
//
// Called AFTER client uploads file to R2 via presigned PUT URL.
// Updates the most recent matching history entry with r2Key.
// Also updates user's storageUsed with the file size.
//
// NO R2_PUBLIC_DOMAIN needed — downloads go through /api/storage/download
// proxy route which fetches directly from R2 using r2Key.
//
// Request body:
//   { r2Key: string, toolId: string, fileName: string, fileSize: number }
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

export async function POST(req: Request) {
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

    const body = await req.json();
    const { r2Key, toolId, fileName, fileSize } = body;

    if (!r2Key || !toolId || !fileName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Find the most recent matching history entry and update
    const recentEntry = await db.history.findFirst({
      where: {
        userId: user.id,
        toolId,
        fileName,
      },
      orderBy: { createdAt: "desc" },
    });

    if (recentEntry) {
      await db.history.update({
        where: { id: recentEntry.id },
        data: {
          r2Key,
          // Mark as stored — fileUrl is not used for public access.
          // Download goes through /api/storage/download proxy using r2Key.
          fileUrl: `r2://${process.env.R2_BUCKET_NAME}/${r2Key}`,
        },
      });
      console.log("[Storage:Confirm] ✅ Updated:", recentEntry.id, "r2Key:", r2Key);
    } else {
      console.log("[Storage:Confirm] ⚠️ No matching entry for", { toolId, fileName });
    }

    // Update user's storageUsed with the file size
    if (fileSize && fileSize > 0) {
      await db.user.update({
        where: { id: user.id },
        data: {
          storageUsed: { increment: fileSize },
        },
      });
      console.log("[Storage:Confirm] 📊 Storage +", fileSize, "bytes for user:", user.email);
    }

    return NextResponse.json({ success: true, r2Key });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Storage:Confirm] 💥", msg);
    return NextResponse.json({ error: "Confirm failed", debug: msg }, { status: 500 });
  }
}
