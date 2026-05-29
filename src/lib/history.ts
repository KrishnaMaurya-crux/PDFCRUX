/**
 * History Module — Client-side functions for history management.
 *
 * Uses the API routes for server-side persistence.
 * Falls back gracefully if the user is not authenticated.
 *
 * CRITICAL: Auth headers are fetched from Supabase session (localStorage).
 * The token is sent via Authorization: Bearer <token> to the backend.
 *
 * FILE UPLOAD STRATEGY:
 * ─────────────────────
 * Primary: Presigned URL (browser → R2 directly, bypasses Vercel 4.5MB limit)
 * Fallback: Chunked base64 (for environments without CORS)
 *
 * Why presigned URLs?
 * - Vercel serverless has 4.5MB body limit
 * - Presigned URLs bypass Vercel entirely — file goes straight to R2
 * - Works for files of ANY size
 * - Requires R2 CORS configuration (AllowedOrigins: ["*"])
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
// Save history WITH file upload to R2
//
// STRATEGY: Presigned URL (primary) → Chunked base64 (fallback)
//
// PRIMARY — Presigned URL flow:
//   1. POST /api/storage/presign → get presigned PUT URL + r2Key
//   2. PUT file directly to R2 (bypasses Vercel entirely!)
//   3. POST /api/storage/confirm → update history with r2Key
//
// FALLBACK — Chunked base64:
//   If presigned URL fails (CORS issue), convert file to base64
//   chunks and upload through Vercel API routes.
// ─────────────────────────────────────────────────────────────────

async function uploadViaPresignedUrl(params: {
  fileData: Uint8Array | Blob;
  fileName: string;
  toolId: string;
  toolName: string;
  fileSize: number;
  headers: Record<string, string>;
}): Promise<boolean> {
  console.log("[History:Client] 🚀 Attempting presigned URL upload...");

  try {
    // STEP 1: Get presigned URL from server
    const presignRes = await fetch("/api/storage/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...params.headers },
      body: JSON.stringify({
        fileName: params.fileName,
        contentType: "application/pdf",
      }),
    });

    if (!presignRes.ok) {
      const errData = await presignRes.json().catch(() => ({}));
      console.warn("[History:Client] Presign failed:", presignRes.status, errData);
      return false;
    }

    const { uploadUrl, r2Key } = await presignRes.json();
    if (!uploadUrl || !r2Key) {
      console.warn("[History:Client] Presign returned invalid data");
      return false;
    }

    console.log("[History:Client] ✅ Got presigned URL, r2Key:", r2Key);

    // STEP 2: Upload file DIRECTLY to R2 using presigned URL
    let fileBody: Blob | Uint8Array;
    if (params.fileData instanceof Blob) {
      fileBody = params.fileData;
    } else {
      fileBody = new Blob([params.fileData], { type: "application/pdf" });
    }

    console.log("[History:Client] 📤 Uploading to R2 directly:", fileBody.size, "bytes");

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: fileBody,
      headers: {
        "Content-Type": "application/pdf",
      },
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => "");
      console.warn("[History:Client] R2 PUT failed:", uploadRes.status, errText);

      // If CORS error, this is likely a CORS configuration issue
      if (uploadRes.type === "opaque") {
        console.error("[History:Client] ❌ Opaque response — CORS is NOT configured on R2 bucket!");
        console.error("[History:Client] → Go to Cloudflare R2 → Settings → CORS Policy → Add rules");
      }

      return false;
    }

    console.log("[History:Client] ✅ File uploaded to R2 successfully!");

    // STEP 3: Confirm upload — update history with r2Key
    const confirmRes = await fetch("/api/storage/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...params.headers },
      body: JSON.stringify({
        r2Key,
        toolId: params.toolId,
        fileName: params.fileName,
        fileSize: params.fileSize,
      }),
    });

    if (!confirmRes.ok) {
      const errData = await confirmRes.json().catch(() => ({}));
      console.warn("[History:Client] Confirm failed:", confirmRes.status, errData);
      // File is on R2 but history not updated — not critical
      return true; // R2 upload succeeded, history update failed
    }

    console.log("[History:Client] ✅ Upload confirmed, r2Key:", r2Key);
    return true;
  } catch (err) {
    console.warn("[History:Client] Presigned URL upload error:", err instanceof Error ? err.message : err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// FALLBACK: Chunked base64 upload (for environments without CORS)
// ─────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per chunk (2MB raw → ~2.7MB base64, under 4.5MB)

async function uploadViaChunkedBase64(params: {
  fileData: Uint8Array | Blob;
  fileName: string;
  toolId: string;
  toolName: string;
  fileSize: number;
  resultSummary: string;
  headers: Record<string, string>;
}): Promise<boolean> {
  console.log("[History:Client] 🔄 Fallback: chunked base64 upload...");

  // Convert to Uint8Array
  let bytes: Uint8Array;
  if (params.fileData instanceof Blob) {
    const buffer = await params.fileData.arrayBuffer();
    bytes = new Uint8Array(buffer);
  } else {
    bytes = params.fileData;
  }

  const totalBytes = bytes.length;

  // For small files (< 2MB), use single-shot mode
  if (totalBytes < CHUNK_SIZE) {
    console.log("[History:Client] Single-shot upload:", params.fileName, `(${totalBytes} bytes)`);
    const base64 = uint8ToBase64(bytes);
    const res = await fetch("/api/storage/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...params.headers },
      body: JSON.stringify({
        fileBase64: base64,
        toolId: params.toolId,
        toolName: params.toolName,
        fileName: params.fileName,
        fileSize: params.fileSize,
        resultSummary: params.resultSummary,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.uploaded) {
      console.log("[History:Client] ✅ Single-shot upload success:", params.fileName);
      return true;
    }
    console.warn("[History:Client] Single-shot failed:", res.status, data);
    return false;
  }

  // For large files, use chunked mode
  const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);
  const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  console.log(`[History:Client] Chunked upload: ${totalBytes} bytes → ${totalChunks} chunks`);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalBytes);
    const chunkBytes = bytes.slice(start, end);
    const chunkBase64 = uint8ToBase64(chunkBytes);

    console.log(`[History:Client] Sending chunk ${i + 1}/${totalChunks} (${chunkBytes.length} bytes)`);

    const res = await fetch("/api/storage/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...params.headers },
      body: JSON.stringify({
        sessionId,
        chunk: chunkBase64,
        chunkIndex: i,
        totalChunks,
        toolId: params.toolId,
        toolName: params.toolName,
        fileName: params.fileName,
        fileSize: params.fileSize,
        resultSummary: params.resultSummary,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.warn(`[History:Client] Chunk ${i + 1} failed:`, res.status, errData);
      return false;
    }

    const chunkData = await res.json().catch(() => ({}));
    console.log(`[History:Client] Chunk ${i + 1}/${totalChunks} acknowledged`);

    if (i === totalChunks - 1) {
      if (chunkData.uploaded) {
        console.log("[History:Client] ✅ All chunks uploaded! R2 key:", chunkData.r2Key);
        return true;
      }
      console.warn("[History:Client] ⚠️ All chunks sent but R2 upload failed:", chunkData);
      return false;
    }
  }

  return false;
}

// Efficient base64 conversion
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

// ─────────────────────────────────────────────────────────────────
// MAIN: saveHistoryWithFile — tries presigned URL first, falls back
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

    console.log("[History:Client] saveHistoryWithFile() →", params.fileName, `(${params.fileSize} bytes)`);

    // TRY 1: Presigned URL (best — bypasses Vercel, works for any size)
    const presignedOk = await uploadViaPresignedUrl({
      fileData: params.fileData,
      fileName: params.fileName,
      toolId: params.toolId,
      toolName: params.toolName,
      fileSize: params.fileSize,
      headers,
    });

    if (presignedOk) {
      console.log("[History:Client] ✅ Presigned URL upload succeeded!");
      return true;
    }

    console.warn("[History:Client] Presigned URL failed, trying chunked fallback...");

    // TRY 2: Chunked base64 (fallback — goes through Vercel)
    return await uploadViaChunkedBase64({
      ...params,
      headers,
    });
  } catch (err) {
    console.warn("[History:Client] saveHistoryWithFile() error:", err instanceof Error ? err.message : err);
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
