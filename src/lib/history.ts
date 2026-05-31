/**
 * History Module — Client-side functions for history management.
 *
 * Uses the API routes for server-side persistence.
 * Falls back gracefully if the user is not authenticated.
 *
 * FILE UPLOAD STRATEGY:
 * ─────────────────────
 * MANUAL Presigned URL — browser uploads DIRECTLY to R2.
 *
 * WHY manual signing?
 *   AWS SDK v3's getSignedUrl() adds extra query params (x-id=PutObject,
 *   x-amz-checksum-crc32) that break R2's CORS preflight handling.
 *   Our manual AWS4 signing produces a CLEAN URL with only standard
 *   signing params — R2 CORS handles it perfectly.
 *
 * WHY no Content-Type in PUT request?
 *   Content-Type: application/pdf is a "non-simple" header.
 *   It triggers a CORS preflight (OPTIONS) request before the actual PUT.
 *   R2's CORS preflight handling is unreliable.
 *   By NOT setting Content-Type, the browser sends a "simple" PUT
 *   request directly — NO preflight, NO OPTIONS, just PUT → 200 OK.
 *
 * Flow:
 *   1. POST /api/storage/presign → get manual presigned PUT URL + r2Key
 *   2. PUT file directly to R2 (bypasses Vercel entirely!)
 *   3. POST /api/storage/confirm → update history with r2Key
 *
 * Requirements:
 *   - R2 bucket must have CORS enabled:
 *     AllowedOrigins: ["*"], AllowedMethods: ["PUT", "GET", "HEAD"]
 *   - No @aws-sdk/s3-request-presigner needed (manual signing)
 */

import { supabase } from "./supabase";

export interface HistoryEntry {
  id: string;
  userId: string;
  toolId: string;
  toolName: string;
  fileName: string;
  fileSize: number;
  fileUrl?: string | null;
  r2Key?: string | null;
  resultSummary: string;
  downloaded: boolean;
  createdAt: string;
}

export interface StorageUsage {
  plan: string;
  planLabel: string;
  planPrice: string;
  storageUsed: number;
  storageUsedFormatted: string;
  storageLimit: number;
  storageLimitFormatted: string;
  storagePercent: number;
  downloadCount: number;
  downloadLimit: number;
  historyCount: number;
  historyLimit: number;
  features: string[];
  isDevMode: boolean;
}

const TOOL_META: Record<string, { color: string; bgColor: string; icon: string }> = {
  "pdf-summary": { color: "text-amber-600", bgColor: "bg-amber-50", icon: "✨" },
  "pdf-notes": { color: "text-emerald-600", bgColor: "bg-emerald-50", icon: "📝" },
  "pdf-ocr": { color: "text-violet-600", bgColor: "bg-violet-50", icon: "🔍" },
  "resume-checker": { color: "text-blue-600", bgColor: "bg-blue-50", icon: "📋" },
};

// ─────────────────────────────────────────────────────────────────
// Get Bearer token from Supabase session (stored in localStorage)
// ─────────────────────────────────────────────────────────────────

export async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      console.log("[History:Client] ✅ Token found, length:", session.access_token.length);
      return { Authorization: `Bearer ${session.access_token}` };
    }
    console.log("[History:Client] ⚠️ No active session — no auth header");
  } catch (err) {
    console.warn("[History:Client] getAuthHeaders() error:", err);
  }
  return {};
}

// ─────────────────────────────────────────────────────────────────
// Save history entry (metadata only — no file)
// ─────────────────────────────────────────────────────────────────

