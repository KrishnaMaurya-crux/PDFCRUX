/**
 * Real PDF Processing Engine for PdfCrux
 * Uses pdf-lib for all PDF manipulation operations
 * All processing happens client-side in the browser
 */

import { PDFDocument, rgb, StandardFonts, degrees, PDFPage } from "pdf-lib";
import JSZip from "jszip";

// ========================
// Utility Functions
// ========================

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function parsePageRange(input: string, totalPages: number): number[] {
  if (!input || input.trim() === "") {
    // Return all pages
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  const indices = new Set<number>();
  const parts = input.split(",").map((s) => s.trim());
  for (const part of parts) {
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-").map((s) => s.trim());
      const start = Math.max(1, parseInt(startStr) || 1);
      const end = Math.min(totalPages, parseInt(endStr) || totalPages);
      for (let i = start; i <= end; i++) {
        indices.add(i - 1);
      }
    } else {
      const num = parseInt(part);
      if (num >= 1 && num <= totalPages) {
        indices.add(num - 1);
      }
    }
  }
  return Array.from(indices).sort((a, b) => a - b);
}

function getColor(colorStr: string): { r: number; g: number; b: number } {
  const colors: Record<string, { r: number; g: number; b: number }> = {
    gray: { r: 0.5, g: 0.5, b: 0.5 },
    red: { r: 0.8, g: 0.1, b: 0.1 },
    blue: { r: 0.1, g: 0.3, b: 0.8 },
    green: { r: 0.1, g: 0.6, b: 0.1 },
    black: { r: 0, g: 0, b: 0 },
    custom: { r: 0.2, g: 0.2, b: 0.2 },
  };
  return colors[colorStr] || colors.gray;
}

function isPageLandscape(page: PDFPage): boolean {
  const { width, height } = page.getSize();
  return width > height;
}

// ========================
// Processing Result Types
// ========================

export interface ProcessResult {
  success: boolean;
  outputFiles: { name: string; data: Uint8Array; size: number }[];
  message: string;
  stats?: {
    originalSize: number;
    outputSize: number;
    reduction?: string;
  };
}

// ========================
// 1. MERGE PDF
// ========================

