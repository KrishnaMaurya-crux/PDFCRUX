import { NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// Lazy R2 import — only loads when actually called
// ─────────────────────────────────────────────────────────────────

async function getR2Presign() {
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return null;
  }
  const r2 = await import("@/lib/r2");
  return {
    getPresignedUploadUrl: r2.getPresignedUploadUrl,
    generateFileKey: r2.generateFileKey,
    BUCKET_NAME: r2.BUCKET_NAME,
  };
}

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
// POST /api/storage/presign
//
// Returns a presigned PUT URL that the client can use to upload
// directly to R2 — bypassing Vercel's 4.5MB body limit.
//
// Request body (JSON):
//   { fileName: string, contentType?: string }
//
// Response:
//   { uploadUrl: string, r2Key: string }
// ─────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const user = await getUserFromRequest(req);
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const r2 = await getR2Presign();
  if (!r2) {
    return NextResponse.json({ error: "R2 not configured" }, { status: 503 });
  }

  try {
    const body = await req.json();
    const { fileName, contentType } = body;

    if (!fileName) {
      return NextResponse.json({ error: "Missing fileName" }, { status: 400 });
    }

    const r2Key = r2.generateFileKey("uploads", fileName);
    const uploadUrl = await r2.getPresignedUploadUrl(r2Key, contentType || "application/octet-stream");

    console.log("[Storage:Presign] Generated presigned URL for:", r2Key);
    console.log("[Storage:Presign] URL preview:", uploadUrl.substring(0, 120) + "...");

    return NextResponse.json({ uploadUrl, r2Key });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Storage:Presign] 💥", msg);
    return NextResponse.json({ error: "Failed to generate presigned URL", debug: msg }, { status: 500 });
  }
}
