"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Clock,
  FileText,
  Trash2,
  Eye,
  Sparkles,
  BookOpen,
  UserCheck,
  Inbox,
  Loader2,
  LogIn,
  RefreshCw,
  AlertTriangle,
  Download,
  HardDrive,
  Crown,
  Cloud,
  ArrowDownToLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth-store";
import {
  getHistory,
  deleteHistoryItem,
  getStorageUsage,
  getDownloadUrl,
  getAuthHeaders,
  type HistoryEntry,
  type StorageUsage,
  getToolMeta,
  formatHistoryDate,
  formatFileSize,
} from "@/lib/history";

// ─────────────────────────────────────────────────────────────────────────
// Constants & Tool Icon Mapping
// ─────────────────────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "pdf-summary": Sparkles,
  "pdf-notes": BookOpen,
  "pdf-ocr": Eye,
  "resume-checker": UserCheck,
};

const LOAD_TIMEOUT_MS = 8000;

// ─────────────────────────────────────────────────────────────────────────
// Helper: plan badge styling
// ─────────────────────────────────────────────────────────────────────────

function getPlanBadgeStyle(plan: string): string {
  switch (plan) {
    case "enterprise":
      return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800";
    case "premium":
      return "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Helper: storage bar color class based on usage percentage
// ─────────────────────────────────────────────────────────────────────────

function getStorageBarColor(percent: number): string {
  if (percent > 90) return "[&>[data-slot=progress-indicator]]:bg-red-500";
  if (percent >= 70) return "[&>[data-slot=progress-indicator]]:bg-amber-500";
  return "[&>[data-slot=progress-indicator]]:bg-emerald-500";
}

// ─────────────────────────────────────────────────────────────────────────
// Storage Usage Card Component
// ─────────────────────────────────────────────────────────────────────────

function StorageUsageCard({ storage }: { storage: StorageUsage }) {
  const { isDevMode, plan, planLabel, planPrice, storageUsedFormatted, storageLimitFormatted, storagePercent, downloadCount, downloadLimit, historyCount } = storage;

  const iconBg = plan === "enterprise" ? "bg-amber-100 dark:bg-amber-900/40" : plan === "premium" ? "bg-violet-100 dark:bg-violet-900/40" : "bg-muted";
  const iconColor = plan === "enterprise" ? "text-amber-600 dark:text-amber-400" : plan === "premium" ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground";

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm"
    >
      {/* Top row: Plan badge + stats */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
            {plan === "enterprise" || plan === "premium" ? (
              <Crown className={`w-4 h-4 ${iconColor}`} />
            ) : (
              <Cloud className={`w-4 h-4 ${iconColor}`} />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{planLabel}</span>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getPlanBadgeStyle(plan)}`}>
                {planPrice}
              </Badge>
              {isDevMode && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">
                  Dev
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1" title="Downloads">
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span className="font-medium text-foreground">{downloadCount}</span>
            {downloadLimit > 0 && <span>/ {downloadLimit}</span>}
            {downloadLimit === 0 && <span className="text-emerald-600 dark:text-emerald-400">∞</span>}
          </span>
          <span className="flex items-center gap-1" title="History entries">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-medium text-foreground">{historyCount}</span>
          </span>
        </div>
      </div>

      {/* Storage bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <HardDrive className="w-3.5 h-3.5" />
            Storage
          </span>
          <span className={`font-medium ${storagePercent > 90 ? "text-red-600 dark:text-red-400" : storagePercent >= 70 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
            {isDevMode
              ? `Unlimited (Dev) — ${storageUsedFormatted} used`
              : `${storageUsedFormatted} / ${storageLimitFormatted}`}
          </span>
        </div>
        <Progress
          value={isDevMode ? Math.min(storagePercent, 15) : storagePercent}
          className={`h-2 ${isDevMode ? getStorageBarColor(10) : getStorageBarColor(storagePercent)}`}
        />
        {!isDevMode && (
          <div className="flex justify-end">
            <span className={`text-[10px] ${storagePercent > 90 ? "text-red-500" : storagePercent >= 70 ? "text-amber-500" : "text-muted-foreground"}`}>
              {storagePercent}% used
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main HistoryPanel Component
// ═══════════════════════════════════════════════════════════════════════════

export default function HistoryPanel() {
  const { navigateHome, selectTool } = useAppStore();
  const { isLoading: isLoadingAuth, setAuthDialogOpen, session } = useAuthStore();

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [storage, setStorage] = useState<StorageUsage | null>(null);

  console.log("[HistoryPanel] RENDER — loading:", loading, "auth:", isLoadingAuth, "session:", !!session, "error:", error);

  // ─────────────────────────────────────────────────────────────────
  // Main fetch logic — separated so both auto-load + manual refresh use it
  // ─────────────────────────────────────────────────────────────────
  async function doLoadHistory() {
    console.log("[HistoryPanel] doLoadHistory() START");
    setLoading(true);
    setError(null);

    // 8-second timeout safety net
    const timeoutId = setTimeout(() => {
      console.warn("[HistoryPanel] ⏰ LOAD TIMEOUT — 8 seconds reached");
      setError("Unable to load history. Check your connection.");
      setLoading(false);
    }, LOAD_TIMEOUT_MS);

    try {
      console.log("[HistoryPanel] Calling getHistory() + getStorageUsage()...");
      const [historyResult, storageResult] = await Promise.all([
        getHistory(),
        getStorageUsage(),
      ]);
      clearTimeout(timeoutId);

      console.log("[HistoryPanel] getHistory() returned:", {
        entries: historyResult.history.length,
        authenticated: historyResult.authenticated,
        debug: historyResult.debug,
      });
      console.log("[HistoryPanel] getStorageUsage() returned:", storageResult ? `${storageResult.storageUsedFormatted} used, plan: ${storageResult.plan}` : "null");

      setHistory(historyResult.history);
      setAuthenticated(historyResult.authenticated);
      setStorage(storageResult);

      // If server returned a debug error (e.g., 500), show it
      if (historyResult.debug) {
        setError(historyResult.debug);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[HistoryPanel] 💥 doLoadHistory() CATCH:", msg);
      setError(`Failed to load history: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // useEffect — TRIGGER LOG
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    console.log("[HistoryPanel] useEffect FIRED — isLoadingAuth:", isLoadingAuth, "session:", !!session);

    // CRITICAL: Do NOT fetch until auth has initialized
    if (isLoadingAuth) {
      console.log("[HistoryPanel] ⏳ Auth still loading — waiting...");
      return;
    }

    console.log("[HistoryPanel] ✅ Auth ready — fetching history NOW");
    doLoadHistory();
  }, [isLoadingAuth, session]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    await deleteHistoryItem(deleteId);
    setHistory((prev) => prev.filter((h) => h.id !== deleteId));
    setDeleteId(null);
    setDeleting(false);
  };

  const handleViewResult = (entry: HistoryEntry) => {
    selectTool(entry.toolId);
  };

  const handleDownload = async (entry: HistoryEntry) => {
    // CRITICAL FIX: window.open() does NOT send Authorization headers.
    // The download API route requires auth, so we must use fetch + blob.
    try {
      const headers = await getAuthHeaders();
      const url = getDownloadUrl(entry.id);

      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.error("[HistoryPanel] Download failed:", res.status);
        return;
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = entry.fileName || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("[HistoryPanel] Download error:", err);
    }
  };

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pt-20 bg-card">
      {/* ── Header ── */}
      <section className="border-b border-border bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={navigateHome}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group mb-4"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to Home
          </motion.button>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-primary" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                  My Activity
                </h1>
              </div>

              {/* ── REFRESH BUTTON ── */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  console.log("[HistoryPanel] Manual refresh clicked");
                  doLoadHistory();
                }}
                disabled={loading}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
            <p className="text-muted-foreground text-sm sm:text-base">
              View your recent tool usage, stored files, and download history.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Content ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Loading state (auth OR data) */}
        {loading || isLoadingAuth ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-3" />
            <span className="text-sm text-muted-foreground">
              {isLoadingAuth ? "Checking authentication..." : "Loading history..."}
            </span>
          </div>
        ) : error ? (
          /* ── ERROR STATE ── */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              Something went wrong
            </h3>
            <p className="text-sm text-muted-foreground mb-2 text-center max-w-sm">
              {error}
            </p>
            <p className="text-xs text-muted-foreground mb-6 text-center max-w-sm">
              Auth: {authenticated === false ? "❌ Not signed in" : authenticated === true ? "✅ Signed in" : "❓ Unknown"} | Session: {session ? "YES" : "NO"}
            </p>
            <div className="flex gap-3">
              <Button onClick={() => doLoadHistory()} variant="outline" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>
              <Button onClick={navigateHome} className="gap-2">
                Go Home
              </Button>
            </div>
          </motion.div>
        ) : authenticated === false ? (
          /* ── Not Authenticated ── */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <LogIn className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              Sign in to view history
            </h3>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-xs">
              Your tool usage history is saved when you&apos;re signed in. Sign in to see your past activity.
            </p>
            <Button onClick={() => setAuthDialogOpen(true, "login")} className="gap-2">
              <LogIn className="w-4 h-4" />
              Sign In
            </Button>
          </motion.div>
        ) : history.length === 0 ? (
          /* ── Empty State ── */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Inbox className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              No activity yet
            </h3>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-xs">
              Your tool usage history will appear here. Try summarizing a PDF, generating notes, or checking a resume.
            </p>
            <Button onClick={navigateHome} className="gap-2">
              <Sparkles className="w-4 h-4" />
              Get Started
            </Button>
          </motion.div>
        ) : (
          /* ── History List with Storage Bar ── */
          <div className="space-y-6">
            {/* ── Storage Usage Card (top of panel) ── */}
            {storage && <StorageUsageCard storage={storage} />}

            {/* ── History entries ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {history.length} item{history.length !== 1 ? "s" : ""}
                </p>
              </div>

              <AnimatePresence>
                {history.map((entry, index) => {
                  const meta = getToolMeta(entry.toolId);
                  const ToolIcon = TOOL_ICONS[entry.toolId] || FileText;
                  const hasFile = !!(entry.fileUrl || entry.r2Key);

                  return (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
                      transition={{ delay: index * 0.04 }}
                      className="group bg-card border border-border rounded-xl p-4 sm:p-5 hover:shadow-md hover:border-border/80 transition-all"
                    >
                      <div className="flex items-start gap-3 sm:gap-4">
                        {/* Tool icon */}
                        <div className={`w-10 h-10 rounded-xl ${meta.bgColor} flex items-center justify-center flex-shrink-0`}>
                          <ToolIcon className={`w-5 h-5 ${meta.color}`} />
                        </div>

                        {/* Main content */}
                        <div className="flex-1 min-w-0">
                          {/* Row 1: File name + Tool badge */}
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-semibold text-foreground truncate">
                              {entry.fileName}
                            </h4>
                            <Badge
                              variant="secondary"
                              className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${meta.bgColor} ${meta.color} border-0 flex-shrink-0`}
                            >
                              {entry.toolName}
                            </Badge>
                          </div>

                          {/* Row 2: Meta info */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatHistoryDate(entry.createdAt)}
                            </span>
                            {entry.fileSize > 0 && (
                              <span>{formatFileSize(entry.fileSize)}</span>
                            )}
                            {hasFile && (
                              <Badge variant="secondary" className="text-[10px] rounded-full px-1.5 py-0 bg-emerald-50 text-emerald-700 border-0 dark:bg-emerald-900/30 dark:text-emerald-400">
                                Cloud stored
                              </Badge>
                            )}
                            {entry.downloaded && (
                              <Badge variant="secondary" className="text-[10px] rounded-full px-1.5 py-0 bg-sky-50 text-sky-700 border-0 dark:bg-sky-900/30 dark:text-sky-400">
                                Downloaded
                              </Badge>
                            )}
                          </div>

                          {/* Row 3: Result summary */}
                          {entry.resultSummary && (
                            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1 max-w-lg">
                              {entry.resultSummary}
                            </p>
                          )}
                        </div>

                        {/* Action buttons — ALWAYS visible (no hover-only on mobile) */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {hasFile ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:bg-emerald-900/30"
                              onClick={() => handleDownload(entry)}
                              title="Download file"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground/40 cursor-not-allowed"
                              disabled
                              title="File not stored — process again to enable download"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => handleViewResult(entry)}
                            title="View Result"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-red-500"
                            onClick={() => setDeleteId(entry.id)}
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        )}
      </section>

      {/* ── Delete Dialog ── */}
      <Dialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete History Item</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this item from your history? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
