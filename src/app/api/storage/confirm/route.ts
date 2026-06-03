import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// POST /api/storage/confirm
//
// Called AFTER client uploads file to R2 (via presigned URL or chunked).
// Updates the most recent matching history entry with r2Key + public fileUrl.
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

    // Build PUBLIC file URL using R2_PUBLIC_DOMAIN
    const publicDomain = process.env.R2_PUBLIC_DOMAIN || "";
    const fileUrl = publicDomain
      ? `${publicDomain}/${r2Key}`
      : `r2://${process.env.R2_BUCKET_NAME}/${r2Key}`;

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
        data: { r2Key, fileUrl },
      });
      console.log("[Storage:Confirm] ✅ Updated:", recentEntry.id, "fileUrl:", fileUrl);
    } else {
      console.log("[Storage:Confirm] ⚠️ No matching entry for", { toolId, fileName });
    }

    return NextResponse.json({ success: true, r2Key, fileUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Storage:Confirm] 💥", msg);
    return NextResponse.json({ error: "Confirm failed", debug: msg }, { status: 500 });
  }
}