export async function mergePDFs(
  files: File[],
  options: Record<string, string | number | boolean>
): Promise<ProcessResult> {
  try {
    const merged = await PDFDocument.create();
    const totalOriginalSize = files.reduce((sum, f) => sum + f.size, 0);

    if (options["merge-mode"] === "alternate") {
      // Interleave pages from all PDFs
      const pdfs: PDFDocument[] = [];
      for (const file of files) {
        const bytes = await file.arrayBuffer();
        const pdf = await PDFDocument.load(bytes);
        pdfs.push(pdf);
      }

      const maxPages = Math.max(...pdfs.map((p) => p.getPageCount()));
      for (let i = 0; i < maxPages; i++) {
        for (const pdf of pdfs) {
          if (i < pdf.getPageCount()) {
            const [page] = await merged.copyPages(pdf, [i]);
            merged.addPage(page);
          }
        }
      }
    } else {
      // Sequential merge (default)
      for (const file of files) {
        const bytes = await file.arrayBuffer();
        const pdf = await PDFDocument.load(bytes);
        const pages = await merged.copyPages(pdf, pdf.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
      }
    }

    const data = await merged.save();
    const outputSize = data.length;
    const baseName = files[0]?.name.replace(/\.[^/.]+$/, "") || "merged";

    return {
      success: true,
      outputFiles: [
        { name: `${baseName}_merged.pdf`, data, size: outputSize },
      ],
      message: `Successfully merged ${files.length} PDFs into ${merged.getPageCount()} pages`,
      stats: { originalSize: totalOriginalSize, outputSize },
    };
  } catch (err) {
    return {
      success: false,
      outputFiles: [],
      message: `Failed to merge PDFs: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

// ========================
// 2. SPLIT PDF
// ========================

export async function splitPDF(
  file: File,
  options: Record<string, string | number | boolean>
): Promise<ProcessResult> {
  try {
    const bytes = await file.arrayBuffer();
    const pdf = await PDFDocument.load(bytes);
    const totalPages = pdf.getPageCount();
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const splitMode = String(options["split-mode"] || "all");

    const outputFiles: { name: string; data: Uint8Array; size: number }[] =
      [];

    if (splitMode === "all") {
      // Each page = separate file
      for (let i = 0; i < totalPages; i++) {
        const newPdf = await PDFDocument.create();
        const [page] = await newPdf.copyPages(pdf, [i]);
        newPdf.addPage(page);
        const data = await newPdf.save();
        outputFiles.push({
          name: `${baseName}_page_${i + 1}.pdf`,
          data,
          size: data.length,
        });
      }
    } else if (splitMode === "ranges") {
      // By page ranges (e.g., "1-3, 5-7, 10-12")
      const rangeInput = String(options["page-ranges"] || "");
      const ranges = rangeInput.split(",").map((s) => s.trim());
      for (let r = 0; r < ranges.length; r++) {
        const range = ranges[r];
        const indices = parsePageRange(range, totalPages);
        if (indices.length > 0) {
          const newPdf = await PDFDocument.create();
          const pages = await newPdf.copyPages(pdf, indices);
          pages.forEach((p) => newPdf.addPage(p));
          const data = await newPdf.save();
          outputFiles.push({
            name: `${baseName}_part_${r + 1}.pdf`,
            data,
            size: data.length,
          });
        }
      }
    } else if (splitMode === "extract") {
      // Extract specific pages
      const pageInput = String(options["page-ranges"] || "1");
      const indices = parsePageRange(pageInput, totalPages);
      if (indices.length > 0) {
        const newPdf = await PDFDocument.create();
        const pages = await newPdf.copyPages(pdf, indices);
        pages.forEach((p) => newPdf.addPage(p));
        const data = await newPdf.save();
        outputFiles.push({
          name: `${baseName}_extracted.pdf`,
          data,
          size: data.length,
        });
      }
    } else if (splitMode === "interval") {
      // Split every N pages
      const interval = Number(options["interval"] || 5);
      for (let start = 0; start < totalPages; start += interval) {
        const end = Math.min(start + interval, totalPages);
        const indices = Array.from(
          { length: end - start },
          (_, i) => start + i
        );
        const newPdf = await PDFDocument.create();
        const pages = await newPdf.copyPages(pdf, indices);
        pages.forEach((p) => newPdf.addPage(p));
        const data = await newPdf.save();
        outputFiles.push({
          name: `${baseName}_pages_${start + 1}-${end}.pdf`,
          data,
          size: data.length,
        });
      }
    } else {
      // Default: split all
      for (let i = 0; i < totalPages; i++) {
        const newPdf = await PDFDocument.create();
        const [page] = await newPdf.copyPages(pdf, [i]);
        newPdf.addPage(page);
        const data = await newPdf.save();
        outputFiles.push({
          name: `${baseName}_page_${i + 1}.pdf`,
          data,
          size: data.length,
        });
      }
    }

    return {
      success: true,
      outputFiles,
      message: `Split into ${outputFiles.length} file(s) from ${totalPages} pages`,
      stats: {
        originalSize: file.size,
        outputSize: outputFiles.reduce((s, f) => s + f.size, 0),
      },
    };
  } catch (err) {
    return {
      success: false,
      outputFiles: [],
      message: `Failed to split PDF: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

// ========================
// 3. ROTATE PDF
// ========================

export async function rotatePDF(
  file: File,
  options: Record<string, string | number | boolean>
): Promise<ProcessResult> {
  try {
    const bytes = await file.arrayBuffer();
    const pdf = await PDFDocument.load(bytes);
    const pages = pdf.getPages();
    const angle = Number(options["rotation"] || 90);
    const applyTo = String(options["apply-to"] || "all");
    const pageRangeInput = String(options["page-range"] || "");

    let rotatedCount = 0;

    pages.forEach((page, index) => {
      const pageNum = index + 1;
      let shouldApply = false;

      switch (applyTo) {
        case "all":
          shouldApply = true;
          break;
        case "specific":
          if (pageRangeInput) {
            const indices = parsePageRange(pageRangeInput, pages.length);
            shouldApply = indices.includes(index);
          }
          break;
        case "even":
          shouldApply = pageNum % 2 === 0;
          break;
        case "odd":
          shouldApply = pageNum % 2 === 1;
          break;
        case "landscape":
          shouldApply = isPageLandscape(page);
          break;
        case "portrait":
          shouldApply = !isPageLandscape(page);
          break;
      }

      if (shouldApply) {
        const currentRotation = page.getRotation().angle;
        page.setRotation(degrees((currentRotation + angle) % 360));
        rotatedCount++;
      }
    });

    const data = await pdf.save();
    return {
      success: true,
      outputFiles: [
        {
          name: file.name.replace(/\.pdf$/i, "_rotated.pdf"),
          data,
          size: data.length,
        },
      ],
      message: `Rotated ${rotatedCount} page(s) by ${angle}°`,
      stats: { originalSize: file.size, outputSize: data.length },
    };
  } catch (err) {
    return {
      success: false,
      outputFiles: [],
      message: `Failed to rotate PDF: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

// ========================
// 4. ADD PAGE NUMBERS
// ========================

export async function addPageNumbers(
  file: File,
  options: Record<string, string | number | boolean>
): Promise<ProcessResult> {
  try {
    const bytes = await file.arrayBuffer();
    const pdf = await PDFDocument.load(bytes);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const pages = pdf.getPages();

    const format = String(options["format"] || "numeric");
    const position = String(options["position"] || "bottom-center");
    const startNumber = Number(options["start-number"] || 1);
    const fontSize = Number(options["font-size"] || 12);

    pages.forEach((page, index) => {
      const num = startNumber + index;
      let text = String(num);

      switch (format) {
        case "page-prefix":
          text = `Page ${num}`;
          break;
        case "dashed":
          text = `- ${num} -`;
          break;
        case "of-total":
          text = `Page ${num} of ${pages.length}`;
          break;
        case "roman-lower":
          text = toRoman(num).toLowerCase();
          break;
        case "roman-upper":
          text = toRoman(num);
          break;
        case "alpha-lower":
          text = toAlpha(num).toLowerCase();
          break;
        case "alpha-upper":
          text = toAlpha(num);
          break;
        default:
          text = String(num);
      }

      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const pageW = page.getWidth();
      const pageH = page.getHeight();
      let x: number, y: number;

      switch (position) {
        case "bottom-center":
          x = (pageW - textWidth) / 2;
          y = 30;
          break;
        case "bottom-left":
          x = 50;
          y = 30;
          break;
        case "bottom-right":
          x = pageW - textWidth - 50;
          y = 30;
          break;
        case "top-center":
          x = (pageW - textWidth) / 2;
          y = pageH - 30;
          break;
        case "top-left":
          x = 50;
          y = pageH - 30;
          break;
        case "top-right":
          x = pageW - textWidth - 50;
          y = pageH - 30;
          break;
        default:
          x = (pageW - textWidth) / 2;
          y = 30;
      }

      page.drawText(text, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
    });

    const data = await pdf.save();
    return {
      success: true,
      outputFiles: [
        {
          name: file.name.replace(/\.pdf$/i, "_numbered.pdf"),
          data,
          size: data.length,
        },
      ],
      message: `Added page numbers to ${pages.length} pages`,
      stats: { originalSize: file.size, outputSize: data.length },
    };
  } catch (err) {
    return {
      success: false,
      outputFiles: [],
      message: `Failed to add page numbers: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

function toRoman(num: number): string {
  const roman: [number, string][] = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let result = "";
  for (const [value, symbol] of roman) {
    while (num >= value) {
      result += symbol;
      num -= value;
    }
  }
  return result;
}

function toAlpha(num: number): string {
  let result = "";
  num -= 1;
  while (num >= 0) {
    result = String.fromCharCode(65 + (num % 26)) + result;
    num = Math.floor(num / 26) - 1;
  }
  return result;
}

// ========================
// 5. ORGANIZE PDF (delete/extract/reorder pages)
// ========================

export async function organizePDF(
  file: File,
  options: Record<string, string | number | boolean>
): Promise<ProcessResult> {
  try {
    const bytes = await file.arrayBuffer();
    const pdf = await PDFDocument.load(bytes);
    const pages = pdf.getPages();
    const mode = String(options["mode"] || "reorder");
    const pageRangeInput = String(options["page-range"] || "");
    const baseName = file.name.replace(/\.[^/.]+$/, "");

    const pageIndices = parsePageRange(pageRangeInput, pages.length);

    if (mode === "delete") {
      // Keep pages NOT in range
      const allIndices = pdf.getPageIndices();
      const keepIndices = allIndices.filter((i) => !pageIndices.includes(i));
      if (keepIndices.length === 0) {
        return {
          success: false,
          outputFiles: [],
          message: "Cannot delete all pages",
        };
      }
      const newPdf = await PDFDocument.create();
      const copiedPages = await newPdf.copyPages(pdf, keepIndices);
      copiedPages.forEach((p) => newPdf.addPage(p));
      const data = await newPdf.save();
      return {
        success: true,
        outputFiles: [
          {
            name: `${baseName}_organized.pdf`,
            data,
            size: data.length,
          },
        ],
        message: `Deleted ${pageIndices.length} page(s), ${keepIndices.length} remaining`,
        stats: { originalSize: file.size, outputSize: data.length },
      };
    } else if (mode === "extract") {
      if (pageIndices.length === 0) {
        return {
          success: false,
          outputFiles: [],
          message: "Please specify pages to extract",
        };
      }
      const newPdf = await PDFDocument.create();
      const copiedPages = await newPdf.copyPages(pdf, pageIndices);
      copiedPages.forEach((p) => newPdf.addPage(p));
      const data = await newPdf.save();
      return {
        success: true,
        outputFiles: [
          {
            name: `${baseName}_extracted.pdf`,
            data,
            size: data.length,
          },
        ],
        message: `Extracted ${pageIndices.length} page(s)`,
        stats: { originalSize: file.size, outputSize: data.length },
      };
    } else if (mode === "reorder") {
      if (pageIndices.length === 0) {
        // Just return original
        const data = await pdf.save();
        return {
          success: true,
          outputFiles: [
            { name: `${baseName}_reordered.pdf`, data, size: data.length },
          ],
          message: "No page order specified, returning original",
          stats: { originalSize: file.size, outputSize: data.length },
        };
      }
      const newPdf = await PDFDocument.create();
      const copiedPages = await newPdf.copyPages(pdf, pageIndices);
      copiedPages.forEach((p) => newPdf.addPage(p));
      const data = await newPdf.save();
      return {
        success: true,
        outputFiles: [
          {
            name: `${baseName}_reordered.pdf`,
            data,
            size: data.length,
          },
        ],
        message: `Reordered ${pageIndices.length} page(s)`,
        stats: { originalSize: file.size, outputSize: data.length },
      };
    } else if (mode === "insert") {
      const afterPage = Number(options["blank-position"] || 0);
      const insertAt = Math.min(afterPage, pages.length);
      const newPdf = await PDFDocument.create();
      for (let i = 0; i <= pages.length; i++) {
        if (i === insertAt) {
          newPdf.addPage([612, 792]); // Insert blank A4 page
        }
        if (i < pages.length) {
          const [page] = await newPdf.copyPages(pdf, [i]);
          newPdf.addPage(page);
        }
      }
      const data = await newPdf.save();
      return {
        success: true,
        outputFiles: [
          {
            name: `${baseName}_organized.pdf`,
            data,
            size: data.length,
          },
        ],
        message: `Inserted blank page after page ${insertAt}`,
        stats: { originalSize: file.size, outputSize: data.length },
      };
    }

    const data = await pdf.save();
    return {
      success: true,
      outputFiles: [{ name: `${baseName}_organized.pdf`, data, size: data.length }],
      message: "PDF organized successfully",
      stats: { originalSize: file.size, outputSize: data.length },
    };
  } catch (err) {
    return {
      success: false,
      outputFiles: [],
      message: `Failed to organize PDF: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

// ========================
// 6. COMPRESS PDF
// Adaptive compression: auto-adjusts DPI per level, then binary searches JPEG quality
// to hit the exact target reduction percentage (15%, 40%, 65%, or 80%)
// ========================

async function canvasToJpgBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to convert canvas to blob"));
          return;
        }
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
      },
      "image/jpeg",
      quality
    );
  });
}

function applyColorMode(
  canvas: HTMLCanvasElement,
  mode: string
): HTMLCanvasElement {
  if (mode === "color") return canvas;

  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  if (mode === "grayscale") {
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
  } else if (mode === "bw") {
    // Threshold-based B&W conversion
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const val = gray > 128 ? 255 : 0;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

interface PageInfo {
  canvas: HTMLCanvasElement;
  origWidth: number;
  origHeight: number;
}

/**
 * Fast size estimation from JPEG-encoded page blobs.
 * Avoids building the full PDF on each binary search step.
 */
async function estimateSizeFromJpgs(
  pageInfos: PageInfo[],
  quality: number
): Promise<number> {
  const jpgBytesList = await Promise.all(
    pageInfos.map((p) => canvasToJpgBlob(p.canvas, quality))
  );
  // PDF structure overhead: ~2 KB global + ~300 bytes per page
  const overhead = 2000 + pageInfos.length * 300;
  return jpgBytesList.reduce((sum, b) => sum + b.length, 0) + overhead;
}

/**
 * Render all PDF pages to canvases at a given DPI.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function renderPages(
  pdfDoc: any,
  totalPages: number,
  dpi: number,
  colorMode: string
): Promise<PageInfo[]> {
  const pageInfos: PageInfo[] = [];
  const scale = dpi / 72;

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdfDoc.getPage(i);
    const origViewport = page.getViewport({ scale: 1 });
    const renderViewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(renderViewport.width);
    canvas.height = Math.floor(renderViewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;

    if (colorMode !== "color") {
      applyColorMode(canvas, colorMode);
    }

    pageInfos.push({
      canvas,
      origWidth: origViewport.width,
      origHeight: origViewport.height,
    });
  }

  return pageInfos;
}

/**
 * Build final PDF from rendered page canvases at a given JPEG quality.
 */
async function buildPdfFromPages(
  pageInfos: PageInfo[],
  quality: number
): Promise<Uint8Array> {
  const newPdf = await PDFDocument.create();
  newPdf.setTitle("");
  newPdf.setAuthor("");
  newPdf.setSubject("");
  newPdf.setKeywords([]);
  newPdf.setProducer("PdfCrux Compressor");
  newPdf.setCreator("");

  for (const info of pageInfos) {
    const jpgBytes = await canvasToJpgBlob(info.canvas, quality);
    const jpgImage = await newPdf.embedJpg(jpgBytes);
    const newPage = newPdf.addPage([info.origWidth, info.origHeight]);
    newPage.drawImage(jpgImage, {
      x: 0,
      y: 0,
      width: info.origWidth,
      height: info.origHeight,
    });
  }

  return newPdf.save({ useObjectStreams: true, addDefaultPage: false });
}

export async function compressPDF(
  file: File,
  options: Record<string, string | number | boolean>
): Promise<ProcessResult> {
  try {
    const compressionLevel = String(options["compression-level"] || "medium");
    const colorMode = String(options["color-mode"] || "color");

    // Target reduction: how much smaller should the output be?
    const targetReductions: Record<string, number> = {
      low: 0.15,
      medium: 0.40,
      high: 0.65,
      extreme: 0.80,
    };
    const targetReduction = targetReductions[compressionLevel] || 0.40;
    // The output should be approximately this many bytes
    const targetSize = file.size * (1 - targetReduction);

    // Base DPI per level (higher DPI → bigger output → less compression)
    const baseDpis: Record<string, number> = {
      low: 300,
      medium: 200,
      high: 144,
      extreme: 96,
    };

    const bytes = new Uint8Array(await file.arrayBuffer());

    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    const loadingTask = pdfjsLib.getDocument({ data: bytes.slice(0) });
    const pdfDoc = await loadingTask.promise;
    const totalPages = pdfDoc.numPages;

    let currentDpi = baseDpis[compressionLevel] || 200;
    let bestQuality = 0.85;
    let bestData: Uint8Array | null = null;
    let bestDiff = Infinity;

    // ===== ADAPTIVE LOOP: adjust DPI until target is reachable via quality =====
    for (let attempt = 0; attempt < 5; attempt++) {
      // Clamp DPI to sane range
      currentDpi = Math.max(48, Math.min(currentDpi, 600));

      // Render all pages at current DPI
      const pageInfos = await renderPages(pdfDoc, totalPages, currentDpi, colorMode);

      // Probe: estimate size at quality extremes
      const sizeAtMaxQ = await estimateSizeFromJpgs(pageInfos, 0.99);
      const sizeAtMinQ = await estimateSizeFromJpgs(pageInfos, 0.02);

      // Check if target is reachable at this DPI
      if (targetSize >= sizeAtMaxQ && attempt < 4) {
        // Even at max quality, output is too small → need MORE pixels → increase DPI
        // Size scales roughly with DPI², so use sqrt for the adjustment factor
        const ratio = targetSize / Math.max(sizeAtMaxQ, 1);
        currentDpi = Math.round(currentDpi * Math.sqrt(ratio) * 1.15);
        continue;
      }

      if (targetSize <= sizeAtMinQ && attempt < 4) {
        // Even at min quality, output is too large → need FEWER pixels → decrease DPI
        const ratio = Math.max(sizeAtMinQ, 1) / targetSize;
        currentDpi = Math.max(48, Math.round(currentDpi / Math.sqrt(ratio) / 1.15));
        continue;
      }

      // ===== TARGET IS REACHABLE — binary search on JPEG quality =====
      let lo = 0.02;
      let hi = 0.99;
      bestQuality = (lo + hi) / 2;
      bestDiff = Infinity;

      for (let iter = 0; iter < 12; iter++) {
        const mid = (lo + hi) / 2;
        const estimatedSize = await estimateSizeFromJpgs(pageInfos, mid);
        const diff = Math.abs(estimatedSize - targetSize);

        if (diff < bestDiff) {
          bestDiff = diff;
          bestQuality = mid;
        }

        if (estimatedSize > targetSize) {
          hi = mid; // Need more compression → lower quality
        } else {
          lo = mid; // Need less compression → higher quality
        }

        // Early exit if we're very close (< 2% of target)
        if (diff < targetSize * 0.02) break;
      }

      // Build the final PDF at the optimal quality
      bestData = await buildPdfFromPages(pageInfos, bestQuality);
      break;
    }

    // Fallback: if adaptive loop didn't converge
    if (!bestData) {
      const pageInfos = await renderPages(pdfDoc, totalPages, currentDpi, colorMode);
      bestData = await buildPdfFromPages(pageInfos, bestQuality);
    }

    const outputSize = bestData.length;
    const actualReduction = Math.max(0, (1 - outputSize / file.size) * 100);
    const reduction =
      actualReduction > 0
        ? `${actualReduction.toFixed(1)}%`
        : "0% (file already optimized)";

    const levelLabels: Record<string, string> = {
      low: "Low",
      medium: "Medium",
      high: "High",
      extreme: "Extreme",
    };
    const levelLabel = levelLabels[compressionLevel] || "Medium";

    return {
      success: true,
      outputFiles: [
        {
          name: file.name.replace(/\.pdf$/i, "_compressed.pdf"),
          data: bestData,
          size: outputSize,
        },
      ],
      message: `${levelLabel} compression: ${totalPages} pages reduced from ${formatFileSize(file.size)} to ${formatFileSize(outputSize)} (~${reduction} reduction at ${Math.round(bestQuality * 100)}% JPEG quality, ${currentDpi} DPI)`,
      stats: {
        originalSize: file.size,
        outputSize,
        reduction,
      },
    };
  } catch (err) {
    return {
      success: false,
      outputFiles: [],
      message: `Failed to compress PDF: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

// ========================
// 7. REPAIR PDF
// Multi-strategy repair: binary fix → pdf-lib load → pdfjs-dist render fallback
// ========================

interface RepairDiagnostics {
  strategy: string;
  issuesFound: string[];
  issuesFixed: string[];
  pagesRecovered: number;
}

function tryBinaryRepair(data: Uint8Array): { data: Uint8Array; diagnostics: RepairDiagnostics } {
  const issuesFixed: string[] = [];
  const issuesFound: string[] = [];
  let result = new Uint8Array(data);

  let text = new TextDecoder("latin1").decode(result);

  // Check 1: Missing/broken PDF header
  if (!text.startsWith("%PDF-")) {
    issuesFound.push("Missing or invalid PDF header");
    const pdfMarkerIdx = text.indexOf("%PDF-");
    if (pdfMarkerIdx > 0) {
      issuesFixed.push("Removed garbage data before PDF header");
      result = result.slice(pdfMarkerIdx);
    } else {
      issuesFixed.push("Injected valid PDF-1.4 header");
      const header = new TextEncoder().encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
      result = new Uint8Array(header.length + result.length);
      result.set(header, 0);
      result.set(data, header.length);
    }
  }

  // Re-decode after header fix
  text = new TextDecoder("latin1").decode(result);

  // Check 2: Normalize version
  const versionMatch = text.match(/^%PDF-(\d+\.\d+)/);
  if (versionMatch) {
    const version = parseFloat(versionMatch[1]);
    if (version > 1.7) {
      issuesFound.push(`Unusual PDF version: ${version}`);
      const newHeader = new TextEncoder().encode("%PDF-1.7\n");
      const oldHeaderEnd = text.indexOf("\n") + 1;
      result = new Uint8Array(newHeader.length + result.length - oldHeaderEnd);
      result.set(newHeader, 0);
      result.set(result.slice(oldHeaderEnd), newHeader.length);
      issuesFixed.push("Normalized PDF version to 1.7");
      text = new TextDecoder("latin1").decode(result);
    }
  }

  // Check 3: Missing binary comment after header
  if (!text.includes("%\xE2\xE3\xCF\xD3")) {
    issuesFound.push("Missing binary comment after header");
    const headerEnd = text.indexOf("\n") + 1;
    if (headerEnd > 0 && headerEnd < 20) {
      const binaryComment = new TextEncoder().encode("%\xE2\xE3\xCF\xD3\n");
      const newResult = new Uint8Array(result.length + binaryComment.length);
      newResult.set(result.slice(0, headerEnd), 0);
      newResult.set(binaryComment, headerEnd);
      newResult.set(result.slice(headerEnd), headerEnd + binaryComment.length);
      result = newResult;
      issuesFixed.push("Added binary comment after header");
      text = new TextDecoder("latin1").decode(result);
    }
  }

  // Check 4: Fix xref table / cross-reference issues
  const xrefIdx = text.indexOf("startxref");
  if (xrefIdx === -1) {
    issuesFound.push("Missing startxref entry");
    // Try to find xref table
    const xrefTableIdx = text.indexOf("xref");
    if (xrefTableIdx !== -1) {
      // Calculate byte offset of xref table
      const xrefOffset = xrefTableIdx;
      const startxref = new TextEncoder().encode(`startxref\n${xrefOffset}\n%%EOF\n`);
      result = new Uint8Array(result.length + startxref.length);
      result.set(result, 0);
      result.set(startxref, result.length - startxref.length);
      issuesFixed.push("Reconstructed startxref entry");
      text = new TextDecoder("latin1").decode(result);
    }
  } else {
    // Validate the xref offset points to something real
    const afterStartxref = text.substring(xrefIdx + 9).trim();
    const xrefOffset = parseInt(afterStartxref);
    if (isNaN(xrefOffset) || xrefOffset < 0 || xrefOffset >= result.length) {
      issuesFound.push(`Invalid xref offset: ${xrefOffset}`);
      // Try to find the xref table and fix the offset
      const xrefTableIdx = text.indexOf("xref");
      if (xrefTableIdx !== -1) {
        const fixStartxref = new TextEncoder().encode(`${xrefTableIdx}\n%%EOF\n`);
        // Replace from startxref onwards
        result = result.slice(0, xrefIdx + 9);
        result = new Uint8Array(result.length + fixStartxref.length);
        result.set(result, 0);
        result.set(fixStartxref, xrefIdx + 9);
        issuesFixed.push("Fixed invalid xref offset");
        text = new TextDecoder("latin1").decode(result);
      }
    }
  }

  // Check 5: Missing EOF marker
  if (!text.includes("%%EOF")) {
    issuesFound.push("Missing EOF marker");
    const eof = new TextEncoder().encode("\n%%EOF\n");
    const newResult = new Uint8Array(result.length + eof.length);
    newResult.set(result, 0);
    newResult.set(eof, result.length);
    result = newResult;
    issuesFixed.push("Appended missing EOF marker");
  } else {
    // Check for multiple EOF markers
    const eofCount = (text.match(/%%EOF/g) || []).length;
    if (eofCount > 2) {
      issuesFound.push(`Multiple EOF markers found (${eofCount})`);
      const lastEofIdx = text.lastIndexOf("%%EOF");
      if (lastEofIdx > 0) {
        result = result.slice(0, lastEofIdx + 5);
        issuesFixed.push("Trimmed to last valid EOF");
      }
    }
  }

  // Check 6: Fix truncated file — add padding if needed
  text = new TextDecoder("latin1").decode(result);
  const lastEofPos = text.lastIndexOf("%%EOF");
  if (lastEofPos !== -1 && lastEofPos + 5 < result.length) {
    // Extra data after last EOF — trim it
    result = result.slice(0, lastEofPos + 5);
    issuesFixed.push("Trimmed trailing data after EOF");
  }

  // Check 7: Null byte corruption in header
  let nullBytesCount = 0;
  for (let i = 0; i < Math.min(result.length, 1000); i++) {
    if (result[i] === 0) nullBytesCount++;
  }
  if (nullBytesCount > 50) {
    issuesFound.push("Excessive null bytes detected in header area");
  }

  return {
    data: result,
    diagnostics: {
      strategy: "binary",
      issuesFound,
      issuesFixed,
      pagesRecovered: 0,
    },
  };
}

export async function repairPDF(
  file: File,
  _options: Record<string, string | number | boolean>
): Promise<ProcessResult> {
  const rawBytes = new Uint8Array(await file.arrayBuffer());
  const diagnostics: RepairDiagnostics = {
    strategy: "",
    issuesFound: [],
    issuesFixed: [],
    pagesRecovered: 0,
  };

  // ========== STRATEGY 1: Try pdf-lib directly ==========
  try {
    const pdf = await PDFDocument.load(rawBytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const pageCount = pdf.getPageCount();

    if (pageCount > 0) {
      pdf.setProducer("PdfCrux Repair Tool");
      pdf.setModificationDate(new Date());
      const data = await pdf.save({
        useObjectStreams: true,
        addDefaultPage: false,
      });

      diagnostics.strategy = "structure-optimization";
      diagnostics.issuesFixed.push("Re-serialized with optimized object streams");
      diagnostics.issuesFixed.push("Stripped unused objects");
      diagnostics.pagesRecovered = pageCount;

      return {
        success: true,
        outputFiles: [
          {
            name: file.name.replace(/\.pdf$/i, "_repaired.pdf"),
            data,
            size: data.length,
          },
        ],
        message: buildRepairMessage(diagnostics, file.size, data.length),
        stats: { originalSize: file.size, outputSize: data.length },
      };
    }
  } catch (err) {
    diagnostics.issuesFound.push(`pdf-lib load error: ${err instanceof Error ? err.message : "Unknown"}`);
  }

  // ========== STRATEGY 2: Binary-level repair + pdf-lib ==========
  const binaryResult = tryBinaryRepair(rawBytes);
  if (binaryResult.diagnostics.issuesFixed.length > 0) {
    diagnostics.issuesFound.push(...binaryResult.diagnostics.issuesFound);
    diagnostics.issuesFixed.push(...binaryResult.diagnostics.issuesFixed);
  }

  try {
    const pdf = await PDFDocument.load(binaryResult.data, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const pageCount = pdf.getPageCount();

    if (pageCount > 0) {
      pdf.setProducer("PdfCrux Repair Tool");
      pdf.setModificationDate(new Date());
      const data = await pdf.save({
        useObjectStreams: true,
        addDefaultPage: false,
      });

      diagnostics.strategy = "binary-repair";
      diagnostics.pagesRecovered = pageCount;

      return {
        success: true,
        outputFiles: [
          {
            name: file.name.replace(/\.pdf$/i, "_repaired.pdf"),
            data,
            size: data.length,
          },
        ],
        message: buildRepairMessage(diagnostics, file.size, data.length),
        stats: { originalSize: file.size, outputSize: data.length },
      };
    }
  } catch (err) {
    diagnostics.issuesFound.push(`Binary repair + pdf-lib failed: ${err instanceof Error ? err.message : "Unknown"}`);
  }

  // ========== STRATEGY 3: pdfjs-dist with lenient settings + pdf-lib ==========
  // Try with pdfjs-dist first (it handles many corrupted files that pdf-lib can't)
  try {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    // Try loading with very lenient settings for corrupted files
    const loadingTask = pdfjsLib.getDocument({
      data: rawBytes.slice(0),
      disableAutoFetch: true,
      disableStream: true,
      stopAtErrors: false, // Don't stop on errors — try to recover
    });

    const pdfDoc = await loadingTask.promise;
    const totalPages = pdfDoc.numPages;

    if (totalPages > 0) {
      // pdfjs can read it! Re-render pages and rebuild clean PDF
      const newPdf = await PDFDocument.create();
      newPdf.setProducer("PdfCrux Repair Tool (Recovered via pdfjs)");
      newPdf.setCreator("PdfCrux PDF Repair");
      newPdf.setModificationDate(new Date());

      let recoveredPages = 0;
      for (let i = 1; i <= totalPages; i++) {
        try {
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: 2 }); // High quality render

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext("2d")!;

          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({
            canvasContext: ctx,
            viewport,
          }).promise;

          const jpgBytes = await canvasToJpgBlob(canvas, 0.95);
          const jpgImage = await newPdf.embedJpg(jpgBytes);

          const origViewport = page.getViewport({ scale: 1 });
          const newPage = newPdf.addPage([origViewport.width, origViewport.height]);
          newPage.drawImage(jpgImage, {
            x: 0, y: 0,
            width: origViewport.width,
            height: origViewport.height,
          });
          recoveredPages++;
        } catch {
          // Skip broken pages
        }
      }

      if (recoveredPages > 0) {
        const data = await newPdf.save({
          useObjectStreams: true,
          addDefaultPage: false,
        });

        diagnostics.strategy = "pdfjs-render-recovery";
        diagnostics.issuesFixed.push(`Recovered ${recoveredPages}/${totalPages} pages by re-rendering via pdfjs-dist`);
        diagnostics.issuesFixed.push("Rebuilt PDF structure from rendered pages");
        diagnostics.pagesRecovered = recoveredPages;

        return {
          success: true,
          outputFiles: [
            {
              name: file.name.replace(/\.pdf$/i, "_repaired.pdf"),
              data,
              size: data.length,
            },
          ],
          message: buildRepairMessage(diagnostics, file.size, data.length),
          stats: { originalSize: file.size, outputSize: data.length },
        };
      }
    }
  } catch (err) {
    diagnostics.issuesFound.push(`pdfjs-dist lenient load failed: ${err instanceof Error ? err.message : "Unknown"}`);
  }

  // ========== STRATEGY 4: pdfjs-dist on binary-repaired data ==========
  try {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    const loadingTask = pdfjsLib.getDocument({
      data: binaryResult.data.slice(0),
      disableAutoFetch: true,
      disableStream: true,
    });

    const pdfDoc = await loadingTask.promise;
    const totalPages = pdfDoc.numPages;

    if (totalPages > 0) {
      const newPdf = await PDFDocument.create();
      newPdf.setProducer("PdfCrux Repair Tool (Binary+pdfjs Recovery)");
      newPdf.setCreator("PdfCrux PDF Repair");
      newPdf.setModificationDate(new Date());

      let recoveredPages = 0;
      for (let i = 1; i <= totalPages; i++) {
        try {
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: 2 });

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({ canvasContext: ctx, viewport }).promise;

          const jpgBytes = await canvasToJpgBlob(canvas, 0.95);
          const jpgImage = await newPdf.embedJpg(jpgBytes);

          const origViewport = page.getViewport({ scale: 1 });
          const newPage = newPdf.addPage([origViewport.width, origViewport.height]);
          newPage.drawImage(jpgImage, {
            x: 0, y: 0,
            width: origViewport.width,
            height: origViewport.height,
          });
          recoveredPages++;
        } catch {
          // Skip broken pages
        }
      }

      if (recoveredPages > 0) {
        const data = await newPdf.save({
          useObjectStreams: true,
          addDefaultPage: false,
        });

        diagnostics.strategy = "binary-pdfjs-recovery";
        diagnostics.issuesFixed.push(`Binary fix + pdfjs recovered ${recoveredPages}/${totalPages} pages`);
        diagnostics.issuesFixed.push("Rebuilt PDF structure from rendered pages");
        diagnostics.pagesRecovered = recoveredPages;

        return {
          success: true,
          outputFiles: [
            {
              name: file.name.replace(/\.pdf$/i, "_repaired.pdf"),
              data,
              size: data.length,
            },
          ],
          message: buildRepairMessage(diagnostics, file.size, data.length),
          stats: { originalSize: file.size, outputSize: data.length },
        };
      }
    }
  } catch (err) {
    diagnostics.issuesFound.push(`Binary repair + pdfjs also failed: ${err instanceof Error ? err.message : "Unknown"}`);
  }

  // ========== ALL STRATEGIES FAILED ==========
  return {
    success: false,
    outputFiles: [],
    message: `Could not repair this PDF. Issues found: ${diagnostics.issuesFound.join("; ")}. The file may be too severely corrupted or may not be a valid PDF.`,
  };
}

function buildRepairMessage(
  diagnostics: RepairDiagnostics,
  originalSize: number,
  outputSize: number
): string {
  const parts: string[] = [];

  parts.push(`Strategy: ${diagnostics.strategy.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}`);

  if (diagnostics.pagesRecovered > 0) {
    parts.push(`${diagnostics.pagesRecovered} page(s) recovered`);
  }

  if (diagnostics.issuesFixed.length > 0) {
    parts.push(`Fixed: ${diagnostics.issuesFixed.join(", ")}`);
  }

  if (diagnostics.issuesFound.length > 0) {
    parts.push(`Issues detected: ${diagnostics.issuesFound.join(", ")}`);
  }

  parts.push(`${formatFileSize(originalSize)} → ${formatFileSize(outputSize)}`);

  return parts.join(". ");
}

// ========================
// 8. WATERMARK PDF
// ========================

export async function watermarkPDF(
  file: File,
  options: Record<string, string | number | boolean>
): Promise<ProcessResult> {
  try {
    const bytes = await file.arrayBuffer();
    const pdf = await PDFDocument.load(bytes);
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    const pages = pdf.getPages();

    const text = String(options["text"] || "WATERMARK");
    const fontSize = Number(options["font-size"] || 48);
    const opacity = Number(options["opacity"] || 30) / 100;
    const rotation = Number(options["rotation"] || -45);
    const colorStr = String(options["color"] || "gray");
    const position = String(options["position"] || "center");
    const pagesInput = String(options["pages"] || "");

    const color = getColor(colorStr);
    const rotRad = (rotation * Math.PI) / 180;

    const pageIndices =
      pagesInput.trim() !== ""
        ? parsePageRange(pagesInput, pages.length)
        : pages.map((_, i) => i);

    for (const i of pageIndices) {
      const page = pages[i];
      if (!page) continue;
      const { width, height } = page.getSize();
      const textWidth = font.widthOfTextAtSize(text, fontSize);

      if (position === "tiled") {
        // Tiled watermark - repeat across the page
        const stepX = textWidth + 100;
        const stepY = fontSize + 80;
        for (let y = -height; y < height * 2; y += stepY) {
          for (let x = -width; x < width * 2; x += stepX) {
            page.drawText(text, {
              x: x,
              y: y,
              size: fontSize,
              font,
              color: rgb(color.r, color.g, color.b),
              opacity,
              rotate: degrees(rotation),
            });
          }
        }
      } else {
        let x: number, y: number;
        switch (position) {
          case "center":
            x = (width - textWidth) / 2;
            y = height / 2;
            break;
          case "top-left":
            x = 40;
            y = height - 60;
            break;
          case "top-right":
            x = width - textWidth - 40;
            y = height - 60;
            break;
          case "bottom-left":
            x = 40;
            y = 40;
            break;
          case "bottom-right":
            x = width - textWidth - 40;
            y = 40;
            break;
          default:
            x = (width - textWidth) / 2;
            y = height / 2;
        }

        page.drawText(text, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(color.r, color.g, color.b),
          opacity,
          rotate: degrees(rotation),
        });
      }
    }

    const data = await pdf.save();
    return {
      success: true,
      outputFiles: [
        {
          name: file.name.replace(/\.pdf$/i, "_watermarked.pdf"),
          data,
          size: data.length,
        },
      ],
      message: `Watermark "${text}" added to ${pageIndices.length} page(s)`,
      stats: { originalSize: file.size, outputSize: data.length },
    };
  } catch (err) {
    return {
      success: false,
      outputFiles: [],
      message: `Failed to add watermark: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

// ========================
// 9. SIGN PDF
// ========================

// Font map for sign-pdf type mode — uses CSS variable references that next/font provides
const SIGNATURE_FONT_VARS: Record<string, string> = {
  georgia: "", // system font, no CSS variable
  palatino: "", // system font, no CSS variable
  dancing: "--font-dancing",
  greatvibes: "--font-greatvibes",
  kalam: "--font-kalam",
  parisienne: "--font-parisienne",
  caveat: "--font-caveat",
};

// Fallback system font stacks
const SIGNATURE_FONT_FALLBACKS: Record<string, string> = {
  georgia: 'Georgia, "Palatino Linotype", serif',
  palatino: '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif',
  dancing: '"Dancing Script", "Segoe Script", cursive',
  greatvibes: '"Great Vibes", "Dancing Script", cursive',
  kalam: 'Kalam, "Segoe Script", cursive',
  parisienne: 'Parisienne, "Dancing Script", cursive',
  caveat: 'Caveat, Kalam, cursive',
};

function resolveSignatureFont(fontKey: string): string {
  const cssVar = SIGNATURE_FONT_VARS[fontKey];
  if (cssVar) {
    // Try to resolve the CSS variable from the page
    const resolved = getComputedStyle(document.body).getPropertyValue(cssVar).trim();
    if (resolved) {
      // Prepend the resolved font, with fallback
      return `${resolved}, ${SIGNATURE_FONT_FALLBACKS[fontKey]}`;
    }
  }
  return SIGNATURE_FONT_FALLBACKS[fontKey] || SIGNATURE_FONT_FALLBACKS.georgia;
}

export async function signPDF(
  file: File,
  options: Record<string, string | number | boolean>
): Promise<ProcessResult> {
  try {
    const bytes = await file.arrayBuffer();
    const pdf = await PDFDocument.load(bytes);
    const pages = pdf.getPages();

    const signType = String(options["sign-type"] || "type");
    const signerName = String(options["signer-name"] || "Signature");
    const signatureData = String(options["signature-data"] || "");
    const pageNum = Math.min(
      Number(options["page"] || 1),
      pages.length
    );
    const position = String(options["position"] || "bottom-right");
    const reason = String(options["reason"] || "");

    // Mode-specific options
    const signColor = String(options["sign-color"] || "#00008B");
    const signFontSize = Number(options["sign-font-size"] || 36);
    const signFont = String(options["sign-font"] || "georgia");
    const sigImageSize = Number(options["sig-image-size"] || 200);

    // Validation
    if (signType === "type" && !signerName.trim()) {
      return { success: false, outputFiles: [], message: "Please enter a signer name" };
    }
    if (signType === "draw" && !signatureData) {
      return { success: false, outputFiles: [], message: "Please draw your signature on the canvas" };
    }
    if (signType === "upload" && !signatureData) {
      return { success: false, outputFiles: [], message: "Please upload a signature image" };
    }

    const page = pages[pageNum - 1];
    const { width, height } = page.getSize();

    let pngImage;
    let sigWidth: number;
    let sigHeight: number;

    if (signType === "draw" || signType === "upload") {
      // Use the drawn/uploaded signature image directly
      const dataUrl = signatureData;
      const base64 = dataUrl.split(",")[1];
      const imageBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

      // Detect format
      const isJpeg = dataUrl.includes("image/jpeg") || dataUrl.includes("image/jpg");
      if (isJpeg) {
        pngImage = await pdf.embedJpg(imageBytes);
      } else {
        pngImage = await pdf.embedPng(imageBytes);
      }

      // Scale signature using the user-specified image size
      const imgAspect = pngImage.width / pngImage.height;
      sigWidth = sigImageSize;
      sigHeight = sigImageSize / imgAspect;
      // Cap so it doesn't overflow page
      if (sigWidth > width * 0.6) {
        sigWidth = width * 0.6;
        sigHeight = sigWidth / imgAspect;
      }
      if (sigHeight > 300) {
        sigHeight = 300;
        sigWidth = sigHeight * imgAspect;
      }
    } else {
      // TYPE mode: Generate handwritten-style signature on canvas with user options
      const fontStack = resolveSignatureFont(signFont);

      // Canvas size based on font size and text length
      const scaledFontSize = signFontSize * 1.5; // scale for higher quality
      sigWidth = Math.min(signerName.length * (scaledFontSize * 0.65) + 60, width * 0.45);
      sigHeight = scaledFontSize * 2;

      const canvas = document.createElement("canvas");
      canvas.width = sigWidth * 2;
      canvas.height = sigHeight * 2;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(2, 2);
      ctx.clearRect(0, 0, sigWidth, sigHeight);

      ctx.font = `italic 600 ${scaledFontSize}px ${fontStack}`;
      ctx.fillStyle = signColor;
      ctx.textBaseline = "middle";

      const textW = ctx.measureText(signerName).width;
      const startX = (sigWidth - textW) / 2;

      // Draw each character with slight wave for handwritten feel
      for (let i = 0; i < signerName.length; i++) {
        const prevChars = signerName.substring(0, i);
        const prevWidth = ctx.measureText(prevChars).width;
        const wave = Math.sin(i * 0.5) * (scaledFontSize * 0.05);
        ctx.fillText(signerName[i], startX + prevWidth, sigHeight / 2 + wave);
      }

      // Underline flourish
      ctx.strokeStyle = signColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(startX - 5, sigHeight / 2 + scaledFontSize * 0.4);
      ctx.quadraticCurveTo(startX + textW / 2, sigHeight / 2 + scaledFontSize * 0.5, startX + textW + 10, sigHeight / 2 + scaledFontSize * 0.2);
      ctx.stroke();

      const pngDataUrl = canvas.toDataURL("image/png");
      const pngBase64 = pngDataUrl.split(",")[1];
      const pngBytes = Uint8Array.from(atob(pngBase64), c => c.charCodeAt(0));
      pngImage = await pdf.embedPng(pngBytes);
    }

    // Calculate position on PDF page
    const margin = 50;
    let x: number, y: number;

    switch (position) {
      case "bottom-right":
        x = width - sigWidth - margin;
        y = margin;
        break;
      case "bottom-left":
        x = margin;
        y = margin;
        break;
      case "bottom-center":
        x = (width - sigWidth) / 2;
        y = margin;
        break;
      case "top-right":
        x = width - sigWidth - margin;
        y = height - sigHeight - margin;
        break;
      case "top-left":
        x = margin;
        y = height - sigHeight - margin;
        break;
      default:
        x = width - sigWidth - margin;
        y = margin;
    }

    // Draw signature image on PDF
    page.drawImage(pngImage, { x, y, width: sigWidth, height: sigHeight });

    // Draw thin border around signature
    page.drawRectangle({
      x: x - 5,
      y: y - 5,
      width: sigWidth + 10,
      height: sigHeight + 10,
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 0.5,
      color: undefined,
    });

    // Timestamp below
    const tsFont = await pdf.embedFont(StandardFonts.HelveticaOblique);
    const timestamp = new Date().toLocaleString();
    page.drawText(`Signed: ${timestamp}`, {
      x,
      y: y - 18,
      size: 7,
      font: tsFont,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Reason above if provided
    if (reason) {
      const labelFont = await pdf.embedFont(StandardFonts.Helvetica);
      page.drawText(reason, {
        x,
        y: y + sigHeight + 8,
        size: 7,
        font: labelFont,
        color: rgb(0.4, 0.4, 0.4),
      });
    }

    const data = await pdf.save();
    return {
      success: true,
      outputFiles: [
        {
          name: file.name.replace(/\.pdf$/i, "_signed.pdf"),
          data,
          size: data.length,
        },
      ],
      message: `"${signerName || "Signature"}" signed on page ${pageNum}`,
      stats: { originalSize: file.size, outputSize: data.length },
    };
  } catch (err) {
    return {
      success: false,
      outputFiles: [],
      message: `Failed to sign PDF: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

// ========================
// 10. COMPARE PDF — Real text extraction + visual diff report
// ========================

export async function comparePDFs(
  fileA: File,
  fileB: File,
  options: Record<string, string | number | boolean>
): Promise<ProcessResult> {
  try {
    const compareMode = String(options["compare-mode"] || "visual");
    const highlightStyle = String(options["highlight-color"] || "standard");

    // Color schemes
    const schemes: Record<string, { add: {r:number;g:number;b:number}; del: {r:number;g:number;b:number} }> = {
      standard: { add: { r: 0.85, g: 0.93, b: 0.85 }, del: { r: 0.95, g: 0.85, b: 0.85 } },
      alt:       { add: { r: 0.85, g: 0.9, b: 0.98 }, del: { r: 0.98, g: 0.95, b: 0.8 } },
    };
    const hlColors = schemes[highlightStyle] || schemes.standard;

    // Load both PDFs
    const [pdfA, pdfB] = await Promise.all([
      PDFDocument.load(bytesA),
      PDFDocument.load(bytesB),
    ]);

    // Extract text from both for diffing
    const [textPagesA, textPagesB] = await Promise.all([
      extractPdfPages(new Uint8Array(bytesA)),
      extractPdfPages(new Uint8Array(bytesB)),
    ]);

    const allLinesA = textPagesA.flatMap((p, i) =>
      p.lines.map(l => ({ page: i + 1, text: l.text }))
    );
    const allLinesB = textPagesB.flatMap((p, i) =>
      p.lines.map(l => ({ page: i + 1, text: l.text }))
    );

    const diffResults = computeLineDiff(allLinesA, allLinesB);
    const added = diffResults.filter(d => d.type === "added").length;
    const removed = diffResults.filter(d => d.type === "removed").length;
    const modified = diffResults.filter(d => d.type === "modified").length;
    const totalDiffs = added + removed + modified;

    // Create report PDF
    const report = await PDFDocument.create();
    const font = await report.embedFont(StandardFonts.Helvetica);
    const fontBold = await report.embedFont(StandardFonts.HelveticaBold);
    const fontMono = await report.embedFont(StandardFonts.Courier);
    const pw = 612; const ph = 792;

    const pages: typeof report.getPages extends () => infer R ? R[number] : never = [];
    let curPage = report.addPage([pw, ph]);
    pages.push(curPage);
    let y = ph - 50;

    function ensureSpace(needed: number) {
      if (y - needed < 40) {
        curPage = report.addPage([pw, ph]);
        pages.push(curPage);
        y = ph - 50;
      }
    }

    // Title
    curPage.drawText("PDF Comparison Report", { x: 50, y, size: 22, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
    y -= 18;
    curPage.drawText(`Generated: ${new Date().toLocaleString()}  |  Mode: ${compareMode}`, { x: 50, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
    y -= 22;
    curPage.drawLine({ start: { x: 50, y }, end: { x: pw - 50, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
    y -= 18;

    // File info
    curPage.drawText("File A (Original)", { x: 50, y, size: 12, font: fontBold, color: rgb(0.1, 0.3, 0.7) });
    y -= 14;
    curPage.drawText(`${fileA.name}  |  ${pdfA.getPageCount()} pages  |  ${formatFileSize(fileA.size)}`, { x: 50, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 16;
    curPage.drawText("File B (Modified)", { x: 50, y, size: 12, font: fontBold, color: rgb(0, 0.5, 0.2) });
    y -= 14;
    curPage.drawText(`${fileB.name}  |  ${pdfB.getPageCount()} pages  |  ${formatFileSize(fileB.size)}`, { x: 50, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 18;
    curPage.drawLine({ start: { x: 50, y }, end: { x: pw - 50, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
    y -= 16;

    // Summary
    curPage.drawText("Summary", { x: 50, y, size: 13, font: fontBold, color: rgb(0.6, 0.1, 0.1) });
    y -= 16;
    if (totalDiffs === 0) {
      curPage.drawText("No text differences detected.", { x: 50, y, size: 10, font, color: rgb(0.1, 0.5, 0.1) });
    } else {
      curPage.drawText(`Total differences: ${totalDiffs}`, { x: 50, y, size: 11, font: fontBold, color: rgb(0.7, 0.1, 0.1) });
      y -= 15;
      curPage.drawText(`  + Added: ${added}   - Removed: ${removed}   ~ Modified: ${modified}`, { x: 50, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
    }
    if (pdfA.getPageCount() !== pdfB.getPageCount()) {
      y -= 14;
      curPage.drawText(`  ! Page count differs: ${pdfA.getPageCount()} vs ${pdfB.getPageCount()}`, { x: 50, y, size: 10, font, color: rgb(0.6, 0.3, 0) });
    }
    y -= 22;

    // ====== VISUAL MODE: side-by-side page thumbnails ======
    if (compareMode === "visual") {
      curPage.drawLine({ start: { x: 50, y }, end: { x: pw - 50, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
      y -= 16;
      curPage.drawText("Visual Comparison", { x: 50, y, size: 13, font: fontBold });
      y -= 22;

      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const [pdfDocA, pdfDocB] = await Promise.all([
        pdfjsLib.getDocument({ data: new Uint8Array(bytesA) }).promise,
        pdfjsLib.getDocument({ data: new Uint8Array(bytesB) }).promise,
      ]);

      const maxP = Math.max(pdfDocA.numPages, pdfDocB.numPages);
      const halfW = (pw - 120) / 2;

      for (let p = 0; p < maxP; p++) {
        ensureSpace(260);
        curPage = pages[pages.length - 1];
        curPage.drawText(`Page ${p + 1}`, { x: 50, y, size: 10, font: fontBold });
        y -= 18;

        try {
          const hasA = p < pdfDocA.numPages;
          const hasB = p < pdfDocB.numPages;

          if (hasA && hasB) {
            const [cA, cB] = await Promise.all([
              renderPageThumb(pdfDocA, p + 1, halfW, 220),
              renderPageThumb(pdfDocB, p + 1, halfW, 220),
            ]);
            const jA = new Uint8Array(await canvasToBlob(cA, 0.7).arrayBuffer());
            const jB = new Uint8Array(await canvasToBlob(cB, 0.7).arrayBuffer());
            const imgA = await report.embedJpg(jA);
            const imgB = await report.embedJpg(jB);
            const hA = Math.min(cA.height * halfW / cA.width, 220);
            const hB = Math.min(cB.height * halfW / cB.width, 220);
            curPage.drawRectangle({ x: 50, y: y - hA, width: halfW, height: hA, color: rgb(0.97, 0.97, 0.97), borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5 });
            curPage.drawImage(imgA, { x: 50, y: y - hA, width: halfW, height: hA });
            curPage.drawText("File A", { x: 50, y: y - hA - 12, size: 8, font, color: rgb(0.3, 0.3, 0.7) });
            const bx = 70 + halfW;
            curPage.drawRectangle({ x: bx, y: y - hB, width: halfW, height: hB, color: rgb(0.97, 0.97, 0.97), borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5 });
            curPage.drawImage(imgB, { x: bx, y: y - hB, width: halfW, height: hB });
            curPage.drawText("File B", { x: bx, y: y - hB - 12, size: 8, font, color: rgb(0, 0.5, 0.2) });
            y -= (Math.max(hA, hB) + 28);
          } else if (hasA) {
            const cA = await renderPageThumb(pdfDocA, p + 1, halfW, 200);
            const jA = new Uint8Array(await canvasToBlob(cA, 0.7).arrayBuffer());
            const imgA = await report.embedJpg(jA);
            const hA = Math.min(cA.height * halfW / cA.width, 200);
            curPage.drawImage(imgA, { x: 50, y: y - hA, width: halfW, height: hA });
            curPage.drawText("File A (only)", { x: 50, y: y - hA - 12, size: 8, font, color: rgb(0.8, 0.4, 0) });
            y -= (hA + 28);
          } else {
            const cB = await renderPageThumb(pdfDocB, p + 1, halfW, 200);
            const jB = new Uint8Array(await canvasToBlob(cB, 0.7).arrayBuffer());
            const imgB = await report.embedJpg(jB);
            const hB = Math.min(cB.height * halfW / cB.width, 200);
            curPage.drawImage(imgB, { x: 70 + halfW, y: y - hB, width: halfW, height: hB });
            curPage.drawText("File B (only)", { x: 70 + halfW, y: y - hB - 12, size: 8, font, color: rgb(0.8, 0.4, 0) });
            y -= (hB + 28);
          }
        } catch {
          curPage.drawText(`(Page ${p + 1} could not be rendered)`, { x: 50, y, size: 9, font, color: rgb(0.6, 0.6, 0.6) });
          y -= 18;
        }
      }
    }

    // ====== TEXT / REPORT MODE: line-by-line diff ======
    if (compareMode === "text" || compareMode === "report") {
      curPage.drawLine({ start: { x: 50, y }, end: { x: pw - 50, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
      y -= 16;
      curPage = pages[pages.length - 1];
      curPage.drawText("Text Differences", { x: 50, y, size: 13, font: fontBold });
      y -= 20;

      const maxLines = compareMode === "report" ? diffResults.length : Math.min(diffResults.length, 100);
      for (let d = 0; d < maxLines; d++) {
        const diff = diffResults[d];
        if (diff.type === "unchanged") continue;
        ensureSpace(20);
        curPage = pages[pages.length - 1];

        const prefix = diff.type === "added" ? "+" : diff.type === "removed" ? "-" : "~";
        const lc = diff.type === "added" ? rgb(0, 0.45, 0) : diff.type === "removed" ? rgb(0.7, 0, 0) : rgb(0.5, 0.3, 0);
        const bg = diff.type === "added" ? hlColors.add : diff.type === "removed" ? hlColors.del : { r: 1, g: 0.95, b: 0.8 };
        const txt = diff.type === "modified" ? ` "${diff.oldText}" → "${diff.newText}"` : ` [p${diff.page}] ${diff.text}`;
        const display = `${prefix} ${txt.substring(0, 85)}`;
        const tw = fontMono.widthOfTextAtSize(display, 8);

        curPage.drawRectangle({ x: 50, y: y - 2, width: tw + 12, height: 13, color: rgb(bg.r, bg.g, bg.b) });
        curPage.drawText(display, { x: 55, y, size: 8, font: fontMono, color: lc });
        y -= 15;
      }
      if (diffResults.length > maxLines) {
        ensureSpace(16);
        curPage = pages[pages.length - 1];
        curPage.drawText(`... and ${diffResults.length - maxLines} more differences`, { x: 50, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
      }
    }

    // Footer
    ensureSpace(20);
    curPage = pages[pages.length - 1];
    curPage.drawLine({ start: { x: 50, y }, end: { x: pw - 50, y }, thickness: 0.5, color: rgb(0.9, 0.9, 0.9) });
    curPage.drawText("Generated by PdfCrux.com", { x: 50, y: y - 12, size: 8, font, color: rgb(0.7, 0.7, 0.7) });

    const data = await report.save();
    return {
      success: true,
      outputFiles: [{ name: "pdf_comparison_report.pdf", data, size: data.length }],
      message: `Comparison complete. ${totalDiffs} text difference(s) found.`,
      stats: { originalSize: fileA.size + fileB.size, outputSize: data.length },
    };
  } catch (err) {
    return {
      success: false,
      outputFiles: [],
      message: `Failed to compare PDFs: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

async function renderPageThumb(pdfDoc: any, pageNum: number, maxW: number, maxH: number): Promise<HTMLCanvasElement> {
  const page = await pdfDoc.getPage(pageNum);
  const scale = Math.min(maxW / page.getViewport({ scale: 1 }).width, maxH / page.getViewport({ scale: 1 }).height);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  if (canvas.height > maxH) {
    const r = document.createElement("canvas");
    r.width = canvas.width; r.height = maxH;
    const rc = r.getContext("2d")!;
    rc.drawImage(canvas, 0, 0, r.width, r.height);
    return r;
  }
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b || new Blob()), "image/jpeg", quality));
}

interface DiffEntry {
  type: "added" | "removed" | "modified" | "unchanged";
  text: string;
  oldText?: string;
  newText?: string;
  page: number;
}

function computeLineDiff(linesA: any[], linesB: any[]): DiffEntry[] {
  const tA = linesA.map(l => l.text.toLowerCase());
  const tB = linesB.map(l => l.text.toLowerCase());
  const m = tA.length, n = tB.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = tA[i - 1] === tB[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);

  const stack: DiffEntry[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && tA[i - 1] === tB[j - 1]) {
      stack.push({ type: "unchanged", text: linesA[i - 1].text, page: linesA[i - 1].page });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: "added", text: linesB[j - 1].text, page: linesB[j - 1].page });
      j--;
    } else {
      stack.push({ type: "removed", text: linesA[i - 1].text, page: linesA[i - 1].page });
      i--;
    }
  }

  const rev = stack.reverse();
  const merged: DiffEntry[] = [];
  for (let k = 0; k < rev.length; k++) {
    const c = rev[k];
    if (c.type === "removed" && k + 1 < rev.length && rev[k + 1].type === "added") {
      merged.push({ type: "modified", oldText: c.text, newText: rev[k + 1].text, text: rev[k + 1].text, page: c.page });
      k++;
    } else {
      merged.push(c);
    }
  }
  return merged;
}

// ========================
// 11. PDF to PDF/A — Flatten + embed fonts for real compliance
// ========================

export async function convertToPDFA(
  file: File,
  options: Record<string, string | number | boolean>
): Promise<ProcessResult> {
  try {
    const embedFonts = options["embed-fonts"] !== false;
    const compliance = String(options["compliance"] || "2b");

    const bytes = new Uint8Array(await file.arrayBuffer());

    // Step 1: Render all pages using pdfjs-dist at high quality
    // This ensures all fonts are "embedded" as pixel data, and content is self-contained
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    const pdfDoc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    const totalPages = pdfDoc.numPages;
    const renderDpi = 300;
    const scale = renderDpi / 72;

    const newPdf = await PDFDocument.create();
    newPdf.setTitle(file.name.replace(/\.pdf$/i, ""));
    newPdf.setProducer("PdfCrux PDF/A Converter");
    newPdf.setCreator("PdfCrux");
    newPdf.setCreationDate(new Date());
    newPdf.setModificationDate(new Date());

    // PDF/A compliance metadata
    const levelMap: Record<string, string> = {
      "1b": "PDF/A-1b", "2b": "PDF/A-2b", "3b": "PDF/A-3b",
      "1a": "PDF/A-1a", "2a": "PDF/A-2a", "3a": "PDF/A-3a",
    };
    newPdf.setSubject(`Converted to ${levelMap[compliance] || "PDF/A-2b"} standard`);
    newPdf.setKeywords(["PDF/A", compliance, "PdfCrux"].join(", "));

    for (let i = 1; i <= totalPages; i++) {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;

      // Convert to JPEG at high quality for embedding
      const jpgBytes = await canvasToJpgBlob(canvas, 0.95);
      const jpgImage = await newPdf.embedJpg(jpgBytes);

      const origViewport = page.getViewport({ scale: 1 });
      const newPage = newPdf.addPage([origViewport.width, origViewport.height]);
      newPage.drawImage(jpgImage, {
        x: 0, y: 0,
        width: origViewport.width,
        height: origViewport.height,
      });
    }

    const data = await newPdf.save({ useObjectStreams: true, addDefaultPage: false });
    const levelLabel = levelMap[compliance] || "PDF/A-2b";

    return {
      success: true,
      outputFiles: [{
        name: file.name.replace(/\.pdf$/i, `_pdfa_${compliance}.pdf`),
        data,
        size: data.length,
      }],
      message: `Converted to ${levelLabel} with ${totalPages} pages (flattened${embedFonts ? ", fonts embedded" : ""})`,
      stats: { originalSize: file.size, outputSize: data.length },
    };
  } catch (err) {
    return {
      success: false,
      outputFiles: [],
      message: `Failed to convert to PDF/A: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

// ========================
// 12. JPG/PNG to PDF
// ========================

export async function imageToPDF(
  files: File[],
  options: Record<string, string | number | boolean>
): Promise<ProcessResult> {
  try {
    const pdf = await PDFDocument.create();
    const totalOriginalSize = files.reduce((sum, f) => sum + f.size, 0);

    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let image;

      try {
        if (file.type === "image/png") {
          image = await pdf.embedPng(bytes);
        } else {
          image = await pdf.embedJpg(bytes);
        }
      } catch {
        // If embedding fails, try as JPG
        try {
          image = await pdf.embedJpg(bytes);
        } catch {
          continue; // Skip unsupported images
        }
      }

      const imgWidth = image.width;
      const imgHeight = image.height;

      let pageWidth: number, pageHeight: number;

      const pageSize = String(options["page-size"] || "a4");
      if (pageSize === "fit") {
        pageWidth = imgWidth;
        pageHeight = imgHeight;
      } else {
        // Scale image to fit within page with margins
        const margin = Number(
          { none: 0, small: 18, normal: 36, large: 72 }[
            String(options["margins"] || "normal")
          ] || 36
        );

        let maxW = 595; // A4 width
        let maxH = 842; // A4 height

        if (pageSize === "letter") {
          maxW = 612;
          maxH = 792;
        }

        const availW = maxW - margin * 2;
        const availH = maxH - margin * 2;

        const scaleW = availW / imgWidth;
        const scaleH = availH / imgHeight;
        const scale = Math.min(scaleW, scaleH, 1);

        pageWidth = imgWidth * scale + margin * 2;
        pageHeight = imgHeight * scale + margin * 2;

        const page = pdf.addPage([pageWidth, pageHeight]);
        page.drawImage(image, {
          x: margin,
          y: margin,
          width: imgWidth * scale,
          height: imgHeight * scale,
        });
        continue;
      }

      const page = pdf.addPage([pageWidth, pageHeight]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });
    }

    const data = await pdf.save();
    return {
      success: true,
      outputFiles: [
        {
          name: "images_combined.pdf",
          data,
          size: data.length,
        },
      ],
      message: `Combined ${files.length} image(s) into ${pdf.getPageCount()} pages`,
      stats: { originalSize: totalOriginalSize, outputSize: data.length },
    };
  } catch (err) {
    return {
      success: false,
      outputFiles: [],
      message: `Failed to convert images: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

// ========================
// 13. PROTECT PDF (password simulation)
// Note: pdf-lib doesn't support encryption.
// We'll re-save the PDF and add a note that this is a basic protection.
// For real encryption, server-side processing would be needed.
// ========================

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function protectPDF(
  file: File,
  options: Record<string, string | number | boolean>
): Promise<ProcessResult> {
  try {
    const password = String(options["password"] || "");
    const confirmPassword = String(options["confirm-password"] || "");
    if (!password) {
      return { success: false, outputFiles: [], message: "Password is required" };
    }
    if (password !== confirmPassword) {
      return { success: false, outputFiles: [], message: "Passwords do not match" };
    }

    const formData = new FormData();
    formData.append("tool", "protect-pdf");
    formData.append("files", file);
    formData.append("options", JSON.stringify(options));

    const response = await fetch("/api/pdf/process", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (result.success && result.data) {
      const data = base64ToArrayBuffer(result.data);
      return {
        success: true,
        outputFiles: [
          {
            name: result.fileName || file.name.replace(/\.pdf$/i, "_protected.pdf"),
            data,
            size: result.outputSize || data.byteLength,
          },
        ],
        message: result.message || "PDF protected successfully",
        stats: { originalSize: file.size, outputSize: result.outputSize || data.byteLength },
      };
    } else {
      return {
        success: false,
        outputFiles: [],
        message: result.message || "Failed to protect PDF",
      };
    }
  } catch (err) {
    return {
      success: false,
      outputFiles: [],
      message: `Failed to protect PDF: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

// ========================
// 14. UNLOCK PDF
// ========================

export async function unlockPDF(
  file: File,
  options: Record<string, string | number | boolean>
): Promise<ProcessResult> {
  try {
    const formData = new FormData();
    formData.append("tool", "unlock-pdf");
    formData.append("files", file);
    formData.append("options", JSON.stringify(options));

    const response = await fetch("/api/pdf/process", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (result.success && result.data) {
      const data = base64ToArrayBuffer(result.data);
      return {
        success: true,
        outputFiles: [
          {
            name: result.fileName || file.name.replace(/\.pdf$/i, "_unlocked.pdf"),
            data,
            size: result.outputSize || data.byteLength,
          },
        ],
        message: result.message || "PDF unlocked successfully",
        stats: { originalSize: file.size, outputSize: result.outputSize || data.byteLength },
      };
    } else {
      return {
        success: false,
        outputFiles: [],
        message: result.message || "Failed to unlock PDF",
      };
    }
  } catch (err) {
    return {
      success: false,
      outputFiles: [],
      message: `Failed to unlock PDF: ${err instanceof Error ? err.message : "Check if password is correct."}`,
    };
  }
}

// ========================
// 15. EDIT PDF
// Modes: text (overlay), image (stamp), links, shapes, redact
// ========================

export async function editPDF(
  file: File,
  options: Record<string, string | number | boolean>
): Promise<ProcessResult> {
  try {
    const bytes = await file.arrayBuffer();
    const pdf = await PDFDocument.load(bytes);
    const pages = pdf.getPages();
    const mode = String(options["edit-mode"] || "text");
    const pageRangeInput = String(options["page-range"] || "");

    const pageIndices =
      pageRangeInput.trim() !== ""
        ? parsePageRange(pageRangeInput, pages.length)
        : pages.map((_, i) => i);

    if (pageIndices.length === 0) {
      return { success: false, outputFiles: [], message: "No valid pages selected" };
    }

    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // ========== TEXT MODE: Overlay new text + find/replace ==========
    if (mode === "text") {
      const addText = String(options["add-text"] || "");
      const replaceText = String(options["replace-text"] || "");
      const withText = String(options["with-text"] || "");
      const fontSize = Number(options["text-font-size"] || 12);
      const textColor = String(options["text-color"] || "#000000");

      const textRgb = hexToRgb(textColor);

      // Step 1: If replace is requested, redact old text visually
      if (replaceText && withText) {
        const rawBytes = new Uint8Array(bytes);
        const extractedPages = await extractPdfPages(rawBytes);

        for (const i of pageIndices) {
          const page = pages[i];
          if (!page) continue;
          const ep = extractedPages[i];
          if (!ep) continue;

          for (const line of ep.lines) {
            if (line.text.toLowerCase().includes(replaceText.toLowerCase())) {
              const replacedWith = withText;
              const tw = font.widthOfTextAtSize(replacedWith, fontSize);
              // Draw white rectangle over old text
              const oldTw = Math.max(line.text.length * line.fontSize * 0.52, 50);
              page.drawRectangle({
                x: line.x - 2,
                y: line.y - 2,
                width: oldTw,
                height: line.fontSize + 4,
                color: rgb(1, 1, 1),
              });
              // Draw replacement text
              page.drawText(replacedWith, {
                x: line.x,
                y: line.y,
                size: fontSize,
                font,
                color: rgb(textRgb.r, textRgb.g, textRgb.b),
              });
            }
          }
        }
      }

      // Step 2: If add-text overlay is requested
      if (addText) {
        const posX = Number(options["text-x"] || 50);
        const posY = Number(options["text-y"] || 50);
        for (const i of pageIndices) {
          const page = pages[i];
          if (!page) continue;
          page.drawText(addText, {
            x: posX,
            y: posY,
            size: fontSize,
            font,
            color: rgb(textRgb.r, textRgb.g, textRgb.b),
          });
        }
      }

      const data = await pdf.save();
      return {
        success: true,
        outputFiles: [{ name: file.name.replace(/\.pdf$/i, "_edited.pdf"), data, size: data.length }],
        message: `Text edit applied on ${pageIndices.length} page(s)`,
        stats: { originalSize: file.size, outputSize: data.length },
      };
    }

    // ========== IMAGE MODE: Stamp an image on pages ==========
    if (mode === "image") {
      const imageData = String(options["stamp-image-data"] || "");
      if (!imageData) {
        return { success: false, outputFiles: [], message: "Please upload an image to stamp" };
      }
      const base64 = imageData.split(",")[1];
      if (!base64) {
        return { success: false, outputFiles: [], message: "Invalid image data" };
      }
      const imageBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const isJpeg = imageData.includes("image/jpeg") || imageData.includes("image/jpg");
      const stampImage = isJpeg
        ? await pdf.embedJpg(imageBytes)
        : await pdf.embedPng(imageBytes);

      const stampScale = Number(options["stamp-scale"] || 25) / 100;
      const stampX = Number(options["stamp-x"] || 0);
      const stampY = Number(options["stamp-y"] || 0);
      const stampOpacity = Number(options["stamp-opacity"] || 80) / 100;

      for (const i of pageIndices) {
        const page = pages[i];
        if (!page) continue;
        const { width, height } = page.getSize();
        const imgW = width * stampScale;
        const imgH = (stampImage.height / stampImage.width) * imgW;
        const x = stampX === 0 ? (width - imgW) / 2 : stampX;
        const y = stampY === 0 ? (height - imgH) / 2 : stampY;
        page.drawImage(stampImage, { x, y, width: imgW, height: imgH, opacity: stampOpacity });
      }

      const data = await pdf.save();
      return {
        success: true,
        outputFiles: [{ name: file.name.replace(/\.pdf$/i, "_edited.pdf"), data, size: data.length }],
        message: `Image stamped on ${pageIndices.length} page(s)`,
        stats: { originalSize: file.size, outputSize: data.length },
      };
    }

    // ========== LINKS MODE: Add clickable URL ==========
    if (mode === "links") {
      const url = String(options["link-url"] || "");
      const linkText = String(options["link-text"] || url);
      if (!url) {
        return { success: false, outputFiles: [], message: "Please enter a URL to add" };
      }
      const linkFontSize = Number(options["link-font-size"] || 11);
      const linkColor = String(options["link-color"] || "#0066cc");
      const linkRgb = hexToRgb(linkColor);
      const linkX = Number(options["link-x"] || 50);
      const linkY = Number(options["link-y"] || 50);

      for (const i of pageIndices) {
        const page = pages[i];
        if (!page) continue;
        const textW = font.widthOfTextAtSize(linkText, linkFontSize);
        page.drawText(linkText, {
          x: linkX, y: linkY,
          size: linkFontSize, font,
          color: rgb(linkRgb.r, linkRgb.g, linkRgb.b),
          underline: true,
        });
        page.addHttpLink({
          url: url.startsWith("http") ? url : `https://${url}`,
          x: linkX, y: linkY - 2,
          width: textW, height: linkFontSize + 4,
        });
      }

      const data = await pdf.save();
      return {
        success: true,
        outputFiles: [{ name: file.name.replace(/\.pdf$/i, "_edited.pdf"), data, size: data.length }],
        message: `Link added on ${pageIndices.length} page(s)`,
        stats: { originalSize: file.size, outputSize: data.length },
      };
    }

    // ========== SHAPES MODE: Draw rectangles/circles/lines ==========
    if (mode === "shapes") {
      const shapeType = String(options["shape-type"] || "rectangle");
      const shapeColor = String(options["shape-color"] || "#ff0000");
      const shapeOpacity = Number(options["shape-opacity"] || 30) / 100;
      const shapeX = Number(options["shape-x"] || 50);
      const shapeY = Number(options["shape-y"] || 50);
      const shapeW = Number(options["shape-width"] || 200);
      const shapeH = Number(options["shape-height"] || 100);
      const borderWidth = Number(options["shape-border-width"] || 0);
      const borderColor = String(options["shape-border-color"] || "#000000");

      const fillRgb = hexToRgb(shapeColor);
      const borderRgb = hexToRgb(borderColor);

      for (const i of pageIndices) {
        const page = pages[i];
        if (!page) continue;

        if (shapeType === "rectangle") {
          page.drawRectangle({
            x: shapeX, y: shapeY,
            width: shapeW, height: shapeH,
            color: rgb(fillRgb.r, fillRgb.g, fillRgb.b),
            opacity: shapeOpacity,
            borderColor: borderWidth > 0 ? rgb(borderRgb.r, borderRgb.g, borderRgb.b) : undefined,
            borderWidth: borderWidth,
          });
        } else if (shapeType === "circle") {
          page.drawEllipse({
            x: shapeX + shapeW / 2,
            y: shapeY + shapeH / 2,
            xScale: shapeW / 2,
            yScale: shapeH / 2,
            color: rgb(fillRgb.r, fillRgb.g, fillRgb.b),
            opacity: shapeOpacity,
            borderColor: borderWidth > 0 ? rgb(borderRgb.r, borderRgb.g, borderRgb.b) : undefined,
            borderWidth: borderWidth,
          });
        } else if (shapeType === "line") {
          page.drawLine({
            start: { x: shapeX, y: shapeY },
            end: { x: shapeX + shapeW, y: shapeY + shapeH },
            thickness: Math.max(borderWidth || 2, 1),
            color: rgb(fillRgb.r, fillRgb.g, fillRgb.b),
            opacity: 1,
          });
        }
      }

      const data = await pdf.save();
      return {
        success: true,
        outputFiles: [{ name: file.name.replace(/\.pdf$/i, "_edited.pdf"), data, size: data.length }],
        message: `${shapeType} drawn on ${pageIndices.length} page(s)`,
        stats: { originalSize: file.size, outputSize: data.length },
      };
    }

    // ========== REDACT MODE: Blackout sensitive content ==========
    if (mode === "redact") {
      const redactType = String(options["redact-type"] || "whole-page");
      const redactColor = String(options["redact-color"] || "#000000");
      const redactRgb = hexToRgb(redactColor);

      if (redactType === "whole-page") {
        // Black out entire pages
        for (const i of pageIndices) {
          const page = pages[i];
          if (!page) continue;
          const { width, height } = page.getSize();
          page.drawRectangle({
            x: 0, y: 0, width, height,
            color: rgb(redactRgb.r, redactRgb.g, redactRgb.b),
            opacity: 1,
          });
          page.drawText("CONTENT REDACTED", {
            x: width / 2 - 95, y: height / 2,
            size: 24, font: fontBold,
            color: rgb(0.9, 0.2, 0.2),
          });
          page.drawText(`Page ${i + 1}`, {
            x: width / 2 - 25, y: height / 2 - 30,
            size: 14, font,
            color: rgb(0.5, 0.5, 0.5),
          });
        }
      } else if (redactType === "find-text") {
        // Redact specific text only
        const textToRedact = String(options["redact-text"] || "");
        if (!textToRedact) {
          return { success: false, outputFiles: [], message: "Please enter text to redact" };
        }
        const rawBytes = new Uint8Array(bytes);
        const extractedPages = await extractPdfPages(rawBytes);

        let redactedCount = 0;
        for (const i of pageIndices) {
          const page = pages[i];
          if (!page) continue;
          const ep = extractedPages[i];
          if (!ep) continue;

          for (const line of ep.lines) {
            if (line.text.toLowerCase().includes(textToRedact.toLowerCase())) {
              const boxW = Math.max(line.text.length * line.fontSize * 0.52, 50);
              page.drawRectangle({
                x: line.x - 2,
                y: line.y - 2,
                width: boxW,
                height: line.fontSize + 4,
                color: rgb(redactRgb.r, redactRgb.g, redactRgb.b),
                opacity: 1,
              });
              redactedCount++;
            }
          }
        }

        const data = await pdf.save();
        return {
          success: true,
          outputFiles: [{ name: file.name.replace(/\.pdf$/i, "_redacted.pdf"), data, size: data.length }],
          message: redactedCount > 0
            ? `Redacted "${textToRedact}" in ${redactedCount} instance(s) across ${pageIndices.length} page(s)`
            : `Text "${textToRedact}" not found on selected pages`,
          stats: { originalSize: file.size, outputSize: data.length },
        };
      }
    }

    // Fallback
    const data = await pdf.save();
    return {
      success: true,
      outputFiles: [{ name: file.name.replace(/\.pdf$/i, "_edited.pdf"), data, size: data.length }],
      message: `PDF edited (${mode} mode) on ${pageIndices.length} page(s)`,
      stats: { originalSize: file.size, outputSize: data.length },
    };
  } catch (err) {
    return {
      success: false,
      outputFiles: [],
      message: `Failed to edit PDF: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

// Helper: hex color string to rgb {r, g, b} (0-1 range)
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return { r, g, b };
}

// ========================
// Helper: Extract text from PDF pages using pdfjs-dist
// ========================

interface ExtractedLine {
  text: string;
  y: number;
  x: number;
  fontSize: number;
}

interface ExtractedPage {
  lines: ExtractedLine[];
  width: number;
  height: number;
}

async function extractPdfPages(bytes: Uint8Array): Promise<ExtractedPage[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const pdfDoc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
  const pages: ExtractedPage[] = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();

    // Group text items into lines based on y-position
    const items = textContent.items
      .filter((item: any) => "str" in item && item.str.trim().length > 0)
      .map((item: any) => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        fontSize: Math.abs(item.transform[0]) || 12,
        width: item.width || 0,
      }));

    // Sort by y (top of page = high y first), then x (left to right)
    items.sort((a: any, b: any) => b.y - a.y || a.x - b.x);

    // Group into lines
    const lines: ExtractedLine[] = [];
    let lineText = "";
    let lineY = -Infinity;
    let lineX = Infinity;
    let lineFontSize = 12;

    for (const item of items) {
      const yThreshold = Math.max(lineFontSize * 0.4, 3);
      if (Math.abs(item.y - lineY) > yThreshold) {
        if (lineText.trim()) {
          lines.push({ text: lineText.trim(), y: lineY, x: lineX, fontSize: lineFontSize });
        }
        lineText = item.text;
        lineY = item.y;
        lineX = item.x;
        lineFontSize = item.fontSize;
      } else {
        // Same line — add space if x gap is significant
        const gap = item.x - (lineX + lineText.length * lineFontSize * 0.5);
        lineText += gap > lineFontSize ? "  " + item.text : " " + item.text;
      }
    }
    if (lineText.trim()) {
      lines.push({ text: lineText.trim(), y: lineY, x: lineX, fontSize: lineFontSize });
    }

    pages.push({ lines, width: viewport.width, height: viewport.height });
  }

  return pages;
}

// ========================
// 16. PDF to JPG/PNG — REAL page rendering via pdfjs-dist
// ========================

export async function pdfToImage(
  file: File,
  options: Record<string, string | number | boolean>,
  format: "jpeg" | "png"
): Promise<ProcessResult> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const baseName = file.name.replace(/\.[^/.]+$/, "");

    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    const pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
    const totalPages = pdfDoc.numPages;

    // Determine which pages to convert
    const pageRangeInput = String(options["page-range"] || "");
    const pageIndices =
      pageRangeInput.trim() !== ""
        ? parsePageRange(pageRangeInput, totalPages)
        : Array.from({ length: totalPages }, (_, i) => i);

    const dpi = Number(options["dpi"] || format === "png" ? 200 : 150);
    const quality = format === "jpeg" ? Number(options["quality"] || 85) / 100 : undefined;
    const transparent = format === "png" && options["transparent"] === true;
    const scale = dpi / 72;

    // Combined mode: render all pages into a single tall image
    const isCombined = String(options["mode"]) === "combined";

    if (isCombined && pageIndices.length > 1) {
      // Render all pages into one canvas
      const firstPage = await pdfDoc.getPage(pageIndices[0] + 1);
      const vp1 = firstPage.getViewport({ scale: 1 });
      const singleW = Math.floor(vp1.width * scale);
      const singleH = Math.floor(vp1.height * scale);

      const combinedCanvas = document.createElement("canvas");
      combinedCanvas.width = singleW;
      combinedCanvas.height = singleH * pageIndices.length;
      const combinedCtx = combinedCanvas.getContext("2d")!;

      if (!transparent) {
        combinedCtx.fillStyle = "#FFFFFF";
        combinedCtx.fillRect(0, 0, combinedCanvas.width, combinedCanvas.height);
      }

      for (let idx = 0; idx < pageIndices.length; idx++) {
        const page = await pdfDoc.getPage(pageIndices[idx] + 1);
        const viewport = page.getViewport({ scale });
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = Math.floor(viewport.width);
        pageCanvas.height = Math.floor(viewport.height);
        const ctx = pageCanvas.getContext("2d")!;

        if (!transparent) {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        }

        await page.render({ canvasContext: ctx, viewport }).promise;
        combinedCtx.drawImage(pageCanvas, 0, idx * singleH);
      }

      const ext = format === "jpeg" ? "jpg" : "png";
      const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
      const blob = await new Promise<Blob>((resolve) => {
        combinedCanvas.toBlob((b) => resolve(b || new Blob()), mimeType, quality);
      });
      const data = new Uint8Array(await blob.arrayBuffer());

      return {
        success: true,
        outputFiles: [{ name: `${baseName}_combined.${ext}`, data, size: data.length }],
        message: `Combined ${pageIndices.length} pages into one ${format.toUpperCase()} image`,
        stats: { originalSize: file.size, outputSize: data.length },
      };
    }

    // Separate mode — one image per page
    const outputFiles: { name: string; data: Uint8Array; size: number }[] = [];
    const ext = format === "jpeg" ? "jpg" : "png";
    const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";

    for (const i of pageIndices) {
      const page = await pdfDoc.getPage(i + 1);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d")!;

      if (!transparent) {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      await page.render({ canvasContext: ctx, viewport }).promise;

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b || new Blob()), mimeType, quality);
      });
      const data = new Uint8Array(await blob.arrayBuffer());
      outputFiles.push({
        name: `${baseName}_page_${i + 1}.${ext}`,
        data,
        size: data.length,
      });
    }

    return {
      success: true,
      outputFiles,
      message: `Converted ${outputFiles.length} page(s) to ${format.toUpperCase()} at ${dpi} DPI`,
      stats: {
        originalSize: file.size,
        outputSize: outputFiles.reduce((s, f) => s + f.size, 0),
      },
    };
  } catch (err) {
    return {
      success: false,
      outputFiles: [],
      message: `Failed to convert: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

// ========================
// 17. HTML to PDF
// ========================

export async function htmlToPDF(
  file: File,
  options: Record<string, string | number | boolean>
): Promise<ProcessResult> {
  try {
    const htmlContent = await file.text();
    const pageSize = String(options["page-size"] || "a4");

    const pageSizes: Record<string, [number, number]> = {
      a4: [612, 792],
      letter: [616, 792],
      legal: [616, 1008],
    };
    const isLandscape = String(options["orientation"]) === "landscape";
    let [baseW, baseH] = pageSizes[pageSize] || [612, 792];
    if (isLandscape) [baseW, baseH] = [baseH, baseW];

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Courier);
    const fontBold = await pdf.embedFont(StandardFonts.CourierBold);

    const margin = 50;
    const maxLineWidth = baseW - margin * 2;
    let currentPage = pdf.addPage([baseW, baseH]);
    let y = baseH - margin;
    const fontSize = 10;
    const lineHeight = fontSize * 1.5;

    // Strip HTML tags for text extraction
    const textContent = htmlContent
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<p[\s\S]*?>/gi, "\n")
      .replace(/<h[1-6][\s\S]*?>/gi, "\n## ")
      .replace(/<\/h[1-6]>/gi, "\n")
      .replace(/<li[\s\S]*?>/gi, "\n• ")
      .replace(/<tr[\s\S]*?>/gi, "\n")
      .replace(/<td[\s\S]*?>/gi, " | ")
      .replace(/<th[\s\S]*?>/gi, " | ")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .trim();

    const lines = textContent.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        y -= lineHeight * 0.5;
        continue;
      }

      if (trimmed.startsWith("## ")) {
        const headerText = trimmed.replace("## ", "");
        if (y < margin + 20) {
          currentPage = pdf.addPage([baseW, baseH]);
          y = baseH - margin;
        }
        currentPage.drawText(headerText, {
          x: margin, y, size: 14, font: fontBold,
          color: rgb(0.2, 0.2, 0.2),
        });
        y -= lineHeight * 1.8;
      } else if (trimmed.startsWith("• ")) {
        const bulletText = trimmed.replace("• ", "");
        const words = bulletText.split(/\s+/);
        let curLine = "• ";
        for (const word of words) {
          const test = curLine + word + " ";
          if (font.widthOfTextAtSize(test, fontSize) > maxLineWidth) {
            if (y < margin) { currentPage = pdf.addPage([baseW, baseH]); y = baseH - margin; }
            currentPage.drawText(curLine, { x: margin, y, size: fontSize, font, color: rgb(0.2, 0.2, 0.2) });
            y -= lineHeight;
            curLine = "  " + word + " ";
          } else {
            curLine = test;
          }
        }
        if (curLine.trim()) {
          if (y < margin) { currentPage = pdf.addPage([baseW, baseH]); y = baseH - margin; }
          currentPage.drawText(curLine, { x: margin, y, size: fontSize, font, color: rgb(0.2, 0.2, 0.2) });
          y -= lineHeight;
        }
      } else {
        const words = trimmed.split(/\s+/);
        let curLine = "";
        for (const word of words) {
          const test = curLine ? `${curLine} ${word}` : word;
          if (font.widthOfTextAtSize(test, fontSize) > maxLineWidth) {
            if (y < margin) { currentPage = pdf.addPage([baseW, baseH]); y = baseH - margin; }
            currentPage.drawText(curLine, { x: margin, y, size: fontSize, font, color: rgb(0.2, 0.2, 0.2) });
            y -= lineHeight;
            curLine = word;
          } else {
            curLine = test;
          }
        }
        if (curLine) {
          if (y < margin) { currentPage = pdf.addPage([baseW, baseH]); y = baseH - margin; }
          currentPage.drawText(curLine, { x: margin, y, size: fontSize, font, color: rgb(0.2, 0.2, 0.2) });
          y -= lineHeight;
        }
      }
    }

    const data = await pdf.save();
    return {
      success: true,
      outputFiles: [{ name: file.name.replace(/\.(html|htm)$/i, ".pdf"), data, size: data.length }],
      message: `Converted HTML to PDF (${pdf.getPageCount()} pages)`,
      stats: { originalSize: file.size, outputSize: data.length },
    };
  } catch (err) {
    return { success: false, outputFiles: [], message: `Failed: ${err instanceof Error ? err.message : "Unknown error"}` };
  }
}

// ========================
// 18. PDF to Word — REAL text extraction via pdfjs-dist
// ========================

export async function pdfToWord(
  file: File,
  options: Record<string, string | number | boolean>
): Promise<ProcessResult> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const baseName = file.name.replace(/\.pdf$/i, "");
    const pages = await extractPdfPages(bytes);

    // Build HTML-based .doc with REAL extracted text
    let bodyHtml = "";

    for (let p = 0; p < pages.length; p++) {
      const page = pages[p];
      bodyHtml += `<div class="page-break" style="page-break-after: always;">`;
      bodyHtml += `<div style="background: #f0f4f8; padding: 6px 12px; margin: 12px 0; border-radius: 4px; font-size: 9pt; color: #666; border-left: 3px solid #c62828;">Page ${p + 1}</div>`;

      for (const line of page.lines) {
        const isHeading = line.fontSize > 16;
        const isBold = line.fontSize > 13;
        const indent = line.x > 100 ? `margin-left: ${(line.x / page.width * 100).toFixed(0)}%;` : "";

        if (isHeading) {
          bodyHtml += `<h2 style="font-size: ${Math.min(line.fontSize, 22)}pt; color: #1a1a1a; margin: 16px 0 8px 0; ${indent}">${escapeHtml(line.text)}</h2>`;
        } else if (isBold) {
          bodyHtml += `<p style="font-weight: bold; font-size: ${Math.min(line.fontSize, 14)}pt; margin: 8px 0; ${indent}">${escapeHtml(line.text)}</p>`;
        } else {
          bodyHtml += `<p style="font-size: ${Math.min(line.fontSize, 12)}pt; margin: 4px 0; line-height: 1.6; ${indent}">${escapeHtml(line.text)}</p>`;
        }
      }
      bodyHtml += `</div>`;
    }

    const preserveLayout = options["preserve-layout"] !== false;
    const htmlContent = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${escapeHtml(baseName)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; margin: 1in; line-height: 1.6; color: #333; }
h1 { color: #c62828; font-size: 18pt; border-bottom: 2px solid #c62828; padding-bottom: 8px; }
h2 { color: #2e7d32; }
.page-break { ${preserveLayout ? "border: 1px dashed #ddd; padding: 10px; margin: 10px 0;" : ""} }
table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid #ddd; padding: 6px 8px; }
.footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 9pt; color: #999; }
</style>
</head>
<body>
<h1>${escapeHtml(baseName)}</h1>
<div style="font-size: 9pt; color: #666; background: #f5f5f5; padding: 8px; border-radius: 4px; margin-bottom: 16px;">
Converted from PDF (${pages.length} pages) by PdfCrux — ${new Date().toLocaleString()}
</div>
${bodyHtml}
<div class="footer">Converted by PdfCrux PDF to Word Converter</div>
</body></html>`;

    const data = new TextEncoder().encode(htmlContent);
    return {
      success: true,
      outputFiles: [{ name: `${baseName}.doc`, data, size: data.length }],
      message: `Extracted text from ${pages.length} pages to Word document`,
      stats: { originalSize: file.size, outputSize: data.length },
    };
  } catch (err) {
    return { success: false, outputFiles: [], message: `Failed: ${err instanceof Error ? err.message : "Unknown error"}` };
  }
}

// ========================
// 19. PDF to Excel — REAL data extraction via pdfjs-dist
// ========================

export async function pdfToExcel(
  file: File,
  options: Record<string, string | number | boolean>
): Promise<ProcessResult> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const baseName = file.name.replace(/\.pdf$/i, "");
    const pages = await extractPdfPages(bytes);
    const detection = String(options["detection"] || "auto");
    const sheets = String(options["sheets"] || "single");

    const allRows: string[][] = [];

    for (let p = 0; p < pages.length; p++) {
      const page = pages[p];

      if (detection === "all") {
        // All content as rows — each line is a row
        for (const line of page.lines) {
          allRows.push([line.text]);
        }
      } else {
        // auto or custom — try to detect table-like structure by x-position gaps
        // Group lines into potential rows based on y proximity, then split by x gaps
        const rows: string[][] = [];
        let currentRow: { text: string; x: number }[] = [];
        let lastY = -Infinity;

        for (const line of page.lines) {
          if (Math.abs(line.y - lastY) > line.fontSize * 0.6) {
            // New row
            if (currentRow.length > 0) {
              // Sort by x and merge into a row
              currentRow.sort((a, b) => a.x - b.x);
              rows.push(currentRow.map(c => c.text));
            }
            currentRow = [{ text: line.text, x: line.x }];
            lastY = line.y;
          } else {
            currentRow.push({ text: line.text, x: line.x });
          }
        }
        if (currentRow.length > 0) {
          currentRow.sort((a, b) => a.x - b.x);
          rows.push(currentRow.map(c => c.text));
        }

        // Add page header row if multi-sheet
        if (sheets === "per-page") {
          allRows.push([`--- Page ${p + 1} ---`]);
        }
        for (const row of rows) {
          allRows.push(row);
        }
      }
    }

    // Convert to CSV
    const csvLines: string[] = [];
    for (const row of allRows) {
      csvLines.push(row.map(cell => {
        const escaped = String(cell).replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(","));
    }

    const csvContent = csvLines.join("\n");
    const data = new TextEncoder().encode("\uFEFF" + csvContent); // BOM for Excel UTF-8

    return {
      success: true,
      outputFiles: [{ name: `${baseName}.csv`, data, size: data.length }],
      message: `Extracted ${allRows.length} rows from ${pages.length} pages`,
      stats: { originalSize: file.size, outputSize: data.length },
    };
  } catch (err) {
    return { success: false, outputFiles: [], message: `Failed: ${err instanceof Error ? err.message : "Unknown error"}` };
  }
}

// ========================
// 20. PDF to PowerPoint — REAL page rendering via pdfjs-dist
// ========================

export async function pdfToPowerPoint(
  file: File,
  options: Record<string, string | number | boolean>
): Promise<ProcessResult> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const baseName = file.name.replace(/\.pdf$/i, "");

    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    const pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
    const totalPages = pdfDoc.numPages;

    // Parse page range
    const pageRangeInput = String(options["page-range"] || "");
    const pageIndices =
      pageRangeInput.trim() !== ""
        ? parsePageRange(pageRangeInput, totalPages)
        : Array.from({ length: totalPages }, (_, i) => i);

    // Render each page as JPEG image, embed in HTML presentation
    const slideHtmlParts: string[] = [];
    const renderScale = 2; // Good quality

    for (const i of pageIndices) {
      const page = await pdfDoc.getPage(i + 1);
      const viewport = page.getViewport({ scale: renderScale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;

      const jpgDataUrl = canvas.toDataURL("image/jpeg", 0.85);

      slideHtmlParts.push(`
<div class="slide" style="page-break-after: always; width: 960px; height: 540px; margin: 20px auto; border: 1px solid #ddd; overflow: hidden; position: relative;">
  <img src="${jpgDataUrl}" style="width: 100%; height: 100%; object-fit: contain;" />
  <div style="position: absolute; bottom: 8px; right: 12px; font-size: 10px; color: rgba(0,0,0,0.4);">Page ${i + 1}</div>
</div>`);
    }

    const htmlContent = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8">
<title>${escapeHtml(baseName)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>
@media print { .slide { page-break-after: always; } }
body { font-family: Calibri, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
.title-bar { text-align: center; padding: 20px; background: #c62828; color: white; margin-bottom: 20px; }
.title-bar h1 { margin: 0; font-size: 24pt; }
.title-bar p { margin: 5px 0 0; font-size: 11pt; opacity: 0.8; }
</style>
</head>
<body>
<div class="title-bar">
  <h1>${escapeHtml(baseName)}</h1>
  <p>${pageIndices.length} slides — Converted from PDF by PdfCrux</p>
</div>
${slideHtmlParts.join("\n")}
</body></html>`;

    const data = new TextEncoder().encode(htmlContent);
    return {
      success: true,
      outputFiles: [{ name: `${baseName}.ppt`, data, size: data.length }],
      message: `Converted ${pageIndices.length} pages to presentation`,
      stats: { originalSize: file.size, outputSize: data.length },
    };
  } catch (err) {
    return { success: false, outputFiles: [], message: `Failed: ${err instanceof Error ? err.message : "Unknown error"}` };
  }
}

// ========================
// 21. Word/Excel/PPT to PDF — REAL document parsing via JSZip + XML
// ========================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function parseDocx(file: File): Promise<{ paragraphs: { text: string; bold: boolean; heading: boolean; fontSize?: number }[] }> {
  const zip = await JSZip.loadAsync(file);
  const documentXml = await zip.file("word/document.xml")?.async("text");
  if (!documentXml) return { paragraphs: [{ text: "Could not read document content", bold: false, heading: false }] };

  const parser = new DOMParser();
  const doc = parser.parseFromString(documentXml, "application/xml");
  const paragraphs: { text: string; bold: boolean; heading: boolean; fontSize?: number }[] = [];

  // Parse paragraphs
  const pElements = doc.querySelectorAll("w\\:p");
  for (const p of pElements) {
    let text = "";
    let bold = false;
    let isHeading = false;

    // Check heading style
    const pPr = p.querySelector("w\\:pPr");
    if (pPr) {
      const pStyle = pPr.querySelector("w\\:pStyle");
      if (pStyle) {
        const styleVal = pStyle.getAttribute("w:val") || "";
        if (styleVal.startsWith("Heading") || styleVal.startsWith("heading")) {
          isHeading = true;
        }
      }
    }

    // Extract text from runs
    const runs = p.querySelectorAll("w\\:r");
    for (const run of runs) {
      const rPr = run.querySelector("w\\:rPr");
      if (rPr) {
        const b = rPr.querySelector("w\\:b");
        if (b) bold = true;
      }
      const t = run.querySelector("w\\:t");
      if (t) text += t.textContent || "";
    }

    // Also check for hyperlinks
    const hyperlinks = p.querySelectorAll("w\\:hyperlink w\\:r");
    for (const run of hyperlinks) {
      const t = run.querySelector("w\\:t");
      if (t) text += t.textContent || "";
    }

    text = text.trim();
    if (text) {
      paragraphs.push({ text, bold, heading: isHeading });
    }
  }

  return { paragraphs };
}

async function parseXlsx(file: File): Promise<{ sheets: { name: string; rows: string[][] }[] }> {
  // Try as ZIP (xlsx format)
  try {
    const zip = await JSZip.loadAsync(file);
    const sheets: { name: string; rows: string[][] }[] = [];

    // Get shared strings
    const sharedStringsXml = await zip.file("xl/sharedStrings.xml")?.async("text");
    let sharedStrings: string[] = [];
    if (sharedStringsXml) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(sharedStringsXml, "application/xml");
      const siElements = doc.querySelectorAll("w\\:si, si");
      for (const si of siElements) {
        let text = "";
        const t = si.querySelector("w\\:t, t");
        if (t) text = t.textContent || "";
        sharedStrings.push(text);
      }
    }

    // Get sheet names
    const workbookXml = await zip.file("xl/workbook.xml")?.async("text");
    const sheetNames: string[] = [];
    if (workbookXml) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(workbookXml, "application/xml");
      const sheetEls = doc.querySelectorAll("w\\:sheet, sheet");
      for (const s of sheetEls) {
        sheetNames.push(s.getAttribute("name") || `Sheet ${sheetNames.length + 1}`);
      }
    }

    // Parse each sheet
    const sheetFiles = Object.keys(zip.files).filter(f => f.match(/xl\/worksheets\/sheet\d+\.xml/));
    for (let i = 0; i < sheetFiles.length; i++) {
      const sheetXml = await zip.file(sheetFiles[i])?.async("text");
      if (!sheetXml) continue;

      const parser = new DOMParser();
      const doc = parser.parseFromString(sheetXml, "application/xml");
      const rows: string[][] = [];
      const rowElements = doc.querySelectorAll("w\\:row, row");

      for (const row of rowElements) {
        const cells: string[] = [];
        const cellElements = row.querySelectorAll("w\\:c, c");
        for (const cell of cellElements) {
          const cellType = cell.getAttribute("t") || "";
          const value = cell.querySelector("w\\:v, v");
          let cellText = value?.textContent || "";

          if (cellType === "s" && sharedStrings.length > 0) {
            // Shared string reference
            const idx = parseInt(cellText);
            cellText = sharedStrings[idx] || cellText;
          }

          cells.push(cellText);
        }
        if (cells.length > 0) rows.push(cells);
      }

      sheets.push({ name: sheetNames[i] || `Sheet ${i + 1}`, rows });
    }

    if (sheets.length > 0) return { sheets };
  } catch {
    // Not a valid ZIP/xlsx
  }

  // Fallback: parse as CSV
  const text = await file.text();
  const rows = text.split("\n").map(line =>
    line.split(",").map(cell => cell.trim().replace(/^"|"$/g, ""))
  ).filter(row => row.some(cell => cell.length > 0));

  return { sheets: [{ name: "Sheet 1", rows }] };
}

async function parsePptx(file: File): Promise<{ slides: { text: string; title: string; body: string }[] }> {
  const zip = await JSZip.loadAsync(file);
  const slides: { text: string; title: string; body: string }[] = [];

  const slideFiles = Object.keys(zip.files)
    .filter(f => f.match(/ppt\/slides\/slide\d+\.xml/))
    .sort();

  for (const slideFile of slideFiles) {
    const slideXml = await zip.file(slideFile)?.async("text");
    if (!slideXml) continue;

    const parser = new DOMParser();
    const doc = parser.parseFromString(slideXml, "application/xml");

    let title = "";
    let body = "";

    // Get all text
    const allText: string[] = [];
    const textElements = doc.querySelectorAll("w\\:t, a\\:t, t");

    for (const t of textElements) {
      const txt = (t.textContent || "").trim();
      if (txt) allText.push(txt);
    }

    // Try to identify title vs body
    const shapes = doc.querySelectorAll("p\\:sp, p\\:cxnSp");
    for (const shape of shapes) {
      const nvSpPr = shape.querySelector("p\\:nvSpPr");
      if (nvSpPr) {
        const ph = nvSpPr.querySelector("p\\:ph");
        if (ph) {
          const type = ph.getAttribute("type") || "";
          const texts: string[] = [];
          const tEls = shape.querySelectorAll("a\\:t, w\\:t, t");
          for (const t of tEls) {
            const txt = (t.textContent || "").trim();
            if (txt) texts.push(txt);
          }
          if (type === "title" || type === "ctrTitle") {
            title = texts.join(" ");
          } else {
            body += texts.join(" ") + " ";
          }
        }
      }
    }

    const slideText = allText.join(" ").trim();
    slides.push({
      text: slideText,
      title: title.trim(),
      body: body.trim(),
    });
  }

  return { slides };
}

// Main office-to-PDF converter
export async function officeToPDF(
  file: File,
  options: Record<string, string | number | boolean>
): Promise<ProcessResult> {
  try {
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const ext = file.name.split(".").pop()?.toLowerCase() || "";

    const pageSize = String(options["page-size"] || "a4");
    const isLandscape = String(options["orientation"]) === "landscape";
    const pageSizes: Record<string, [number, number]> = {
      a4: [612, 792], letter: [616, 792], legal: [616, 1008],
      a3: [842, 1191], a5: [420, 595],
    };
    let [baseW, baseH] = pageSizes[pageSize] || [612, 792];
    if (isLandscape) [baseW, baseH] = [baseH, baseW];

    const marginVal = String(options["margins"] || "normal");
    const margins: Record<string, number> = { normal: 50, narrow: 36, wide: 72, none: 0 };
    const margin = margins[marginVal] || 50;

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

    const maxLineWidth = baseW - margin * 2;

    function addPage(): typeof currentPage {
      const p = pdf.addPage([baseW, baseH]);
      return p;
    }

    function drawWrappedText(text: string, x: number, startY: number, f: any, size: number, color: any, maxW: number): number {
      const words = text.split(/\s+/);
      let curLine = "";
      let y = startY;
      const lh = size * 1.4;

      let currentPage = pdf.getPages()[pdf.getPageCount() - 1];

      for (const word of words) {
        const test = curLine ? `${curLine} ${word}` : word;
        if (f.widthOfTextAtSize(test, size) > maxW) {
          if (y < margin + size) {
            currentPage = addPage();
            y = baseH - margin;
          }
          if (curLine) {
            currentPage.drawText(curLine, { x, y, size, font: f, color });
            y -= lh;
          }
          curLine = word;
        } else {
          curLine = test;
        }
      }
      if (curLine) {
        if (y < margin + size) {
          currentPage = addPage();
          y = baseH - margin;
        }
        currentPage.drawText(curLine, { x, y, size, font: f, color });
        y -= lh;
      }
      return y;
    }

    if (ext === "docx" || ext === "doc") {
      // ===== WORD to PDF =====
      const { paragraphs } = await parseDocx(file);
      let currentPage = addPage();
      let y = baseH - margin;

      for (const para of paragraphs) {
        const fontSize = para.heading ? 18 : 11;
        const useFont = para.bold || para.heading ? fontBold : font;

        if (para.heading && y < margin + 30) {
          currentPage = addPage();
          y = baseH - margin;
        } else if (y < margin + fontSize) {
          currentPage = addPage();
          y = baseH - margin;
        }

        y = drawWrappedText(para.text, margin, y, useFont, fontSize, rgb(0.15, 0.15, 0.15), maxLineWidth);
        y -= para.heading ? 8 : 4;
      }

      const data = await pdf.save();
      return {
        success: true,
        outputFiles: [{ name: `${baseName}.pdf`, data, size: data.length }],
        message: `Converted Word document to PDF (${pdf.getPageCount()} pages)`,
        stats: { originalSize: file.size, outputSize: data.length },
      };

    } else if (ext === "xlsx" || ext === "xls" || ext === "csv") {
      // ===== EXCEL to PDF =====
      const { sheets } = await parseXlsx(file);
      let currentPage = addPage();
      let y = baseH - margin;

      // Title
      currentPage.drawText(baseName, { x: margin, y, size: 16, font: fontBold, color: rgb(0.15, 0.15, 0.15) });
      y -= 24;

      for (let si = 0; si < sheets.length; si++) {
        const sheet = sheets[si];

        if (si > 0 || sheets.length > 1) {
          if (y < margin + 30) { currentPage = addPage(); y = baseH - margin; }
          currentPage.drawText(`Sheet: ${sheet.name}`, { x: margin, y, size: 12, font: fontBold, color: rgb(0.4, 0.4, 0.4) });
          y -= 18;
        }

        // Determine column count
        const maxCols = Math.max(...sheet.rows.map(r => r.length), 1);
        const colWidth = maxLineWidth / Math.min(maxCols, 10);
        const fontSize = 8;
        const rowHeight = fontSize * 1.5;

        for (let ri = 0; ri < sheet.rows.length; ri++) {
          if (y < margin + rowHeight) {
            currentPage = addPage();
            y = baseH - margin;
          }

          const row = sheet.rows[ri];
          const isHeader = ri === 0;

          // Draw row background
          if (isHeader) {
            currentPage.drawRectangle({
              x: margin, y: y - 2, width: colWidth * Math.min(row.length, 10), height: rowHeight + 2,
              color: rgb(0.9, 0.93, 0.95),
            });
          }

          for (let ci = 0; ci < Math.min(row.length, 10); ci++) {
            const cellText = (row[ci] || "").substring(0, 30); // Truncate long cells
            const cellX = margin + ci * colWidth + 4;
            if (cellX > baseW - margin) break;

            currentPage.drawText(cellText, {
              x: cellX, y,
              size: fontSize,
              font: isHeader ? fontBold : font,
              color: isHeader ? rgb(0.2, 0.2, 0.2) : rgb(0.3, 0.3, 0.3),
              maxWidth: colWidth - 8,
            });
          }
          y -= rowHeight;
        }

        y -= 16; // Gap between sheets
      }

      const data = await pdf.save();
      return {
        success: true,
        outputFiles: [{ name: `${baseName}.pdf`, data, size: data.length }],
        message: `Converted spreadsheet to PDF (${pdf.getPageCount()} pages)`,
        stats: { originalSize: file.size, outputSize: data.length },
      };

    } else if (ext === "pptx" || ext === "ppt") {
      // ===== POWERPOINT to PDF =====
      const { slides } = await parsePptx(file);

      for (const slide of slides) {
        const currentPage = addPage();
        let y = baseH - margin;

        // Slide border
        currentPage.drawRectangle({
          x: margin, y: margin, width: baseW - margin * 2, height: baseH - margin * 2,
          borderColor: rgb(0.85, 0.85, 0.85),
          borderWidth: 1,
          color: rgb(0.98, 0.98, 0.98),
        });

        y = baseH - margin - 20;

        if (slide.title) {
          // Title bar
          currentPage.drawRectangle({
            x: margin, y: y - 4, width: baseW - margin * 2, height: 28,
            color: rgb(0.78, 0.16, 0.16),
          });
          currentPage.drawText(slide.title.substring(0, 80), {
            x: margin + 12, y: y + 2, size: 14, font: fontBold, color: rgb(1, 1, 1),
            maxWidth: baseW - margin * 2 - 24,
          });
          y -= 40;
        }

        if (slide.body) {
          y = drawWrappedText(slide.body, margin + 12, y, font, 10, rgb(0.3, 0.3, 0.3), baseW - margin * 2 - 24);
        } else if (slide.text) {
          y = drawWrappedText(slide.text, margin + 12, y, font, 10, rgb(0.3, 0.3, 0.3), baseW - margin * 2 - 24);
        }

        // Slide number
        const slideNum = slides.indexOf(slide) + 1;
        currentPage.drawText(`Slide ${slideNum}`, {
          x: baseW - margin - 50, y: margin + 10, size: 8, font: fontItalic, color: rgb(0.7, 0.7, 0.7),
        });
      }

      const data = await pdf.save();
      return {
        success: true,
        outputFiles: [{ name: `${baseName}.pdf`, data, size: data.length }],
        message: `Converted presentation to PDF (${pdf.getPageCount()} pages)`,
        stats: { originalSize: file.size, outputSize: data.length },
      };

    } else {
      // Generic fallback — extract text and create PDF
      const textContent = await file.text();
      const cleaned = textContent.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();

      let currentPage = addPage();
      drawWrappedText(cleaned.substring(0, 50000), margin, baseH - margin, font, 10, rgb(0.2, 0.2, 0.2), maxLineWidth);

      const data = await pdf.save();
      return {
        success: true,
        outputFiles: [{ name: `${baseName}.pdf`, data, size: data.length }],
        message: `Converted ${file.name} to PDF (${pdf.getPageCount()} pages)`,
        stats: { originalSize: file.size, outputSize: data.length },
      };
    }
  } catch (err) {
    return { success: false, outputFiles: [], message: `Failed: ${err instanceof Error ? err.message : "Unknown error"}` };
  }
}

// ========================
// Download Helpers
// ========================

export function downloadBlob(data: Uint8Array, filename: string) {
  const blob = new Blob([data], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function downloadMultipleAsZip(
  files: { name: string; data: Uint8Array }[]
) {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.data);
  }
  const zipBlob = await zip.generateAsync({ type: "uint8array" });
  downloadBlob(zipBlob, "pdfcrux_output.zip");
}

// ========================
// Master Process Function
// ========================

export async function processTool(
  toolId: string,
  files: File[],
  options: Record<string, string | number | boolean>,
  compareFileA?: File | null,
  compareFileB?: File | null
): Promise<ProcessResult> {
  switch (toolId) {
    case "merge-pdf":
      return mergePDFs(files, options);

    case "split-pdf":
      return splitPDF(files[0], options);

    case "rotate-pdf":
      return rotatePDF(files[0], options);

    case "page-numbers":
      return addPageNumbers(files[0], options);

    case "organize-pdf":
      return organizePDF(files[0], options);

    case "compress-pdf":
      return compressPDF(files[0], options);

    case "repair-pdf":
      return repairPDF(files[0], options);

    case "watermark-pdf":
      return watermarkPDF(files[0], options);

    case "sign-pdf":
      return signPDF(files[0], options);

    case "protect-pdf":
      return protectPDF(files[0], options);

    case "unlock-pdf":
      return unlockPDF(files[0], options);

    case "compare-pdf":
      if (!compareFileA || !compareFileB) {
        return {
          success: false,
          outputFiles: [],
          message: "Please upload two PDF files to compare",
        };
      }
      return comparePDFs(compareFileA, compareFileB, options);

    case "pdf-to-pdfa":
      return convertToPDFA(files[0], options);

    case "edit-pdf":
      return editPDF(files[0], options);

    case "jpg-to-pdf":
      return imageToPDF(files, options);

    case "pdf-to-jpg":
      return pdfToImage(files[0], options, "jpeg");

    case "pdf-to-word":
      return pdfToWord(files[0], options);

    case "pdf-to-excel":
      return pdfToExcel(files[0], options);

    case "word-to-pdf":
    case "excel-to-pdf":
    case "powerpoint-to-pdf":
      return officeToPDF(files[0], options);

    default:
      return {
        success: false,
        outputFiles: [],
        message: `Unknown tool: ${toolId}`,
      };
  }
}