export async function saveHistory(params: {
  toolId: string;
  toolName: string;
  fileName: string;
  fileSize: number;
  resultSummary: string;
}): Promise<boolean> {
  try {
    const headers = await getAuthHeaders();
    if (!headers["Authorization"]) {
      console.log("[History:Client] saveHistory() skipped — not authenticated");
      return false;
    }

    console.log("[History:Client] saveHistory() POST →", params.toolId);
    const res = await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.warn("[History:Client] saveHistory() failed:", res.status, errData);
      return false;
    }

    console.log("[History:Client] saveHistory() ✅ success");
    return true;
  } catch (err) {
    console.warn("[History:Client] saveHistory() network error:", err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// Save history WITH file upload to R2 — Presigned URL approach
//
// STEP 1: POST /api/storage/presign → get manual presigned PUT URL + r2Key
// STEP 2: PUT file DIRECTLY to R2 (no Content-Type = no CORS preflight!)
// STEP 3: POST /api/storage/confirm → update history entry with r2Key
//
// CRITICAL: The PUT request does NOT include Content-Type header.
// This makes it a "simple" request — browser sends PUT directly,
// no OPTIONS preflight needed. R2 just needs to return
// Access-Control-Allow-Origin on the PUT response.
// ─────────────────────────────────────────────────────────────────

export async function saveHistoryWithFile(params: {
  fileData: Uint8Array | Blob;
  toolId: string;
  toolName: string;
  fileName: string;
  fileSize: number;
  resultSummary: string;
}): Promise<boolean> {
  try {
    const headers = await getAuthHeaders();
    if (!headers["Authorization"]) {
      console.log("[History:Client] saveHistoryWithFile() skipped — not authenticated");
      return false;
    }

    console.log("[History:Client] 🚀 Uploading to R2:", params.fileName, `(${params.fileSize} bytes)`);

    // ── STEP 1: Get presigned URL from server ──
    console.log("[History:Client] Step 1: Getting presigned URL...");
    const presignRes = await fetch("/api/storage/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        fileName: params.fileName,
      }),
    });

    if (!presignRes.ok) {
      const errData = await presignRes.json().catch(() => ({}));
      console.error("[History:Client] ❌ Presign failed:", presignRes.status, errData);
      return false;
    }

    const { uploadUrl, r2Key } = await presignRes.json();
    if (!uploadUrl || !r2Key) {
      console.error("[History:Client] ❌ Invalid presign response");
      return false;
    }

    console.log("[History:Client] ✅ Got presigned URL, r2Key:", r2Key);
    console.log("[History:Client] 📋 URL:", uploadUrl.substring(0, 200) + "...");

    // Verify URL is clean (no x-id, no checksums)
    if (uploadUrl.includes("x-id=") || uploadUrl.includes("checksum")) {
      console.error("[History:Client] ❌ BAD URL — contains x-id or checksum! This should NOT happen with manual signing.");
    } else {
      console.log("[History:Client] ✅ URL is CLEAN — no x-id, no checksums");
    }

    // ── STEP 2: Upload file DIRECTLY to R2 ──
    // CRITICAL: Convert to Uint8Array and do NOT set Content-Type.
    // Uint8Array body + no custom headers = "simple" request.
    // Browser sends PUT directly WITHOUT preflight OPTIONS request.
    // R2 just needs Access-Control-Allow-Origin on the PUT response.
    console.log("[History:Client] Step 2: Uploading to R2 directly (no preflight)...");

    let bytes: Uint8Array;
    if (params.fileData instanceof Blob) {
      bytes = new Uint8Array(await params.fileData.arrayBuffer());
    } else {
      bytes = params.fileData;
    }

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: bytes,
      // NO Content-Type header! This prevents CORS preflight.
      // R2 will store the object without a specific content type,
      // but our download route sets Content-Type based on file extension.
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => "");
      console.error("[History:Client] ❌ R2 PUT failed:", uploadRes.status, errText);

      // If presigned URL fails, fall back to chunked upload
      console.log("[History:Client] 📦 Falling back to chunked upload...");
      return await chunkedUploadFallback(params, headers);
    }

    console.log("[History:Client] ✅ File uploaded to R2!");

    // ── STEP 3: Confirm upload — update history with r2Key ──
    console.log("[History:Client] Step 3: Confirming upload...");
    const confirmRes = await fetch("/api/storage/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        r2Key,
        toolId: params.toolId,
        fileName: params.fileName,
        fileSize: params.fileSize,
      }),
    });

    if (!confirmRes.ok) {
      const errData = await confirmRes.json().catch(() => ({}));
      console.warn("[History:Client] ⚠️ Confirm failed:", confirmRes.status, errData);
    } else {
      console.log("[History:Client] ✅ Upload confirmed!");
    }

    console.log("[History:Client] 🎉 Upload complete:", r2Key);
    return true;
  } catch (err) {
    console.error("[History:Client] saveHistoryWithFile() error:", err instanceof Error ? err.message : err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// CHUNKED UPLOAD FALLBACK
//
// Only used if presigned URL fails (shouldn't happen with manual signing).
// Splits file into 2MB chunks, sends each as base64 JSON POST.
// ─────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per chunk

function uint8ToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, bytes.length))));
  }
  return btoa(chunks.join(""));
}

