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
//   Each chunk is stored as a TEMP R2 object: temp/{sessionId}/{index}
//   On last chunk: all temps are downloaded, combined, final uploaded, temps deleted.
//   This is STATELESS — works across multiple Vercel instances!
//
// MODE 2 — Single-shot (small files < 2MB):
//   { fileBase64, toolId, toolName, fileName, fileSize, resultSummary }
//
// Both use JSON body (NOT FormData) to stay under Vercel's 4.5MB limit.
// ─────────────────────────────────────────────────────────────────

type R2UploadFn = (file: Buffer, key: string, contentType: string) => Promise<{ key: string; url: string; size: number }>;
type R2KeyGenFn = (folder: string, fileName: string) => string;
type R2ListFn = (prefix?: string, maxKeys?: number) => Promise<{ objects: { key: string; size: number }[] }>;
type R2DownloadFn = (key: string) => Promise<Buffer>;
type R2DeleteFn = (key: string) => Promise<void>;

async function getR2Helpers() {
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return null;
  }
  const r2 = await import("@/lib/r2");
  return {
    uploadToR2: r2.uploadToR2 as R2UploadFn,
    generateFileKey: r2.generateFileKey as R2KeyGenFn,
    listFromR2: r2.listFromR2 as R2ListFn,
    downloadFromR2: r2.downloadFromR2 as R2DownloadFn,
    deleteFromR2: r2.deleteFromR2 as R2DeleteFn,
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

export async function POST(req: Request) {
  if (!isSupabaseConfigured) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const su = await getUser(req);
  if (!su?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({ where: { email: su.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const plan = (user.plan as string) || "free";

  try {
    const body = await req.json();

    // ── CHUNKED MODE — stateless (chunks stored in R2 temp objects) ──
    if (body.sessionId && body.chunk !== undefined) {
      const r2 = await getR2Helpers();

      if (!r2) {
        return NextResponse.json({ error: "R2 not configured" }, { status: 503 });
      }

      const buf = Buffer.from(body.chunk, "base64");
      const tempKey = `temp/${body.sessionId}/${body.chunkIndex}`;

      console.log(`[Upload] Chunk ${body.chunkIndex + 1}/${body.totalChunks} → temp R2: ${tempKey} (${buf.length}B)`);

      // Store chunk as temp R2 object (stateless — survives across Vercel instances!)
      await r2.uploadToR2(buf, tempKey, "application/octet-stream");

      // If this is the LAST chunk, combine all and upload final file
      if (body.chunkIndex === body.totalChunks - 1) {
        console.log(`[Upload] Last chunk received! Combining ${body.totalChunks} chunks...`);

        const tempPrefix = `temp/${body.sessionId}/`;
        const tempObjects = await r2.listFromR2(tempPrefix, body.totalChunks + 10);

        // Sort by chunk index (extracted from key)
        const sortedObjects = tempObjects.objects.sort((a, b) => {
          const idxA = parseInt(a.key.split("/").pop() || "0");
          const idxB = parseInt(b.key.split("/").pop() || "0");
          return idxA - idxB;
        });

        // Download all chunks, delete temp objects, concatenate
        const buffers: Buffer[] = [];
        for (const obj of sortedObjects) {
          const data = await r2.downloadFromR2(obj.key);
          buffers.push(data);
          // Clean up temp object
          await r2.deleteFromR2(obj.key).catch(() => {});
        }

        const full = Buffer.concat(buffers);
        console.log(`[Upload] ✅ Combined ${buffers.length} chunks → ${full.length} bytes`);

        return await finishUpload(user, plan, body, full, r2);
      }

      return NextResponse.json({ ok: true, chunk: body.chunkIndex });
    }

    // ── SINGLE-SHOT MODE ──
    if (body.fileBase64) {
      const buf = Buffer.from(body.fileBase64, "base64");
      const r2 = await getR2Helpers();
      return await finishUpload(user, plan, body, buf, r2);
    }

    return NextResponse.json({ error: "No data" }, { status: 400 });
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    console.error("[Upload] 💥", m);
    return NextResponse.json({ error: m }, { status: 500 });
  }
}

async function finishUpload(
  user: { id: string; storageUsed?: number },
  plan: string,
  body: Record<string, unknown>,
  buf: Buffer,
  r2: { uploadToR2: R2UploadFn; generateFileKey: R2KeyGenFn } | null
) {
  const { toolId, toolName, fileName, fileSize, resultSummary } = body as {
    toolId: string; toolName: string; fileName: string; fileSize?: number; resultSummary?: string;
  };
  if (!toolId || !toolName || !fileName) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const sizeKB = Math.ceil(buf.length / 1024);
  if (!IS_DEV_MODE && !canStoreMore(plan, Math.max(0, Number(user.storageUsed ?? 0)), sizeKB)) {
    return NextResponse.json({ error: "Storage limit" }, { status: 429 });
  }

  if (!r2) {
    return NextResponse.json({ uploaded: false, r2Key: null, error: "R2 not configured" });
  }

  let r2Key: string | null = null;
  let fileUrl: string | null = null;

  try {
    r2Key = r2.generateFileKey("uploads", fileName);
    const res = await r2.uploadToR2(buf, r2Key, "application/pdf");
    fileUrl = res.url;
    console.log("[Upload] ✅ R2:", r2Key, `(${buf.length}B)`);
  } catch (e) {
    console.error("[Upload] ❌ R2 failed:", e instanceof Error ? e.message : e);
    r2Key = null;
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
