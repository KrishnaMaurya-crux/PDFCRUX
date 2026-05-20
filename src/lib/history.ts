/**
 * History Module — Client-side functions for history management.
 *
 * Uses the API routes for server-side persistence.
 * Falls back gracefully if the user is not authenticated.
 */

import { supabase } from "./supabase";

export interface HistoryEntry {
  id: string;
  userId: string;
  toolId: string;
  toolName: string;
  fileName: string;
  fileSize: number;
  resultSummary: string;
  downloaded: boolean;
  createdAt: string;
}

/** Tool metadata for display purposes. */
const TOOL_META: Record<string, { color: string; bgColor: string; icon: string }> = {
  "pdf-summary": { color: "text-amber-600", bgColor: "bg-amber-50", icon: "✨" },
  "pdf-notes": { color: "text-emerald-600", bgColor: "bg-emerald-50", icon: "📝" },
  "pdf-ocr": { color: "text-violet-600", bgColor: "bg-violet-50", icon: "🔍" },
  "resume-checker": { color: "text-blue-600", bgColor: "bg-blue-50", icon: "📋" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Auth: Get Bearer token from Supabase session (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
    console.log("[History:Client] No active session — skipping auth header");
  } catch (err) {
    console.warn("[History:Client] getAuthHeaders() error:", err);
  }
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD Operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save a tool usage entry to history.
 */
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

/**
 * Get all history entries for the current user.
 */
export async function getHistory(): Promise<{
  history: HistoryEntry[];
  authenticated: boolean;
}> {
  try {
    const headers = await getAuthHeaders();

    console.log("[History:Client] getHistory() GET, hasAuth:", !!headers["Authorization"]);

    const res = await fetch("/api/history", { headers });

    // Not authenticated → show Sign In
    if (res.status === 401) {
      console.log("[History:Client] getHistory() → 401 (not authenticated)");
      return { history: [], authenticated: false };
    }

    // Server error → return empty, don't crash the UI
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.warn("[History:Client] getHistory() →", res.status, errData);
      return { history: [], authenticated: true };
    }

    const data = await res.json();
    console.log("[History:Client] getHistory() ✅", (data.history || []).length, "entries");
    return { history: data.history || [], authenticated: true };
  } catch (err) {
    console.warn("[History:Client] getHistory() network error:", err);
    return { history: [], authenticated: true };
  }
}

/**
 * Delete a history entry by ID.
 */
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

/**
 * Mark a history entry as downloaded.
 */
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

// ─────────────────────────────────────────────────────────────────────────────
// Display Helpers
// ─────────────────────────────────────────────────────────────────────────────

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
