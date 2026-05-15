/**
 * PDF to Word (DOCX) Converter — Gemini Vision Engine
 *
 * Three-phase conversion pipeline:
 *   Phase 1: PDF → Images (0-30%)       — Render each page to JPEG at 200 DPI
 *   Phase 2: Gemini AI Analysis (30-80%) — Send batches to /api/gemini-ocr
 *   Phase 3: DOCX Generation (80-100%)   — Build structured Word document
 *
 * All processing is client-side except the Gemini API call, which goes through
 * our server-side proxy endpoint. No z-ai-web-dev-sdk on the client.
 */

import type { ProcessResult } from "@/lib/pdf-processor";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";

// ═══════════════════════════════════════════════════════════════════════════
// Gemini API response types
// ═══════════════════════════════════════════════════════════════════════════

/** A single structured element returned by Gemini for a page. */
export interface GeminiElement {
  type: "heading1" | "heading2" | "heading3" | "paragraph" | "bullet_list" | "numbered_list" | "table";
  text?: string;
  bold?: boolean;
  items?: string[];
  headers?: string[];
  rows?: string[][];
}

/** A single page of structured elements from Gemini. */
export interface GeminiPage {
  page: number;
  elements: GeminiElement[];
}

/** The full response from the /api/gemini-ocr endpoint. */
interface GeminiOcrResponse {
  success: boolean;
  pages?: GeminiPage[];
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/** Number of pages to send per API call (safe for Vercel body limits). */
const BATCH_SIZE = 5;

/** DPI for page rendering — good balance of quality and file size. */
const RENDER_DPI = 200;

/** JPEG quality for page images. */
const JPEG_QUALITY = 0.85;

/** Max retry attempts for a failed batch. */
const MAX_RETRIES = 1;

/** Language code → human-readable name for the Gemini prompt. */
const languageMap: Record<string, string> = {
  eng: "English",
  hin: "Hindi",
  "hin+eng": "Hindi and English mixed",
  spa: "Spanish",
  fra: "French",
  deu: "German",
  chi_sim: "Chinese (Simplified)",
  chi_tra: "Chinese (Traditional)",
  jpn: "Japanese",
  kor: "Korean",
  ara: "Arabic",
  por: "Portuguese",
  ita: "Italian",
  rus: "Russian",
};

// ═══════════════════════════════════════════════════════════════════════════
// DOCX styling helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Clamp a value between min and max. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Clamp font size to a safe range for DOCX. */
function clampFontSize(size: number): number {
  return clamp(size, 6, 48);
}

/** Standard visible border for table cells. */
const tableBorder = {
  style: BorderStyle.SINGLE,
  size: 1,
  color: "CCCCCC",
};

const tableBorders = {
  top: tableBorder,
  bottom: tableBorder,
  left: tableBorder,
  right: tableBorder,
};

/** Invisible border (kept for backward compatibility). */
const noBorder = {
  style: BorderStyle.NONE,
  size: 0,
  color: "FFFFFF",
};

const noBorders = {
  top: noBorder,
  bottom: noBorder,
  left: noBorder,
  right: noBorder,
};

// ═══════════════════════════════════════════════════════════════════════════
// Phase 1: PDF → Images
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load a PDF file using pdfjs-dist (dynamically imported for bundle splitting).
 */
async function loadPdf(file: File) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const arrayBuffer = await file.arrayBuffer();
  return pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer), useWorkerFetch: false }).promise;
}

/**
 * Render a single PDF page to a JPEG Blob at the specified DPI and quality.
 * The canvas is filled white first to handle transparent/colored backgrounds.
 */
