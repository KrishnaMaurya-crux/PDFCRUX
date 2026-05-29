import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getPlanConfig, canStoreMore, IS_DEV_MODE } from "@/lib/plan-config";

// ─────────────────────────────────────────────────────────────────
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// POST /api/storage/upload
//
// Accepts file as base64 in JSON body. Two modes:
//
// MODE 1 — Chunked (large files):
//   { sessionId, chunk (base64), chunkIndex, totalChunks, toolId, ... }
//   Client splits file into 3MB chunks, sends each POST.
//   On last chunk, server reassembles + uploads to R2.
//
// MODE 2 — Single-shot (small files < 3MB):
//   { fileBase64, toolId, toolName, fileName, fileSize, resultSummary }
//
// Both bypass Vercel's 4.5MB body limit because we use JSON
// with base64 chunks instead of FormData.
// ─────────────────────────────────────────────────────────────────

type R2UploadFn = (file: Buffer, key: string, contentType: string) => Promise<{ key: string; url: string; size: number }>;
type R2KeyGenFn = (folder: string, fileName: string) => string;

async function getR2Helpers() {
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return null;
  }
  const r2 = await import("@/lib/r2");
  return {
    uploadToR2: r2.uploadToR2 as R2UploadFn,
    generateFileKey: r2.generateFileKey as R2KeyGenFn,
  };
}

async function getUser(req: Request) {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return null;
  try {
    const { data, error } = await supabase.auth.getUser(h.slice(7).trim());
    return (error || !data.user) ? null : data.user;
  } catch { return null; }
}

// Chunk storage (server-side)
const chunks = new Map<string, Buffer[]>();

export async function POST(req: Request) {
  if (!isSupabaseConfigured) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const su = await getUser(req);
  if (!su?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({ where: { email: su.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const plan = (user.plan as string) || "free";

  try {
    const body = await req.json();

    // ── CHUNKED MODE ──
    if (body.sessionId && body.chunk !== undefined) {
      const buf = Buffer.from(body.chunk, "base64");
      if (!chunks.has(body.sessionId)) chunks.set(body.sessionId, []);
      const arr = chunks.get(body.sessionId)!;
      arr[body.chunkIndex] = buf;

      console.log(`[Upload] Chunk ${body.chunkIndex + 1}/${body.totalChunks} (${buf.length}B)`);

      if (body.chunkIndex === body.totalChunks - 1) {
        const full = Buffer.concat(arr);
        chunks.delete(body.sessionId);
        return await finishUpload(user, plan, body, full);
      }
      return NextResponse.json({ ok: true, chunk: body.chunkIndex });
    }

    // ── SINGLE-SHOT MODE ──
    if (body.fileBase64) {
      const buf = Buffer.from(body.fileBase64, "base64");
      return await finishUpload(user, plan, body, buf);
    }

    return NextResponse.json({ error: "No data" }, { status: 400 });
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    console.error("[Upload] 💥", m);
    return NextResponse.json({ error: m }, { status: 500 });
  }
}

async function finishUpload(user: { id: string; storageUsed?: number }, plan: string, body: Record<string, unknown>, buf: Buffer) {
  const { toolId, toolName, fileName, fileSize, resultSummary } = body as {
    toolId: string; toolName: string; fileName: string; fileSize?: number; resultSummary?: string;
  };
  if (!toolId || !toolName || !fileName) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const sizeKB = Math.ceil(buf.length / 1024);
  if (!IS_DEV_MODE && !canStoreMore(plan, Math.max(0, Number(user.storageUsed ?? 0)), sizeKB)) {
    return NextResponse.json({ error: "Storage limit" }, { status: 429 });
  }

  const r2 = await getR2Helpers();
  let r2Key: string | null = null;
  let fileUrl: string | null = null;

  if (r2) {
    try {
      r2Key = r2.generateFileKey("uploads", fileName);
      const res = await r2.uploadToR2(buf, r2Key, "application/pdf");
      fileUrl = res.url;
      console.log("[Upload] ✅ R2:", r2Key, `(${buf.length}B)`);
    } catch (e) {
      console.error("[Upload] ❌ R2 failed:", e instanceof Error ? e.message : e);
      r2Key = null;
    }
  }

  if (!r2Key) return NextResponse.json({ uploaded: false, r2Key: null });

  // Update most recent matching history entry
  const entry = await db.history.findFirst({
    where: { userId: user.id, toolId, fileName },
    orderBy: { createdAt: "desc" },
  });

  if (entry) {
    await db.history.update({ where: { id: entry.id }, data: { r2Key, fileUrl } });
  } else {
    await db.history.create({
      data: { userId: user.id, toolId, toolName, fileName, fileSize: buf.length, resultSummary: resultSummary || "", r2Key, fileUrl },
    });
  }

  await db.user.update({ where: { id: user.id }, data: { storageUsed: { increment: sizeKB } } }).catch(() => {});

  return NextResponse.json({ uploaded: true, r2Key });
}
