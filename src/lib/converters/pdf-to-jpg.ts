/**
 * PDF to JPG Converter for PdfCrux
 *
 * High-fidelity PDF rendering using pdfjs-dist with configurable DPI,
 * page range selection, ZIP output for multi-page, vertical stitching
 * for combined mode, and real-time progress callbacks.
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
  format: "jpg" | "zip";
  conversionTimeMs: number;
}

export interface PdfToJpgOptions {
  quality: "high" | "medium" | "low";
  pageRange: string;
  mode: "separate" | "combined";
  dpi: number;
}

// ========================
// Constants
// ========================

const DPI_MAP: Record<PdfToJpgOptions["quality"], number> = {
  high: 300,
  medium: 200,
  low: 150,
};

const JPEG_QUALITY = 0.92;

// ========================
// Page Range Parser
// ========================

function parsePageRange(input: string, totalPages: number): number[] {
  const trimmed = input.trim().toLowerCase();
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
      for (let i = start; i <= end; i++) indices.add(i - 1);
    } else {
      const num = parseInt(p, 10);
      if (num >= 1 && num <= totalPages) indices.add(num - 1);
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
// Render a single PDF page to canvas
// ========================

async function renderPageToCanvas(
  pdfDoc: any,
  pageNum: number,
  scale: number
): Promise<HTMLCanvasElement> {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D canvas context");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return canvas;
}

// ========================
// Main Converter
// ========================

/**
 * Converts a PDF file to JPG image(s).
 *
 * mode === "separate":
 *   - 1 page  → single JPG file
 *   - N pages → ZIP containing N JPG files
 *
 * mode === "combined":
 *   - All pages stitched vertically into ONE long JPG image
 *
 * Progress callback fires per-page so UI shows "Processing Page X of Y".
 */
export async function convertPdfToJpg(
  file: File,
  options: PdfToJpgOptions,
  onProgress?: (status: string, percent: number) => void
): Promise<{ files: OutputFile[]; stats: ConversionStats }> {
  const startTime = performance.now();
  const baseName = file.name.replace(/\.[^/.]+$/, "");

  // --- Resolve DPI: prefer explicit DPI option, fall back to quality preset ---
  const explicitDpi = Number(options.dpi);
  const dpi = (explicitDpi >= 72 && explicitDpi <= 1200) ? explicitDpi : (DPI_MAP[options.quality] ?? DPI_MAP.medium);
  const scale = dpi / 72;

  // --- Load PDF document ---
  onProgress?.("Loading PDF document...", 0);

  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdfData = new Uint8Array(arrayBuffer);

  const pdfDoc = await pdfjsLib.getDocument({
    data: pdfData.slice(0),
    disableAutoFetch: true,
    disableStream: true,
  }).promise;

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
    `${convertedPages} of ${totalPages} page(s) selected at ${dpi} DPI`,
    3
  );

  // --- Render all pages to canvases ---
  const canvases: HTMLCanvasElement[] = [];

  for (let i = 0; i < convertedPages; i++) {
    const pageIdx = pageIndices[i];
    const pageNum = pageIdx + 1;

    const pctRange = convertedPages > 1 ? 85 : 80;
    onProgress?.(
      `Processing page ${pageNum} of ${convertedPages}...`,
      Math.round(3 + (i / convertedPages) * pctRange)
    );

    const canvas = await renderPageToCanvas(pdfDoc, pageNum, scale);
    canvases.push(canvas);
  }

  // --- Prepare output based on mode ---
  onProgress?.("Preparing output...", 90);

  let outputFiles: OutputFile[];
  let format: ConversionStats["format"];

  if (options.mode === "combined") {
    // ============================================================
    // COMBINED MODE: Vertically stitch all pages into one long JPG
    // ============================================================
    onProgress?.("Stitching pages into single image...", 92);

    // Find max width across all canvases (pages may differ in width)
    const maxWidth = Math.max(...canvases.map((c) => c.width));
    // Sum all heights for the vertical stack
    const totalHeight = canvases.reduce((sum, c) => sum + c.height, 0);

    // Create the mega-canvas
    const combinedCanvas = document.createElement("canvas");
    combinedCanvas.width = maxWidth;
    combinedCanvas.height = totalHeight;
    const combinedCtx = combinedCanvas.getContext("2d");
    if (!combinedCtx) throw new Error("Could not get combined canvas context");

    // White background
    combinedCtx.fillStyle = "#FFFFFF";
    combinedCtx.fillRect(0, 0, maxWidth, totalHeight);

    // Draw each page vertically, centered horizontally
    let yOffset = 0;
    for (const canvas of canvases) {
      const xOffset = Math.floor((maxWidth - canvas.width) / 2);
      combinedCtx.drawImage(canvas, xOffset, yOffset);
      yOffset += canvas.height;
    }

    // Convert combined canvas to JPEG
    const combinedBlob = await canvasToJpgBlob(combinedCanvas, JPEG_QUALITY);

    outputFiles = [
      {
        name: `${baseName}_combined.jpg`,
        data: combinedBlob,
        size: combinedBlob.size,
      },
    ];
    format = "jpg";
  } else {
    // ============================================================
    // SEPARATE MODE: Individual JPGs, ZIP for multi-page
    // ============================================================
    const blobs: OutputFile[] = [];

    for (let i = 0; i < canvases.length; i++) {
      const pageNum = pageIndices[i] + 1;
      const jpgBlob = await canvasToJpgBlob(canvases[i], JPEG_QUALITY);
      blobs.push({
        name: `${baseName}_page_${pageNum}.jpg`,
        data: jpgBlob,
        size: jpgBlob.size,
      });
    }

    if (blobs.length === 1) {
      // Single page → return JPG directly
      outputFiles = blobs;
      format = "jpg";
    } else {
      // Multiple pages → ZIP
      onProgress?.("Creating ZIP archive...", 94);

      const zip = new JSZip();
      for (const blob of blobs) {
        zip.file(blob.name, blob.data);
      }

      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });

      outputFiles = [
        {
          name: `${baseName}_images.zip`,
          data: zipBlob,
          size: zipBlob.size,
        },
      ];
      format = "zip";
    }
  }

  // --- Build stats ---
  const conversionTimeMs = Math.round(performance.now() - startTime);
  const outputSize = outputFiles.reduce((sum, f) => sum + f.size, 0);

  const stats: ConversionStats = {
    originalSize: file.size,
    totalPages,
    convertedPages,
    outputSize,
    dpi,
    format,
    conversionTimeMs,
  };

  onProgress?.("Conversion complete!", 100);

  return { files: outputFiles, stats };
}