async function renderPageToJpeg(
  pdfDoc: Awaited<ReturnType<typeof loadPdf>>,
  pageNum: number,
  dpi: number = RENDER_DPI,
  quality: number = JPEG_QUALITY,
): Promise<Blob> {
  const page = await pdfDoc.getPage(pageNum);
  const scale = dpi / 72;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d")!;

  // White background for clean JPEG output
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Render all PDF pages to JPEG blobs.
 * Progress: 0% → 30%
 */
async function renderAllPages(
  pdfDoc: Awaited<ReturnType<typeof loadPdf>>,
  totalPages: number,
  onProgress: (status: string, percent: number) => void,
): Promise<Blob[]> {
  const blobs: Blob[] = [];

  for (let i = 1; i <= totalPages; i++) {
    onProgress(`Rendering page ${i} of ${totalPages}...`, Math.round((i / totalPages) * 30));
    const blob = await renderPageToJpeg(pdfDoc, i);
    blobs.push(blob);
  }

  return blobs;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2: Gemini AI Analysis
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send a batch of page images to the Gemini OCR API.
 * Retries once on failure before giving up.
 */
async function sendBatchToGemini(
  batchImages: Blob[],
  language: string,
  batchIndex: number,
  totalBatches: number,
  startPage: number,
): Promise<GeminiPage[]> {
  const fd = new FormData();
  for (let i = 0; i < batchImages.length; i++) {
    fd.append("images", batchImages[i], `page_${startPage + i}.jpg`);
  }
  fd.append("language", language);
  fd.append("batchIndex", String(batchIndex));
  fd.append("totalBatches", String(totalBatches));

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch("/api/gemini-ocr", {
        method: "POST",
        body: fd,
      });

      const data: GeminiOcrResponse = await response.json();

      if (!response.ok || !data.success) {
        const msg = data.error || `Gemini API request failed (HTTP ${response.status})`;
        if (attempt < MAX_RETRIES) {
          console.warn(`Batch ${batchIndex} failed (attempt ${attempt + 1}), retrying: ${msg}`);
          continue;
        }
        throw new Error(msg);
      }

      return data.pages || [];
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        console.warn(`Batch ${batchIndex} error (attempt ${attempt + 1}), retrying:`, err);
        continue;
      }
      throw err;
    }
  }

  // Unreachable — the loop always throws or returns
  throw new Error("Unexpected: batch processing fell through retry loop");
}

/**
 * Split page blobs into batches and send each to the Gemini API.
 * Progress: 30% → 80%
 */
