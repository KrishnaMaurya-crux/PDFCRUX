/**
 * History Module — Client-side functions for history management.
 *
 * Uses the API routes for server-side persistence.
 * Falls back gracefully if the user is not authenticated.
 *
 * CRITICAL: Auth headers are fetched from Supabase session (localStorage).
 * The token is sent via Authorization: Bearer <token> to the backend.
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
// Save history entry
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
// Use this for tools that produce downloadable files
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
      return false;
    }

    console.log("[History:Client] saveHistoryWithFile() →", params.fileName);

    // Create FormData
    const file = params.fileData instanceof Blob
      ? params.fileData
      : new Blob([params.fileData]);
    const formData = new FormData();
    formData.append("file", file, params.fileName);
    formData.append("toolId", params.toolId);
    formData.append("toolName", params.toolName);
    formData.append("fileName", params.fileName);
    formData.append("resultSummary", params.resultSummary);

    const res = await fetch("/api/storage/upload", {
      method: "POST",
      headers, // No Content-Type — browser sets it with boundary for FormData
      body: formData,
    });

    if (!res.ok) {
      // R2 upload failed — that's OK, metadata was already saved by caller
      console.log("[History:Client] saveHistoryWithFile() → upload skipped (metadata already saved)");
      return false;
    }

    console.log("[History:Client] saveHistoryWithFile() ✅ uploaded to R2");
    return true;
  } catch (err) {
    // Network error or similar — metadata was already saved by caller
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
    // Get auth headers (reads Supabase session from localStorage)
    const headers = await getAuthHeaders();
    const hasAuth = !!headers["Authorization"];

    console.log("[History:Client] getHistory() GET, hasAuth:", hasAuth);

    const res = await fetch("/api/history", {
      headers,
    });

    console.log("[History:Client] getHistory() response status:", res.status);

    // 401 = not authenticated
    if (res.status === 401) {
      console.log("[History:Client] → 401 Not authenticated");
      return { history: [], authenticated: false };
    }

    // Server error — capture debug message for UI
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
