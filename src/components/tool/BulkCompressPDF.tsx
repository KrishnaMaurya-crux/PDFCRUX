"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  X,
  CheckCircle2,
  Download,
  RotateCcw,
  AlertCircle,
  ArrowLeft,
  Plus,
  Trash2,
  Minimize2,
  Zap,
  Shield,
  Clock,
  Bell,
  BellOff,
  Package,
  Pause,
  Play,
  FolderArchive,
  ChevronDown,
  ChevronUp,
  Crown,
  Loader2,
  AlertTriangle,
  Sparkles,
  HardDrive,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import {
  runBulkCompression,
  generateZip,
  downloadBlob,
  sendBrowserNotification,
  requestNotificationPermission,
  calculateSavings,
  formatBytes,
} from "@/lib/bulk-compress";
import type {
  BulkSessionRecord,
  BulkFileRecord,
} from "@/lib/bulk-compress-db";
import {
  saveSession,
  getSession,
  getLatestSession,
  deleteSession,
  cleanupExpiredSessions,
  createSession,
} from "@/lib/bulk-compress-db";

// ========================
// Constants
// ========================

const FREE_FILE_LIMIT = 3;
const PREMIUM_FILE_LIMIT = 100;
const ENTERPRISE_FILE_LIMIT = 10000; // Effectively unlimited
const BATCH_SIZE = 3;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

type CompressionLevel = "low" | "medium" | "high" | "extreme";
type ColorMode = "color" | "grayscale" | "bw";

const isPremium = false;
const FILE_LIMIT = isPremium ? PREMIUM_FILE_LIMIT : FREE_FILE_LIMIT;

// ========================
// Interfaces
// ========================

interface FileItem {
  id: string;
  file: File;
  status: "pending" | "compressing" | "completed" | "error";
  progress: number;
  compressedSize?: number;
  compressedData?: Uint8Array;
  error?: string;
}

// ========================
// Sub-components
// ========================

function FileCounter({
  count,
  max,
}: {
  count: number;
  max: number;
}) {
  const isAtLimit = count >= max;
  return (
    <Badge
      variant={isAtLimit ? "destructive" : "secondary"}
      className="text-sm"
    >
      Selected: {count}/{max}
    </Badge>
  );
}