async function analyzeAllBatches(
  pageBlobs: Blob[],
  language: string,
  onProgress: (status: string, percent: number) => void,
): Promise<GeminiPage[]> {
  const allPages: GeminiPage[] = [];
  const totalBatches = Math.ceil(pageBlobs.length / BATCH_SIZE);

  for (let b = 0; b < totalBatches; b++) {
    const startIdx = b * BATCH_SIZE;
    const endIdx = Math.min(startIdx + BATCH_SIZE, pageBlobs.length);
    const batchImages = pageBlobs.slice(startIdx, endIdx);

    const batchNum = b + 1;
    const batchProgress = 30 + Math.round((batchNum / totalBatches) * 50);

    onProgress(
      `AI analyzing batch ${batchNum} of ${totalBatches} (pages ${startIdx + 1}–${endIdx})...`,
      batchProgress,
    );

    const batchPages = await sendBatchToGemini(
      batchImages,
      language,
      batchNum,
      totalBatches,
      startIdx + 1, // 1-indexed page number
    );

    allPages.push(...batchPages);
  }

  // Sort all pages by page number to ensure correct order
  allPages.sort((a, b) => a.page - b.page);

  return allPages;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3: DOCX Generation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a real Word table from Gemini table data.
 * First row is treated as header (bold text, gray shading).
 * Rows are padded to the maximum column count for uniform structure.
 */
function buildRealTable(element: GeminiElement): Table {
  const headers = element.headers || [];
  const rows = element.rows || [];

  // If we have separate headers, prepend them as the first row
  const allRows: string[][] = headers.length > 0 ? [headers, ...rows] : rows;
  if (allRows.length === 0) {
    return new Table({
      rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [] })], borders: tableBorders })] })],
      width: { size: 100, type: WidthType.PERCENTAGE },
    });
  }

  const maxCols = Math.max(...allRows.map((r) => r.length), 1);
  const docxRows: TableRow[] = [];

  for (let r = 0; r < allRows.length; r++) {
    const cells: TableCell[] = [];
    const isHeader = r === 0;
    const rowData = allRows[r];

    for (let c = 0; c < rowData.length; c++) {
      cells.push(
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: rowData[c] || "",
                  bold: isHeader,
                  size: isHeader ? 22 : 20, // 11pt header, 10pt body (half-points)
                }),
              ],
              spacing: { before: 40, after: 40 },
            }),
          ],
          shading: isHeader
            ? { type: "clear" as const, fill: "E8E8E8", color: "auto" }
            : { type: "clear" as const, fill: "FFFFFF", color: "auto" },
          borders: tableBorders,
          margins: { top: 40, bottom: 40, left: 80, right: 80 },
        }),
      );
    }

    // Pad rows shorter than max column count
    while (cells.length < maxCols) {
      cells.push(
        new TableCell({
          children: [new Paragraph({ children: [] })],
          shading: isHeader
            ? { type: "clear" as const, fill: "E8E8E8", color: "auto" }
            : { type: "clear" as const, fill: "FFFFFF", color: "auto" },
          borders: tableBorders,
          margins: { top: 40, bottom: 40, left: 80, right: 80 },
        }),
      );
    }

    docxRows.push(new TableRow({ children: cells }));
  }

  return new Table({
    rows: docxRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

/**
 * Convert a Gemini element into one or more DOCX-compatible content nodes.
 * Returns an array of Paragraph | Table objects.
 */
function elementToDocxContent(element: GeminiElement): (Paragraph | Table)[] {
  switch (element.type) {
    // ── Headings ──────────────────────────────────────────────────────
    case "heading1":
      return [
        new Paragraph({
          children: [
            new TextRun({
              text: element.text || "",
              bold: true,
              size: 32, // 16pt in half-points
              font: "Calibri",
            }),
          ],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 360, after: 160 },
        }),
      ];

    case "heading2":
      return [
        new Paragraph({
          children: [
            new TextRun({
              text: element.text || "",
              bold: true,
              size: 28, // 14pt
              font: "Calibri",
            }),
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 120 },
        }),
      ];

    case "heading3":
      return [
        new Paragraph({
          children: [
            new TextRun({
              text: element.text || "",
              bold: true,
              size: 24, // 12pt
              font: "Calibri",
            }),
          ],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 80 },
        }),
      ];

    // ── Paragraph ─────────────────────────────────────────────────────
    case "paragraph":
      return [
        new Paragraph({
          children: [
            new TextRun({
              text: element.text || "",
              bold: element.bold || false,
              size: 22, // 11pt
              font: "Calibri",
            }),
          ],
          spacing: { after: 120, line: 276 },
        }),
      ];

    // ── Bullet list ───────────────────────────────────────────────────
    case "bullet_list": {
      const items = element.items || [];
      if (items.length === 0) return [];

      return items.map(
        (item) =>
          new Paragraph({
            children: [
              new TextRun({
                text: `•  ${item}`,
                size: 22,
                font: "Calibri",
              }),
            ],
            spacing: { after: 60, line: 276 },
            indent: { left: 360 }, // 0.25 inch indent
          }),
      );
    }

    // ── Numbered list ─────────────────────────────────────────────────
    case "numbered_list": {
      const items = element.items || [];
      if (items.length === 0) return [];

      return items.map(
        (item, idx) =>
          new Paragraph({
            children: [
              new TextRun({
                text: `${idx + 1}.  ${item}`,
                size: 22,
                font: "Calibri",
              }),
            ],
            spacing: { after: 60, line: 276 },
            indent: { left: 360 },
          }),
      );
    }

    // ── Table ─────────────────────────────────────────────────────────
    case "table":
      return [buildRealTable(element)];

    default:
      // Unknown element type — fall back to paragraph
      return [
        new Paragraph({
          children: [
            new TextRun({
              text: element.text || "",
              size: 22,
              font: "Calibri",
            }),
          ],
          spacing: { after: 120, line: 276 },
        }),
      ];
  }
}

/**
 * Build the final DOCX document from all Gemini-analyzed pages.
 * Each page gets a page break separator (except the first).
 * Progress: 80% → 100%
 */