async function chunkedUploadFallback(
  params: {
    fileData: Uint8Array | Blob;
    toolId: string;
    toolName: string;
    fileName: string;
    fileSize: number;
    resultSummary: string;
  },
  headers: Record<string, string>
): Promise<boolean> {
  try {
    let bytes: Uint8Array;
    if (params.fileData instanceof Blob) {
      bytes = new Uint8Array(await params.fileData.arrayBuffer());
    } else {
      bytes = params.fileData;
    }

    const totalChunks = Math.ceil(bytes.length / CHUNK_SIZE);
    const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    console.log(`[History:Client] 📦 Chunked fallback: ${totalChunks} chunks`);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, bytes.length);
      const chunkBytes = bytes.slice(start, end);
      const chunkBase64 = uint8ToBase64(chunkBytes);

      const res = await fetch("/api/storage/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          sessionId,
          chunkIndex: i,
          totalChunks,
          chunk: chunkBase64,
          fileName: params.fileName,
          toolId: params.toolId,
          toolName: params.toolName,
          resultSummary: params.resultSummary,
        }),
      });

      if (!res.ok) {
        console.error(`[History:Client] ❌ Chunk ${i + 1} failed`);
        return false;
      }

      const result = await res.json();
      if (result.uploaded) {
        console.log(`[History:Client] ✅ Chunked upload done! r2Key: ${result.r2Key}`);
      }
    }

    return true;
  } catch (err) {
    console.error("[History:Client] Chunked fallback error:", err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// Get history entries — returns { history, authenticated }
// ─────────────────────────────────────────────────────────────────

export async function getHistory(): Promise<{
  history: HistoryEntry[];
  authenticated: boolean;
  debug?: string;
}> {
  try {
    const headers = await getAuthHeaders();
    const hasAuth = !!headers["Authorization"];

    console.log("[History:Client] getHistory() GET, hasAuth:", hasAuth);

    const res = await fetch("/api/history", {
      headers,
    });

    console.log("[History:Client] getHistory() response status:", res.status);

    if (res.status === 401) {
      console.log("[History:Client] → 401 Not authenticated");
      return { history: [], authenticated: false };
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const debugMsg = (errData as Record<string, string>).debug || (errData as Record<string, string>).error || `HTTP ${res.status}`;
      console.warn("[History:Client] →", res.status, "error:", errData);
      return { history: [], authenticated: hasAuth, debug: debugMsg };
    }

    const data = await res.json();
    console.log("[History:Client] ✅ Received", (data.history || []).length, "entries");
    return { history: data.history || [], authenticated: true };
  } catch (err) {
    console.warn("[History:Client] getHistory() network error:", err);
    return { history: [], authenticated: true };
  }
}

// ─────────────────────────────────────────────────────────────────
// Delete history entry
// ─────────────────────────────────────────────────────────────────

export async function deleteHistoryItem(id: string): Promise<boolean> {
  try {
    const headers = await getAuthHeaders();
    if (!headers["Authorization"]) return false;

    const res = await fetch(`/api/history?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers,
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// Mark entry as downloaded
// ─────────────────────────────────────────────────────────────────

export async function markDownloaded(id: string): Promise<boolean> {
  try {
    const headers = await getAuthHeaders();
    if (!headers["Authorization"]) return false;

    const res = await fetch("/api/history", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ id, downloaded: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// Display helpers
// ─────────────────────────────────────────────────────────────────

export function getToolMeta(toolId: string) {
  return (
    TOOL_META[toolId] || { color: "text-gray-600", bgColor: "bg-gray-50", icon: "📄" }
  );
}

export function formatHistoryDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// ─────────────────────────────────────────────────────────────────
// Get storage usage info
// ─────────────────────────────────────────────────────────────────

export async function getStorageUsage(): Promise<StorageUsage | null> {
  try {
    const headers = await getAuthHeaders();
    if (!headers["Authorization"]) return null;

    const res = await fetch("/api/storage/usage", { headers });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// Get download URL for a history entry
// ─────────────────────────────────────────────────────────────────

export function getDownloadUrl(historyId: string): string {
  return `/api/storage/download?id=${encodeURIComponent(historyId)}`;
}
