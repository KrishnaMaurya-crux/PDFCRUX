/**
 * JPG/PNG to PDF Converter
 *
 * Uses pdf-lib for reliable image embedding into PDF pages.
 * Supports multiple images → multi-page PDF, with configurable
 * orientation, scaling, page size, and margins.
 *
 * Runs entirely client-side (browser).
 */

import {
  PDFDocument,
  PDFPage,
  degrees,
  rgb,
  type PDFFont,
} from "pdf-lib";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OutputFile {
  name: string;
  data: Uint8Array;
  size: number;
}

export interface ConversionStats {
  inputFiles: number;
  outputPages: number;
  outputSize: number;
  elapsedMs: number;
  averageImageSize: number;
}

export interface JpgToPdfOptions {
  orientation: "portrait" | "landscape" | "auto";
  scaling: "fit" | "fill" | "original";
  pageSize: "a4" | "letter" | "legal";
  margin: number; // mm (0–50)
}

// ---------------------------------------------------------------------------
// Page-size helpers (width × height in PDF points = mm × 2.83465)
// ---------------------------------------------------------------------------

const MM_TO_PT = 2.83465;

const PAGE_SIZES_MM: Record<string, [number, number]> = {
  a4: [210, 297],
  letter: [215.9, 279.4],
  legal: [215.9, 355.6],
};

function pageSizeInPt(pageSize: string): [number, number] {
  const [wMm, hMm] = PAGE_SIZES_MM[pageSize] ?? PAGE_SIZES_MM["a4"];
  return [wMm * MM_TO_PT, hMm * MM_TO_PT];
}

/** Return [width, height] in points for the requested page size & orientation. */
function resolvePageSize(
  pageSize: string,
  orientation: "portrait" | "landscape" | "auto",
  imgW?: number,
  imgH?: number,
): [number, number] {
  const [w, h] = pageSizeInPt(pageSize);

  let effectiveOrientation = orientation;

  // Auto-detect from image dimensions (width > height → landscape)
  if (effectiveOrientation === "auto" && imgW !== undefined && imgH !== undefined) {
    effectiveOrientation = imgW > imgH ? "landscape" : "portrait";
  } else if (effectiveOrientation === "auto") {
    effectiveOrientation = "portrait"; // fallback when no image data
  }

  return effectiveOrientation === "landscape" ? [h, w] : [w, h];
}

/** Map to pdf-lib PageSizes key for addPage(). */
function toPdfLibPageSize(
  pageSize: string,
  orientation: "portrait" | "landscape" | "auto",
): string {
  const mapping: Record<string, string> = {
    a4: "A4",
    letter: "LETTER",
    legal: "LEGAL",
  };
  return mapping[pageSize] ?? "A4";
}

// ---------------------------------------------------------------------------
// Scaling / dimension helpers
// ---------------------------------------------------------------------------

interface DrawRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculate the rectangle on the page where the image should be drawn,
 * based on the scaling mode, page dimensions, and margin.
 */
function calculateDrawRect(
  scaling: "fit" | "fill" | "original",
  pageWidth: number,
  pageHeight: number,
  marginPt: number,
  imgWidth: number,
  imgHeight: number,
): DrawRect {
  const availW = pageWidth - marginPt * 2;
  const availH = pageHeight - marginPt * 2;

  if (scaling === "original") {
    // Use natural pixel dimensions as points. If it overflows, fall back to fit.
    if (imgWidth <= availW && imgHeight <= availH) {
      // Center the original-size image
      return {
        x: marginPt + (availW - imgWidth) / 2,
        y: marginPt + (availH - imgHeight) / 2,
        width: imgWidth,
        height: imgHeight,
      };
    }
    // Fall back to fit
    return fitRect(imgWidth, imgHeight, availW, availH, marginPt);
  }

  if (scaling === "fill") {
    // Scale to cover entire available area, may overflow → clip
    return fillRect(imgWidth, imgHeight, availW, availH, marginPt);
  }

  // scaling === "fit" — scale to fit within available area, maintain aspect ratio
  return fitRect(imgWidth, imgHeight, availW, availH, marginPt);
}

/** Fit image inside available area, maintaining aspect ratio, centered. */
function fitRect(
  imgW: number,
  imgH: number,
  availW: number,
  availH: number,
  marginPt: number,
): DrawRect {
  const scaleX = availW / imgW;
  const scaleY = availH / imgH;
  const scale = Math.min(scaleX, scaleY, 1); // don't upscale beyond original

  const drawW = imgW * scale;
  const drawH = imgH * scale;

  return {
    x: marginPt + (availW - drawW) / 2,
    y: marginPt + (availH - drawH) / 2,
    width: drawW,
    height: drawH,
  };
}