async function buildDocx(
  pages: GeminiPage[],
  onProgress: (status: string, percent: number) => void,
): Promise<Uint8Array> {
  onProgress("Building Word document...", 82);

  const children: (Paragraph | Table)[] = [];

  for (let p = 0; p < pages.length; p++) {
    const page = pages[p];

    // Page break before pages after the first
    if (p > 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: "", break: 1 })],
          pageBreakBefore: true,
        }),
      );
    }

    // If page has no elements, add an empty paragraph placeholder
    if (!page.elements || page.elements.length === 0) {
      children.push(new Paragraph({ children: [] }));
      continue;
    }

    // Convert each element to DOCX content
    for (const element of page.elements) {
      const content = elementToDocxContent(element);
      children.push(...content);
    }

    // Update progress within the 80-98% range
    const pageProgress = 82 + Math.round(((p + 1) / pages.length) * 16);
    onProgress("Building Word document...", pageProgress);
  }

  onProgress("Finalizing document...", 98);

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Calibri",
            size: 22, // 11pt default
          },
        },
        heading1: {
          run: {
            font: "Calibri",
            size: 32, // 16pt
            bold: true,
            color: "1F2937",
          },
        },
        heading2: {
          run: {
            font: "Calibri",
            size: 28, // 14pt
            bold: true,
            color: "374151",
          },
        },
        heading3: {
          run: {
            font: "Calibri",
            size: 24, // 12pt
            bold: true,
            color: "4B5563",
          },
        },
      },
    },
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}

// ═══════════════════════════════════════════════════════════════════════════
// Main exported function
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert a PDF file to a DOCX (Word) file using Gemini Vision AI for analysis.
 *
 * This is the main entry point called by the PDF processor engine.
 *
 * @param file       — The uploaded PDF file
 * @param options    — Conversion options (ocr-language, columns, etc.)
 * @param onProgress — Optional progress callback (status string, percent 0-100)
 * @returns ProcessResult with the generated DOCX file data
 */
export async function convertPdfToWord(
  file: File,
  options: Record<string, string | number | boolean>,
  onProgress?: (status: string, percent: number) => void,
): Promise<ProcessResult> {
  const startTime = Date.now();
  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const report = (status: string, percent: number) => onProgress?.(status, percent);

  try {
    // ── Resolve language ────────────────────────────────────────────
    const ocrLang = String(options["language"] || "eng");
    const language = languageMap[ocrLang] || "English";

    report("Loading PDF...", 2);

    // ── Phase 1: PDF → Images (0-30%) ───────────────────────────────
    const pdfDoc = await loadPdf(file);
    const totalPages = pdfDoc.numPages;

    if (totalPages === 0) {
      return {
        success: false,
        outputFiles: [],
        message: "The PDF appears to have no pages.",
      };
    }

    report(`Found ${totalPages} page(s), rendering...`, 5);
    const pageBlobs = await renderAllPages(pdfDoc, totalPages, report);

    // ── Phase 2: Gemini AI Analysis (30-80%) ────────────────────────
    report("Sending pages to AI for analysis...", 31);
    const geminiPages = await analyzeAllBatches(pageBlobs, language, report);

    if (geminiPages.length === 0) {
      return {
        success: false,
        outputFiles: [],
        message: "AI analysis returned no results. The PDF may be empty or unreadable.",
      };
    }

    // Count stats for the response message
    let totalElements = 0;
    let headingCount = 0;
    let tableCount = 0;

    for (const page of geminiPages) {
      for (const el of page.elements) {
        totalElements++;
        if (el.type === "heading1" || el.type === "heading2" || el.type === "heading3") headingCount++;
        if (el.type === "table") tableCount++;
      }
    }

    // ── Phase 3: DOCX Generation (80-100%) ──────────────────────────
    const docxBuffer = await buildDocx(geminiPages, report);

    report("Complete!", 100);

    const elapsed = Date.now() - startTime;

    return {
      success: true,
      outputFiles: [
        {
          name: `${baseName}.docx`,
          data: docxBuffer,
          size: docxBuffer.length,
        },
      ],
      message: `Converted ${totalPages} page(s) to DOCX in ${(elapsed / 1000).toFixed(1)}s — ${totalElements} elements extracted (${headingCount} headings, ${tableCount} tables)`,
      stats: {
        originalSize: file.size,
        outputSize: docxBuffer.length,
      },
    };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    const message = err instanceof Error ? err.message : "Unknown error during PDF to Word conversion";

    console.error("[pdf-to-word] Conversion failed:", message, err);

    return {
      success: false,
      outputFiles: [],
      message: `Conversion failed after ${(elapsed / 1000).toFixed(1)}s: ${message}`,
    };
  }
}
