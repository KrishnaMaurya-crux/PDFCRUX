/**
 * Bulk compression engine with batched processing.
 * Handles multiple PDF files concurrently in configurable batch sizes.
 */

import JSZip from "jszip";
import { compressPDF, type ProcessResult } from "./pdf-processor";

// ========================
// Types
// ========================

export interface BulkCompressCallbacks {
  onFileStart?: (index: number, fileName: string) => void;
  onFileProgress?: (index: number, fileName: string, progress: number) => void;
  onFileComplete?: (
    index: number,
    fileName: string,
    result: ProcessResult,
  ) => void;
  onFileError?: (index: number, fileName: string, error: string) => void;
  onOverallProgress?: (completed: number, total: number) => void;
  onBatchStart?: (batchIndex: number, totalBatches: number) => void;
  onBatchComplete?: (batchIndex: number, totalBatches: number) => void;
}

export interface BulkCompressOptions {
  compressionLevel: string;
  colorMode: string;
  batchSize: number;
}

// ========================
// Helpers
// ========================

/** Yield to the UI thread so the browser can repaint. */
function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 100));
}

/**
 * Compress a single file buffer using the core compressPDF engine.
 */
export async function compressSingleFile(
  buffer: Uint8Array,
  fileName: string,
  compressionLevel: string,
  colorMode: string,
): Promise<ProcessResult> {
  const file = new File([buffer], fileName, { type: "application/pdf" });
  return compressPDF(file, {
    "compression-level": compressionLevel,
    "color-mode": colorMode,
  });
}

/**
 * Process a single batch of files sequentially (one at a time) to prevent memory crash.
 */
async function processBatch(
  files: { data: Uint8Array; name: string }[],
  startIdx: number,
  options: BulkCompressOptions,
  callbacks: BulkCompressCallbacks,
  signal: AbortSignal,
): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];
  for (let i = 0; i < files.length; i++) {
    const idx = startIdx + i;

    if (signal.aborted) {
      results.push({
        success: false,
        outputFiles: [],
        message: "Aborted",
      } satisfies ProcessResult);
      continue;
    }

    callbacks.onFileStart?.(idx, files[i].name);
    callbacks.onFileProgress?.(idx, files[i].name, 10);

    try {
      callbacks.onFileProgress?.(idx, files[i].name, 30);

      const result = await compressSingleFile(
        files[i].data,
        files[i].name,
        options.compressionLevel,
        options.colorMode,
      );

      if (signal.aborted) {
        results.push({
          success: false,
          outputFiles: [],
          message: "Aborted",
        } satisfies ProcessResult);
        continue;
      }

      callbacks.onFileProgress?.(idx, files[i].name, 90);

      if (result.success) {
        callbacks.onFileComplete?.(idx, files[i].name, result);
      } else {
        callbacks.onFileError?.(idx, files[i].name, result.message);
      }

      callbacks.onFileProgress?.(idx, files[i].name, 100);
      results.push(result);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error";
      callbacks.onFileError?.(idx, files[i].name, errorMessage);
      results.push({
        success: false,
        outputFiles: [],
        message: errorMessage,
      } satisfies ProcessResult);
    }

    // Yield between files within a batch to keep UI responsive
    if (i < files.length - 1 && !signal.aborted) {
      await yieldToUI();
    }
  }
  return results;
}

// ========================
// Main Engine
// ========================

/**
 * Run bulk compression on an array of pre-loaded file buffers.
 * NOTE: BulkCompressPDF now processes files one-at-a-time inline (no pre-loading).
 * This function is kept for backward compatibility and potential API use.
 * Processes files in batches, yielding between batches to keep the UI responsive.
 */
export async function runBulkCompression(
  files: { data: Uint8Array; name: string }[],
  options: BulkCompressOptions,
  callbacks: BulkCompressCallbacks,
  signal: AbortSignal,
): Promise<ProcessResult[]> {
  const results: ProcessResult[] = new Array(files.length);
  const { batchSize } = options;
  const totalBatches = Math.ceil(files.length / batchSize);
  let completedCount = 0;

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    if (signal.aborted) break;

    const start = batchIdx * batchSize;
    const end = Math.min(start + batchSize, files.length);
    const batch = files.slice(start, end);

    callbacks.onBatchStart?.(batchIdx, totalBatches);

    const batchResults = await processBatch(
      batch,
      start,
      options,
      callbacks,
      signal,
    );

    for (let i = 0; i < batchResults.length; i++) {
      results[start + i] = batchResults[i];
      completedCount++;
      callbacks.onOverallProgress?.(completedCount, files.length);
    }

    callbacks.onBatchComplete?.(batchIdx, totalBatches);

    // Yield between batches (but not after the last one)
    if (batchIdx < totalBatches - 1 && !signal.aborted) {
      await yieldToUI();
    }
  }

  return results;
}

// ========================
// ZIP & Download
// ========================

/**
 * Generate a ZIP blob from compressed file results.
 */
export async function generateZip(
  results: { name: string; data: Uint8Array }[],
): Promise<Blob> {
  const zip = new JSZip();

  for (const result of results) {
    const safeName = result.name.startsWith("/")
      ? result.name.slice(1)
      : result.name;
    zip.file(safeName, result.data);
  }

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

/**
 * Trigger a browser download for a blob.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Revoke after a short delay so the download can start
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ========================
// Notifications
// ========================

/**
 * Send a browser notification (if permission granted).
 */
export function sendBrowserNotification(
  title: string,
  body: string,
): void {
  if (
    typeof window !== "undefined" &&
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    new Notification(title, { body, icon: "/logo.png" });
  }
}

/**
 * Request browser notification permission (only if currently default/undecided).
 */
export async function requestNotificationPermission(): Promise<void> {
  if (
    typeof window !== "undefined" &&
    "Notification" in window &&
    Notification.permission === "default"
  ) {
    await Notification.requestPermission();
  }
}

// ========================
// Utility Functions
// ========================

/**
 * Calculate percentage savings between original and compressed sizes.
 */
export function calculateSavings(
  originalSize: number,
  compressedSize: number,
): number {
  if (originalSize <= 0) return 0;
  const savings = ((originalSize - compressedSize) / originalSize) * 100;
  return Math.max(0, Math.round(savings * 10) / 10);
}

/**
 * Format byte count to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