function GoPremiumCard({
  onClose,
  fileCount,
}: {
  onClose: () => void;
  fileCount: number;
}) {
  const { navigatePricing } = useAppStore();
  const isEnterpriseSuggestion = fileCount > PREMIUM_FILE_LIMIT;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <Card
        className={
          isEnterpriseSuggestion
            ? "border-slate-400 bg-slate-50 dark:bg-slate-900/50 dark:border-slate-600"
            : "border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700"
        }
      >
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            {isEnterpriseSuggestion ? (
              <Building2 className="h-6 w-6 text-slate-600 dark:text-slate-300" />
            ) : (
              <Crown className="h-6 w-6 text-amber-500" />
            )}
            <div>
              <p
                className={`font-semibold ${
                  isEnterpriseSuggestion
                    ? "text-slate-900 dark:text-slate-100"
                    : "text-amber-900 dark:text-amber-200"
                }`
              }
              >
                {isEnterpriseSuggestion
                  ? "Need more power? Try Enterprise"
                  : "Free limit reached"}
              </p>
              <p
                className={`text-sm ${
                  isEnterpriseSuggestion
                    ? "text-slate-600 dark:text-slate-400"
                    : "text-amber-700 dark:text-amber-400"
                }`
              }
              >
                {isEnterpriseSuggestion
                  ? `Processing ${fileCount}+ files? Enterprise gives you unlimited bulk compression, team dashboard & more.`
                  : `Upgrade to compress up to ${PREMIUM_FILE_LIMIT} files at once`}
              </p>
              {isEnterpriseSuggestion && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 gap-1.5 text-xs"
                  onClick={navigatePricing}
                >
                  <Building2 className="w-3 h-3" />
                  View Enterprise Plan
                </Button>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function FileRow({
  item,
  onRemove,
}: {
  item: FileItem;
  onRemove: () => void;
}) {
  const savings =
    item.status === "completed" && item.compressedSize !== undefined
      ? calculateSavings(item.file.size, item.compressedSize)
      : null;

  const statusIcon = () => {
    switch (item.status) {
      case "compressing":
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex items-center gap-3 rounded-lg border bg-card p-3"
    >
      {statusIcon()}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.file.name}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatBytes(item.file.size)}</span>
          {item.status === "completed" && item.compressedSize !== undefined && (
            <>
              <span>→</span>
              <span className="text-green-600 dark:text-green-400 font-medium">
                {formatBytes(item.compressedSize)}
              </span>
              {savings !== null && savings > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  -{savings}%
                </Badge>
              )}
            </>
          )}
          {item.status === "error" && item.error && (
            <span className="text-red-500 truncate">{item.error}</span>
          )}
        </div>
        {item.status === "compressing" && (
          <Progress value={item.progress} className="h-1 mt-1.5" />
        )}
      </div>
      {(item.status === "completed" || item.status === "error") && (
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onRemove}>
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </motion.div>
  );
}

function ResumeDialog({
  session,
  onResume,
  onDiscard,
}: {
  session: BulkSessionRecord;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const completedFiles = session.files.filter(
    (f: BulkFileRecord) => f.status === "completed",
  ).length;
  const pendingFiles = session.files.filter(
    (f: BulkFileRecord) => f.status === "pending",
  ).length;
  const totalFiles = session.files.length;

  const timeAgo = formatTimeAgo(session.updatedAt);

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Resume Previous Session?
          </DialogTitle>
          <DialogDescription>
            You have an unfinished compression session from {timeAgo}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total files</span>
            <span className="font-medium">{totalFiles}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Completed</span>
            <span className="font-medium text-green-600">{completedFiles}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Pending</span>
            <span className="font-medium">{pendingFiles}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Compression</span>
            <Badge variant="outline">{session.compressionLevel}</Badge>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onDiscard}>
            Start Fresh
          </Button>
          <Button onClick={onResume}>Resume Session</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatsSummary({
  totalFiles,
  originalSize,
  compressedSize,
  overallProgress,
}: {
  totalFiles: number;
  originalSize: number;
  compressedSize: number;
  overallProgress: number;
}) {
  const savings = calculateSavings(originalSize, compressedSize);

  return (
    <Card className="border-dashed">
      <CardContent className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold">{totalFiles}</p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Package className="h-3 w-3" /> Total Files
            </p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{formatBytes(originalSize)}</p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <HardDrive className="h-3 w-3" /> Original Size
            </p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {compressedSize > 0 ? formatBytes(compressedSize) : "—"}
            </p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Minimize2 className="h-3 w-3" /> Compressed
            </p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {compressedSize > 0 ? `${savings}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Zap className="h-3 w-3" /> Saved
            </p>
          </div>
        </div>
        {overallProgress > 0 && overallProgress < 100 && (
          <Progress value={overallProgress} className="h-2 mt-4" />
        )}
      </CardContent>
    </Card>
  );
}

// ========================
// Helpers
// ========================

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ========================
// Main Component
// ========================

export default function BulkCompressPDF() {
  const { navigateHome, toast } = useAppStore();
  const { toast: showToast } = useToast();

  // File state
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Settings
  const [compressionLevel, setCompressionLevel] =
    useState<CompressionLevel>("medium");
  const [colorMode, setColorMode] = useState<ColorMode>("color");
  const [settingsOpen, setSettingsOpen] = useState(true);

  // Notification
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // Resume session
  const [resumeSession, setResumeSession] =
    useState<BulkSessionRecord | null>(null);

  // Drag & drop
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Computed stats
  const totalOriginalSize = files.reduce((sum, f) => sum + f.file.size, 0);
  const totalCompressedSize = files.reduce(
    (sum, f) => sum + (f.compressedSize ?? 0),
    0,
  );
  const allCompleted = files.length > 0 && files.every((f) => f.status === "completed" || f.status === "error");
  const hasErrors = files.some((f) => f.status === "error");
  const completedCount = files.filter((f) => f.status === "completed").length;

  // ========================
  // checkForResumeSession — declared BEFORE useEffect to avoid lint error
  // ========================
  const checkForResumeSession = useCallback(async () => {
    try {
      await cleanupExpiredSessions();
      const latest = await getLatestSession();
      if (
        latest &&
        latest.files.some(
          (f: BulkFileRecord) =>
            f.status === "pending" || f.status === "compressing",
        )
      ) {
        setResumeSession(latest);
      }
    } catch {
      // IndexedDB may not be available — silently ignore
    }
  }, []);

  useEffect(() => {
    void checkForResumeSession();
  }, [checkForResumeSession]);

  // ========================
  // Notification permission
  // ========================
  const toggleNotifications = useCallback(async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      return;
    }
    await requestNotificationPermission();
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationsEnabled(Notification.permission === "granted");
      if (Notification.permission !== "granted") {
        showToast({
          title: "Notifications blocked",
          description:
            "Please enable notifications in your browser settings.",
          variant: "destructive",
        });
      }
    }
  }, [notificationsEnabled, showToast]);

  // ========================
  // File management
  // ========================
  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      const fileArray = Array.from(newFiles);
      const pdfFiles = fileArray.filter((f) =>
        f.type.toLowerCase().includes("pdf"),
      );
      const oversized = fileArray.filter((f) => f.size > MAX_FILE_SIZE);
      const nonPdf = fileArray.filter(
        (f) => !f.type.toLowerCase().includes("pdf"),
      );

      if (nonPdf.length > 0) {
        showToast({
          title: "Unsupported files skipped",
          description: `${nonPdf.length} file(s) are not PDFs and were ignored.`,
          variant: "destructive",
        });
      }

      if (oversized.length > 0) {
        showToast({
          title: "File too large",
          description: `${oversized.length} file(s) exceed the 100 MB limit.`,
          variant: "destructive",
        });
      }

      const validFiles = pdfFiles.filter((f) => f.size <= MAX_FILE_SIZE);

      setFiles((prev) => {
        const remaining = FILE_LIMIT - prev.length;
        const toAdd = validFiles.slice(0, remaining);
        if (validFiles.length > remaining) {
          showToast({
            title: "Limit reached",
            description: `Only ${remaining} more file(s) can be added.`,
            variant: "destructive",
          });
        }
        return [
          ...prev,
          ...toAdd.map((f) => ({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            file: f,
            status: "pending" as const,
            progress: 0,
          })),
        ];
      });
    },
    [showToast],
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setOverallProgress(0);
  }, []);

  // ========================
  // Drag & Drop
  // ========================
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const handleBrowse = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files);
        e.target.value = "";
      }
    },
    [addFiles],
  );

  // ========================
  // Compression
  // ========================
  const startCompression = useCallback(async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setIsPaused(false);
    setOverallProgress(0);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Reset all files to pending
    setFiles((prev) =>
      prev.map((f) => ({ ...f, status: "pending" as const, progress: 0 })),
    );

    // CRITICAL: Pre-load all ArrayBuffers BEFORE passing to runBulkCompression
    const currentFiles = [...files];
    const fileBuffers = await Promise.all(
      currentFiles.map(async (f) => ({
        data: new Uint8Array(await f.file.arrayBuffer()),
        name: f.file.name,
      })),
    );

    const callbacks = {
      onFileStart: (index: number, _fileName: string) => {
        setFiles((prev) =>
          prev.map((f, i) =>
            i === index ? { ...f, status: "compressing", progress: 10 } : f,
          ),
        );
      },
      onFileProgress: (index: number, _fileName: string, progress: number) => {
        setFiles((prev) =>
          prev.map((f, i) =>
            i === index ? { ...f, progress } : f,
          ),
        );
      },
      onFileComplete: (index: number, _fileName: string, result: { outputFiles: { name: string; data: Uint8Array; size: number }[] }) => {
        const outputFile = result.outputFiles[0];
        if (outputFile) {
          setFiles((prev) =>
            prev.map((f, i) =>
              i === index
                ? {
                    ...f,
                    status: "completed" as const,
                    progress: 100,
                    compressedSize: outputFile.size,
                    compressedData: outputFile.data,
                  }
                : f,
            ),
          );
        }
      },
      onFileError: (index: number, _fileName: string, error: string) => {
        setFiles((prev) =>
          prev.map((f, i) =>
            i === index
              ? { ...f, status: "error" as const, progress: 100, error }
              : f,
          ),
        );
      },
      onOverallProgress: (completed: number, _total: number) => {
        const pct = Math.round((completed / files.length) * 100);
        setOverallProgress(pct);
      },
    };

    try {
      await runBulkCompression(
        fileBuffers,
        {
          compressionLevel,
          colorMode,
          batchSize: BATCH_SIZE,
        },
        callbacks,
        controller.signal,
      );
    } catch {
      showToast({
        title: "Compression interrupted",
        description: "The process was cancelled.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
      setOverallProgress(100);

      // Count results after state settles
      setTimeout(() => {
        setFiles((prev) => {
          const done = prev.filter((f) => f.status === "completed").length;
          const errored = prev.filter((f) => f.status === "error").length;
          if (notificationsEnabled) {
            sendBrowserNotification(
              "Bulk Compression Complete",
              `${done} file(s) compressed successfully${errored > 0 ? `, ${errored} failed` : ""}.`,
            );
          }
          return prev;
        });
      }, 200);
    }
  }, [files, compressionLevel, colorMode, notificationsEnabled, showToast]);

  const cancelCompression = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsProcessing(false);
    setIsPaused(false);
  }, []);

  const resetAll = useCallback(() => {
    setFiles([]);
    setOverallProgress(0);
    setIsProcessing(false);
    setIsPaused(false);
    abortControllerRef.current?.abort();
  }, []);

  // ========================
  // Download
  // ========================
  const downloadSingleFile = useCallback((item: FileItem) => {
    if (!item.compressedData) return;
    const blob = new Blob([item.compressedData], {
      type: "application/pdf",
    });
    const fileName = item.file.name.replace(/\.pdf$/i, "_compressed.pdf");
    downloadBlob(blob, fileName);
  }, []);

  const downloadAllAsZip = useCallback(async () => {
    const completedFiles = files.filter(
      (f) => f.status === "completed" && f.compressedData,
    );
    if (completedFiles.length === 0) return;

    try {
      showToast({
        title: "Creating ZIP…",
        description: "Packaging all compressed files into a ZIP archive.",
      });

      const zipBlob = await generateZip(
        completedFiles.map((f) => ({
          name: f.file.name.replace(/\.pdf$/i, "_compressed.pdf"),
          data: f.compressedData!,
        })),
      );

      downloadBlob(zipBlob, "compressed-pdfs.zip");
      showToast({
        title: "ZIP downloaded",
        description: `${completedFiles.length} file(s) saved.`,
      });
    } catch {
      showToast({
        title: "ZIP creation failed",
        description: "Could not create the ZIP file. Try downloading individually.",
        variant: "destructive",
      });
    }
  }, [files, showToast]);

  // ========================
  // Resume session handlers
  // ========================
  const handleResume = useCallback(async () => {
    if (!resumeSession) return;

    const restored: FileItem[] = resumeSession.files.map(
      (f: BulkFileRecord) => ({
        id: f.id,
        file: new File([f.fileData], f.fileName, { type: "application/pdf" }),
        status: f.status,
        progress: f.progress,
        compressedSize: f.compressedSize,
        compressedData: f.compressedData
          ? new Uint8Array(f.compressedData)
          : undefined,
        error: f.error,
      }),
    );

    setFiles(restored);
    setCompressionLevel(
      resumeSession.compressionLevel as CompressionLevel,
    );
    setColorMode(resumeSession.colorMode as ColorMode);
    setResumeSession(null);

    await deleteSession(resumeSession.id);
    showToast({
      title: "Session restored",
      description: `${restored.length} file(s) loaded. You can continue compression.`,
    });
  }, [resumeSession, showToast]);

  const handleDiscard = useCallback(async () => {
    if (resumeSession) {
      await deleteSession(resumeSession.id);
    }
    setResumeSession(null);
  }, [resumeSession]);

  // ========================
  // Compression level options
  // ========================
  const compressionLevels: {
    value: CompressionLevel;
    label: string;
    icon: React.ReactNode;
    description: string;
  }[] = [
    {
      value: "low",
      label: "Low",
      icon: <Sparkles className="h-4 w-4" />,
      description: "Best quality, ~15% reduction",
    },
    {
      value: "medium",
      label: "Medium",
      icon: <Minimize2 className="h-4 w-4" />,
      description: "Balanced, ~40% reduction",
    },
    {
      value: "high",
      label: "High",
      icon: <Zap className="h-4 w-4" />,
      description: "Strong compression, ~65% reduction",
    },
    {
      value: "extreme",
      label: "Extreme",
      icon: <AlertTriangle className="h-4 w-4" />,
      description: "Maximum savings, ~80% reduction",
    },
  ];

  const colorModes: {
    value: ColorMode;
    label: string;
    description: string;
  }[] = [
    { value: "color", label: "Color", description: "Keep original colors" },
    {
      value: "grayscale",
      label: "Grayscale",
      description: "Convert to grayscale",
    },
    { value: "bw", label: "B&W", description: "Black & white only" },
  ];

  // ========================
  // Render
  // ========================

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Resume Dialog */}
      {resumeSession && (
        <ResumeDialog
          session={resumeSession}
          onResume={handleResume}
          onDiscard={handleDiscard}
        />
      )}

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={navigateHome}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                <Package className="h-6 w-6 text-primary" />
                Bulk Compress PDF
              </h1>
              <p className="text-sm text-muted-foreground">
                Compress multiple PDF files at once
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {files.length > 0 && (
              <FileCounter count={files.length} max={FILE_LIMIT} />
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleNotifications}
              title={
                notificationsEnabled
                  ? "Disable notifications"
                  : "Enable notifications"
              }
            >
              {notificationsEnabled ? (
                <Bell className="h-4 w-4" />
              ) : (
                <BellOff className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </div>
        </div>

        {/* Go Premium Card */}
        <AnimatePresence>
          {files.length >= FILE_LIMIT && !isPremium && (
            <GoPremiumCard
              fileCount={files.length}
              onClose={() => {
                /* just dismiss */
              }}
            />
          )}
        </AnimatePresence>

        {/* Upload Area — show when not processing and not all completed */}
        {!isProcessing && !allCompleted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              relative rounded-xl border-2 border-dashed p-8 sm:p-12 text-center cursor-pointer
              transition-colors
              ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
              }
              ${files.length >= FILE_LIMIT ? "pointer-events-none opacity-50" : ""}
            `}
            onClick={handleBrowse}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              onChange={handleFileInput}
            />
            <Upload
              className={`h-10 w-10 mx-auto mb-3 ${isDragging ? "text-primary" : "text-muted-foreground"}`}
            />
            <p className="font-medium">
              {isDragging
                ? "Drop your PDFs here"
                : "Drag & drop PDF files here"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              or click to browse — up to {formatBytes(MAX_FILE_SIZE)} per file
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={(e) => {
                e.stopPropagation();
                handleBrowse();
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Files
            </Button>
          </motion.div>
        )}

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Files ({files.length})
              </h2>
              {!isProcessing && !allCompleted && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={clearFiles}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Clear All
                </Button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              <AnimatePresence mode="popLayout">
                {files.map((item) => (
                  <FileRow
                    key={item.id}
                    item={item}
                    onRemove={() => removeFile(item.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Compression Settings */}
        {files.length > 0 && !isProcessing && !allCompleted && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card>
              <CardContent className="p-0">
                <button
                  type="button"
                  className="w-full flex items-center justify-between p-4 text-left"
                  onClick={() => setSettingsOpen(!settingsOpen)}
                >
                  <span className="font-semibold flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Compression Settings
                  </span>
                  {settingsOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                <AnimatePresence>
                  {settingsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-4">
                        {/* Compression Level */}
                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            Compression Level
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {compressionLevels.map((level) => (
                              <button
                                key={level.value}
                                type="button"
                                onClick={() =>
                                  setCompressionLevel(level.value)
                                }
                                className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-sm transition-colors ${
                                  compressionLevel === level.value
                                    ? "border-primary bg-primary/5 text-primary font-medium"
                                    : "border-muted hover:border-primary/30"
                                }`}
                              >
                                {level.icon}
                                <span>{level.label}</span>
                                <span className="text-xs text-muted-foreground">
                                  {level.description}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Color Mode */}
                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            Color Mode
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            {colorModes.map((mode) => (
                              <button
                                key={mode.value}
                                type="button"
                                onClick={() => setColorMode(mode.value)}
                                className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-sm transition-colors ${
                                  colorMode === mode.value
                                    ? "border-primary bg-primary/5 text-primary font-medium"
                                    : "border-muted hover:border-primary/30"
                                }`}
                              >
                                <span>{mode.label}</span>
                                <span className="text-xs text-muted-foreground">
                                  {mode.description}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Stats Summary */}
        {files.length > 0 && (isProcessing || allCompleted) && (
          <StatsSummary
            totalFiles={files.length}
            originalSize={totalOriginalSize}
            compressedSize={totalCompressedSize}
            overallProgress={overallProgress}
          />
        )}

        {/* Processing State */}
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-center gap-3 text-primary">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="font-medium">
                Compressing {files.length} file(s)…
              </span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" onClick={cancelCompression}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </div>
          </motion.div>
        )}

        {/* Complete State */}
        {allCompleted && !isProcessing && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="text-center space-y-2">
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
              <h2 className="text-lg font-bold">
                {hasErrors
                  ? `Done — ${completedCount}/${files.length} succeeded`
                  : "All files compressed!"}
              </h2>
              {totalCompressedSize > 0 && (
                <p className="text-sm text-muted-foreground">
                  Saved{" "}
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    {formatBytes(totalOriginalSize - totalCompressedSize)}
                  </span>{" "}
                  ({calculateSavings(totalOriginalSize, totalCompressedSize)}%
                  reduction)
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                onClick={downloadAllAsZip}
                className="gap-2"
                disabled={completedCount === 0}
              >
                <FolderArchive className="h-4 w-4" />
                Download All as ZIP
              </Button>
              <Button variant="outline" onClick={resetAll} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Compress More Files
              </Button>
            </div>

            {/* Per-file download list */}
            {completedCount > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  Individual downloads:
                </p>
                <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {files
                    .filter((f) => f.status === "completed")
                    .map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2"
                      >
                        <span className="text-sm truncate mr-2">
                          {item.file.name}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {formatBytes(item.compressedSize ?? 0)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => downloadSingleFile(item)}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Info Card when no files */}
        {files.length === 0 && !isProcessing && (
          <Card className="border-dashed bg-muted/30">
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="rounded-full bg-primary/10 p-3">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-sm font-medium">Batch Processing</p>
                  <p className="text-xs text-muted-foreground">
                    Process up to {FILE_LIMIT} files at once with smart
                    batching
                  </p>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="rounded-full bg-primary/10 p-3">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-sm font-medium">4 Compression Levels</p>
                  <p className="text-xs text-muted-foreground">
                    From light ~15% to extreme ~80% size reduction
                  </p>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="rounded-full bg-primary/10 p-3">
                    <FolderArchive className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-sm font-medium">ZIP Download</p>
                  <p className="text-xs text-muted-foreground">
                    Download all compressed files as a single ZIP archive
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Sticky Footer */}
      <footer className="border-t bg-background py-3 px-4 mt-auto">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            All processing happens locally in your browser
          </p>
          {files.length > 0 && !isProcessing && !allCompleted && (
            <Button
              onClick={startCompression}
              size="sm"
              className="gap-2"
              disabled={files.length === 0}
            >
              <Minimize2 className="h-4 w-4" />
              Compress {files.length} File{files.length > 1 ? "s" : ""}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
