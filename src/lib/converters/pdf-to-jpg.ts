/**
 * PDF to JPG Converter for PdfCrux
 *
 * High-fidelity PDF rendering using pdfjs-dist with configurable DPI,
 * page range selection, ZIP output for multi-page, and progress callbacks.
 * All processing runs client-side in the browser.
 */

import JSZip from "jszip";

// ========================
// Types
// ========================

export interface OutputFile {
  name: string;
  data: Blob;
  size: number;
}

export interface ConversionStats {
  originalSize: number;
  totalPages: number;
  convertedPages: number;
  outputSize: number;
  dpi: number;
  quality: "high" | "medium" | "low";
  format: "jpg" | "zip";
  conversionTimeMs: number;
}

export interface PdfToJpgOptions {
  quality: "high" | "medium" | "low";
  pageRange: string;
}

// ========================
// Constants
// ========================

const DPI_MAP: Record<PdfToJpgOptions["quality"], number> = {
  high: 300,   // Adobe-quality print resolution
  medium: 200, // Good quality for screen / sharing
  low: 150,    // Compact / fast preview
};

const JPEG_QUALITY = 0.92;

// ========================
// Page Range Parser
// ========================

/**
 * Parses a human-readable page range string into an array of 0-based page indices.
 *
 * Supported formats:
 *   "1-3,5,7-10"   → pages 1,2,3,5,7,8,9,10
 *   "all"           → all pages
 *   ""              → all pages (empty string default)
 *   "5"             → page 5 only
 *   "1-3"           → pages 1,2,3
 *
 * Returns sorted array of unique 0-based indices.
 */
function parsePageRange(input: string, totalPages: number): number[] {
  const trimmed = input.trim().toLowerCase();

  // "all" or empty → return every page
  if (trimmed === "" || trimmed === "all") {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  const indices = new Set<number>();
  const parts = trimmed.split(",");

  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;

    if (p.includes("-")) {
      const [startStr, endStr] = p.split("-").map((s) => s.trim());
      const start = Math.max(1, parseInt(startStr, 10) || 1);
      const end = Math.min(totalPages, parseInt(endStr, 10) || totalPages);
      for (let i = start; i <= end; i++) {
        indices.add(i - 1);
      }
    } else {
      const num = parseInt(p, 10);
      if (num >= 1 && num <= totalPages) {
        indices.add(num - 1);
      }
    }
  }

  return Array.from(indices).sort((a, b) => a - b);
}

// ========================
// Canvas → JPEG Blob
// ========================

function canvasToJpgBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas toBlob returned null"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });
}

// ========================
// File Size Formatter
// ========================

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// ========================
// Main Converter
// ========================

/**
 * Converts a PDF file to JPG image(s).
 *
 * - Single page → returns one JPG blob directly.
 * - Multiple pages → returns a ZIP containing all JPGs.
 *
 * Progress callback fires at key stages so the UI can show a progress bar.
 */
export async function convertPdfToJpg(
  file: File,
  options: PdfToJpgOptions,
  onProgress?: (status: string, percent: number) => void
): Promise<{ files: OutputFile[]; stats: ConversionStats }> {
  const startTime = performance.now();

  // --- Determine DPI ---
  const dpi = DPI_MAP[options.quality] ?? DPI_MAP.medium;

  // --- Load PDF document ---
  onProgress?.("Loading PDF document...", 0);

  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdfData = new Uint8Array(arrayBuffer);

  const loadingTask = pdfjsLib.getDocument({
    data: pdfData.slice(0), // slice to avoid detached buffer issues
    disableAutoFetch: true,
    disableStream: true,
  });

  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  // --- Parse page range ---
  const pageIndices = parsePageRange(options.pageRange, totalPages);
  const convertedPages = pageIndices.length;

  if (convertedPages === 0) {
    throw new Error(
      `No valid pages found for range "${options.pageRange}". PDF has ${totalPages} page(s).`
    );
  }

  onProgress?.(
    `Parsed page range: ${convertedPages} of ${totalPages} page(s) selected`,
    2
  );

  // --- Render each page ---
  const scale = dpi / 72;
  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const renderedBlobs: OutputFile[] = [];

  for (let i = 0; i < convertedPages; i++) {
    const pageIdx = pageIndices[i];
    const pageNum = pageIdx + 1; // 1-based for display

    onProgress?.(
      `Rendering page ${pageNum} of ${convertedPages}...`,
      Math.round((2 + (i / convertedPages) * 88)) // 2% → 90% range
    );

    // Get page and viewport
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    // Create offscreen canvas
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not get 2D canvas context");
    }

    // White background (PDFs can have transparent backgrounds)
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render page onto canvas
    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    // Convert to JPEG blob
    const jpgBlob = await canvasToJpgBlob(canvas, JPEG_QUALITY);

    renderedBlobs.push({
      name: `${baseName}_page_${pageNum}.jpg`,
      data: jpgBlob,
      size: jpgBlob.size,
    });

    // Clean up references to free memory
    page.cleanup();
  }

  // --- Prepare output ---
  onProgress?.("Preparing output...", 92);

  let outputFiles: OutputFile[];
  let format: ConversionStats["format"];

  if (convertedPages === 1) {
    // Single page → return the JPG directly
    outputFiles = renderedBlobs;
    format = "jpg";
  } else {
    // Multiple pages → bundle into a ZIP
    onProgress?.("Creating ZIP archive...", 95);

    const zip = new JSZip();

    for (const blob of renderedBlobs) {
      zip.file(blob.name, blob.data);
    }

    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const zipName = `${baseName}_images.zip`;

    outputFiles = [
      {
        name: zipName,
        data: zipBlob,
        size: zipBlob.size,
      },
    ];
    format = "zip";
  }

  const conversionTimeMs = Math.round(performance.now() - startTime);
  const outputSize = outputFiles.reduce((sum, f) => sum + f.size, 0);

  const stats: ConversionStats = {
    originalSize: file.size,
    totalPages,
    convertedPages,
    outputSize,
    dpi,
    quality: options.quality,
    format,
    conversionTimeMs,
  };

  onProgress?.("Conversion complete!", 100);

  return { files: outputFiles, stats };
}
