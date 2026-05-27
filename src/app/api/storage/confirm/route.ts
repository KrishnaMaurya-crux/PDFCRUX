import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// POST /api/storage/confirm
//
// Called AFTER client uploads file directly to R2 via presigned URL.
// This updates the most recent matching history entry with r2Key.
// No file data passes through Vercel — only a tiny JSON with r2Key.
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
    const { r2Key, toolId, fileName } = body;

    if (!r2Key || !toolId || !fileName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Find the most recent matching history entry and update with r2Key
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
          fileUrl: `r2://${process.env.R2_BUCKET_NAME}/${r2Key}`,
        },
      });
      console.log("[Storage:Confirm] ✅ Updated entry:", recentEntry.id, "with r2Key:", r2Key);
    } else {
      console.log("[Storage:Confirm] ⚠️ No matching history entry found for", { toolId, fileName });
    }

    return NextResponse.json({ success: true, r2Key });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Storage:Confirm] 💥", msg);
    return NextResponse.json({ error: "Confirm failed", debug: msg }, { status: 500 });
  }
}
