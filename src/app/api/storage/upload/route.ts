import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// POST /api/storage/upload
//
// Stateless chunked upload to R2.
// Client sends base64 chunks → server stores in R2 temp objects.
// Last chunk → server reassembles all → uploads final file → cleans up.
// ─────────────────────────────────────────────────────────────────

async function getR2() {
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return null;
  }
  const r2 = await import("@/lib/r2");
  return r2;
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

  try {
    const body = await req.json();

    // ── CHUNKED MODE ──
    if (body.sessionId && body.chunk !== undefined && body.chunkIndex !== undefined) {
      const r2 = await getR2();
      if (!r2) return NextResponse.json({ error: "R2 not configured" }, { status: 503 });

      const buf = Buffer.from(body.chunk, "base64");
      const chunkIdx: number = body.chunkIndex;
      const totalChunks: number = body.totalChunks;
      const sessionId: string = body.sessionId;

      // Store chunk as temp R2 object
      const tempKey = `temp/${sessionId}/${chunkIdx}`;
      await r2.uploadToR2(buf, tempKey, "application/octet-stream");

      console.log(`[Upload] Chunk ${chunkIdx + 1}/${totalChunks} → ${tempKey} (${buf.length}B)`);

      // Last chunk → reassemble all
      if (chunkIdx === totalChunks - 1) {
        console.log(`[Upload] 🏁 Last chunk! Reassembling ${totalChunks} chunks...`);

        const buffers: Buffer[] = [];
        const tempKeys: string[] = [];

        for (let i = 0; i < totalChunks; i++) {
          const key = `temp/${sessionId}/${i}`;
          tempKeys.push(key);

          let data: Buffer | null = null;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              data = await r2.downloadFromR2(key);
              break;
            } catch (e) {
              console.warn(`[Upload] Chunk ${i} retry ${attempt}:`, e instanceof Error ? e.message : e);
              if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt));
            }
          }

          if (data) buffers.push(data);
          else console.error(`[Upload] ❌ Chunk ${i} failed after 3 retries`);
        }

        if (buffers.length === 0) {
          return NextResponse.json({ uploaded: false, error: "No chunks reassembled" }, { status: 500 });
        }

        const full = Buffer.concat(buffers);
        console.log(`[Upload] ✅ Reassembled ${buffers.length}/${totalChunks} → ${full.length}B`);

        // Upload final file
        const fileName: string = body.fileName || "output.pdf";
        const r2Key = r2.generateFileKey("uploads", fileName);
        const publicDomain = process.env.R2_PUBLIC_DOMAIN || "";
        const fileUrl = publicDomain
          ? `${publicDomain}/${r2Key}`
          : `r2://${process.env.R2_BUCKET_NAME}/${r2Key}`;

        await r2.uploadToR2(full, r2Key, "application/pdf");
        console.log(`[Upload] ✅ Final file → ${r2Key}`);

        // Clean up temp objects
        for (const key of tempKeys) {
          r2.deleteFromR2(key).catch(() => {});
        }

        // Update history entry
        const toolId: string = body.toolId;
        const toolName: string = body.toolName;
        const fileSize = full.length;
        const resultSummary: string = body.resultSummary || "";

        if (toolId && toolName && fileName) {
          const entry = await db.history.findFirst({
            where: { userId: user.id, toolId, fileName },
            orderBy: { createdAt: "desc" },
          });

          if (entry) {
            await db.history.update({ where: { id: entry.id }, data: { r2Key, fileUrl } });
          } else {
            await db.history.create({
              data: { userId: user.id, toolId, toolName, fileName, fileSize, resultSummary, r2Key, fileUrl },
            });
          }

          // Update storage used
          const sizeKB = Math.ceil(fileSize / 1024);
          await db.user.update({
            where: { id: user.id },
            data: { storageUsed: { increment: sizeKB } },
          }).catch(() => {});
        }

        return NextResponse.json({ uploaded: true, r2Key, fileUrl });
      }

      return NextResponse.json({ ok: true, chunkIndex: chunkIdx });
    }

    return NextResponse.json({ error: "No data" }, { status: 400 });
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    console.error("[Upload] 💥", m);
    return NextResponse.json({ error: m }, { status: 500 });
  }
}