/** Fill the available area (cover), may crop edges, centered. */
function fillRect(
  imgW: number,
  imgH: number,
  availW: number,
  availH: number,
  marginPt: number,
): DrawRect {
  const scaleX = availW / imgW;
  const scaleY = availH / imgH;
  const scale = Math.max(scaleX, scaleY);

  const drawW = imgW * scale;
  const drawH = imgH * scale;

  return {
    x: marginPt + (availW - drawW) / 2,
    y: marginPt + (availH - drawH) / 2,
    width: drawW,
    height: drawH,
  };
}

// ---------------------------------------------------------------------------
// Image helper
// ---------------------------------------------------------------------------

type ImageExtension = "jpg" | "jpeg" | "png";

function getImageExtension(fileName: string): ImageExtension | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpg";
  return null;
}

// ---------------------------------------------------------------------------
// Main converter
// ---------------------------------------------------------------------------

export async function convertJpgToPdf(
  files: File[],
  options: JpgToPdfOptions,
  onProgress?: (status: string, percent: number) => void,
): Promise<{ file: OutputFile; stats: ConversionStats }> {
  const startTime = performance.now();

  if (files.length === 0) {
    throw new Error("No files provided for conversion.");
  }

  const totalFiles = files.length;
  let processed = 0;

  // --- 1. Create a new PDF document ---
  onProgress?.("Initializing PDF document...", 0);

  const pdfDoc = await PDFDocument.create();

  // Track total input size for stats
  let totalInputSize = 0;

  // --- 2. Process each image ---
  for (let i = 0; i < totalFiles; i++) {
    const file = files[i];
    const ext = getImageExtension(file.name);

    if (!ext) {
      // Skip unsupported files silently, but still count progress
      processed++;
      onProgress?.(
        `Skipping unsupported file: ${file.name}`,
        Math.round((processed / totalFiles) * 90),
      );
      continue;
    }

    onProgress?.(
      `Processing image ${i + 1} of ${totalFiles}: ${file.name}`,
      Math.round((processed / totalFiles) * 90),
    );

    // Read file into ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    totalInputSize += file.size;

    // Embed image into PDF
    let embeddedImage;
    if (ext === "png") {
      embeddedImage = await pdfDoc.embedPng(uint8);
    } else {
      embeddedImage = await pdfDoc.embedJpg(uint8);
    }

    const imgWidth = embeddedImage.width;
    const imgHeight = embeddedImage.height;

    // Resolve page size for this specific image
    const [pageW, pageH] = resolvePageSize(
      options.pageSize,
      options.orientation,
      imgWidth,
      imgHeight,
    );

    // Calculate margin in points
    const marginPt = options.margin * MM_TO_PT;

    // Calculate where to draw the image on the page
    const draw = calculateDrawRect(
      options.scaling,
      pageW,
      pageH,
      marginPt,
      imgWidth,
      imgHeight,
    );

    // Add a page
    const page = pdfDoc.addPage([pageW, pageH]);

    // Draw the image
    page.drawImage(embeddedImage, {
      x: draw.x,
      y: draw.y,
      width: draw.width,
      height: draw.height,
    });

    processed++;
    onProgress?.(
      `Processed image ${i + 1} of ${totalFiles}`,
      Math.round((processed / totalFiles) * 90),
    );
  }

  // --- 3. Generate the PDF ---
  onProgress?.("Generating PDF...", 92);

  const pdfBytes = await pdfDoc.save();

  onProgress?.("Finalizing...", 98);

  const elapsedMs = Math.round(performance.now() - startTime);
  const outputSize = pdfBytes.length;
  const pageCount = pdfDoc.getPageCount();

  // Determine output filename
  const baseName =
    files.length === 1
      ? files[0].name.replace(/\.[^.]+$/, "")
      : "images";
  const outputName = `${baseName}.pdf`;

  const outputData = new Uint8Array(pdfBytes);

  onProgress?.("Done!", 100);

  return {
    file: {
      name: outputName,
      data: outputData,
      size: outputSize,
    },
    stats: {
      inputFiles: files.length,
      outputPages: pageCount,
      outputSize,
      elapsedMs,
      averageImageSize: totalInputSize > 0 ? Math.round(totalInputSize / files.length) : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Utility: format bytes for display
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
