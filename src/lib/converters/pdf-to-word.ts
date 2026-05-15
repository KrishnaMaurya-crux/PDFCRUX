/**
 * PDF to Word (DOCX) Converter — Dual Mode Engine
 *
 * Two conversion modes controlled by the "gemini-ocr" toggle:
 *
 *   Gemini OCR Mode (toggle ON):
 *     Phase 1: Send raw PDF to /api/gemini/ocr-pdf (0-80%)
 *     Phase 2: Build DOCX from Gemini-structured elements (80-100%)
 *
 *   Basic Mode (toggle OFF):
 *     Phase 1: Extract text with pdfjs-dist (0-70%)
 *     Phase 2: Build DOCX from extracted text (70-100%)
 *
 * All processing is client-side except the Gemini API call.
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
// Shared types
// ═══════════════════════════════════════════════════════════════════════════

/** A single structured element. */
export interface GeminiElement {
  type: "heading1" | "heading2" | "heading3" | "paragraph" | "bullet_list" | "numbered_list" | "table";
  text?: string;
  bold?: boolean;
  items?: string[];
  headers?: string[];
  rows?: string[][];
}

/** A single page of structured elements. */
export interface GeminiPage {
  page: number;
  elements: GeminiElement[];
}

/** Response from the /api/gemini/ocr-pdf endpoint. */
interface GeminiOcrResponse {
  success: boolean;
  pages?: GeminiPage[];
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/** Max retry attempts for a failed API call. */
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

// ═══════════════════════════════════════════════════════════════════════════
// Mode 1: Gemini OCR — Send raw PDF to API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send the raw PDF file to /api/gemini/ocr-pdf for native PDF analysis.
 * Gemini reads the PDF directly — no image conversion needed.
 * Progress: 5% → 80%
 */
async function analyzeWithGeminiOcr(
  file: File,
  language: string,
  onProgress: (status: string, percent: number) => void,
): Promise<GeminiPage[]> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("language", language);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      onProgress("Sending PDF to Gemini AI for analysis...", 15);

      const response = await fetch("/api/gemini/ocr-pdf", {
        method: "POST",
        body: fd,
      });

      // Check for non-JSON responses (prevents "Unexpected token R" crash)
      if (!response.ok) {
        let errorMsg = `Server error (${response.status}). Please try again.`;
        try {
          const errBody = await response.json();
          if (errBody?.error) errorMsg = errBody.error;
        } catch {
          // Response wasn't JSON
        }
        if (attempt < MAX_RETRIES) {
          console.warn(`Gemini OCR failed (attempt ${attempt + 1}), retrying: ${errorMsg}`);
          continue;
        }
        throw new Error(errorMsg);
      }

      const data: GeminiOcrResponse = await response.json();

      if (!data.success || !data.pages || data.pages.length === 0) {
        const msg = data.error || "AI analysis returned no results.";
        if (attempt < MAX_RETRIES) {
          console.warn(`Gemini OCR failed (attempt ${attempt + 1}), retrying: ${msg}`);
          continue;
        }
        throw new Error(msg);
      }

      onProgress("AI analysis complete!", 80);
      return data.pages;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        console.warn(`Gemini OCR error (attempt ${attempt + 1}), retrying:`, err);
        continue;
      }
      throw err;
    }
  }

  throw new Error("Unexpected: OCR processing fell through retry loop");
}

// ═══════════════════════════════════════════════════════════════════════════
// Mode 2: Basic Text Extraction — pdfjs-dist (client-side, no AI)
// ═══════════════════════════════════════════════════════════════════════════

interface TextItemInfo {
  str: string;
  fontSize: number;
  x: number;
  y: number;
  width: number;
  bold: boolean;
}

interface TextLine {
  text: string;
  fontSize: number;
  x: number;
  y: number;
  bold: boolean;
}

/**
 * Extract text from a PDF using pdfjs-dist with basic structuring.
 * Groups text items into lines, detects headings by font size,
 * identifies lists, and produces GeminiPage[] compatible output.
 * Progress: 5% → 70%
 */
async function extractBasicText(
  file: File,
  onProgress: (status: string, percent: number) => void,
): Promise<GeminiPage[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useWorkerFetch: false,
  }).promise;

  const totalPages = pdfDoc.numPages;
  const pages: GeminiPage[] = [];

  // Collect all font sizes across all pages to compute statistics
  const allFontSizes: number[] = [];
  const allPageLines: TextLine[][] = [];

  for (let i = 1; i <= totalPages; i++) {
    onProgress(`Extracting text from page ${i} of ${totalPages}...`, Math.round((i / totalPages) * 60) + 5);

    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: TextItemInfo[] = (textContent.items as any[])
      .filter((item: any) => "str" in item && (item.str as string).trim().length > 0)
      .map((item: any) => {
        const tx = item.transform as number[];
        const fontSize = Math.abs(tx[0]) || Math.abs(tx[3]) || 12;
        return {
          str: item.str as string,
          fontSize: Math.round(fontSize * 10) / 10,
          x: tx[4],
          y: tx[5],
          width: item.width as number,
          bold: String(item.fontName || "").toLowerCase().includes("bold"),
        };
      });

    // Group items into lines based on Y-position proximity
    const lines = groupItemsIntoLines(items);
    allPageLines.push(lines);

    // Collect font sizes for statistics
    for (const line of lines) {
      if (line.text.trim().length > 0) {
        allFontSizes.push(line.fontSize);
      }
    }
  }

  // Compute font size statistics for heading detection
  allFontSizes.sort((a, b) => a - b);
  const medianFontSize = allFontSizes.length > 0
    ? allFontSizes[Math.floor(allFontSizes.length / 2)]
    : 12;
  const bodyFontSize = medianFontSize;

  // Build structured pages from lines
  for (let p = 0; p < allPageLines.length; p++) {
    const lines = allPageLines[p];
    const elements: GeminiElement[] = [];

    // Group consecutive lines into paragraphs / lists / headings
    let currentGroup: TextLine[] = [];

    const flushGroup = () => {
      if (currentGroup.length === 0) return;

      const firstLine = currentGroup[0];
      const fullText = currentGroup.map((l) => l.text).join(" ").trim();
      if (!fullText) { currentGroup = []; return; }

      const sizeRatio = firstLine.fontSize / bodyFontSize;

      // Detect heading by font size
      if (sizeRatio >= 1.6 && fullText.length < 100) {
        elements.push({ type: "heading1", text: fullText, bold: firstLine.bold });
      } else if (sizeRatio >= 1.3 && fullText.length < 100) {
        elements.push({ type: "heading2", text: fullText, bold: firstLine.bold });
      } else if (sizeRatio >= 1.1 && firstLine.bold && fullText.length < 120) {
        elements.push({ type: "heading3", text: fullText, bold: true });
      }
      // Detect bullet list items
      else if (/^[•●▪►▸\-–—]\s/.test(firstLine.text) || /^\s*\d+[\.\)]\s/.test(firstLine.text)) {
        const isNumbered = /^\s*\d+[\.\)]\s/.test(firstLine.text);
        const cleanItems = currentGroup.map((l) =>
          l.text.replace(/^[•●▪►▸\-–—]\s*/, "").replace(/^\s*\d+[\.\)]\s*/, "").trim()
        ).filter((t) => t.length > 0);

        if (cleanItems.length > 0) {
          elements.push({
            type: isNumbered ? "numbered_list" : "bullet_list",
            items: cleanItems,
          });
        }
      }
      // Regular paragraph
      else {
        elements.push({ type: "paragraph", text: fullText, bold: firstLine.bold });
      }

      currentGroup = [];
    };

    for (let l = 0; l < lines.length; l++) {
      const line = lines[l];
      if (!line.text.trim()) {
        flushGroup();
        continue;
      }

      // If next line has very different Y (large gap), flush current group
      if (currentGroup.length > 0) {
        const prevY = currentGroup[currentGroup.length - 1].y;
        const yGap = Math.abs(line.y - prevY);
        const lineHeight = line.fontSize * 1.5;
        if (yGap > lineHeight * 1.8) {
          flushGroup();
        }
      }

      // If font size changes significantly, start new group
      if (currentGroup.length > 0) {
        const prevSize = currentGroup[0].fontSize;
        const sizeDiff = Math.abs(line.fontSize - prevSize) / bodyFontSize;
        if (sizeDiff > 0.15) {
          flushGroup();
        }
      }

      currentGroup.push(line);
    }

    flushGroup();

    // If no elements were detected, add a placeholder paragraph
    if (elements.length === 0) {
      const allText = lines.map((l) => l.text).join(" ").trim();
      if (allText) {
        elements.push({ type: "paragraph", text: allText });
      }
    }

    pages.push({ page: p + 1, elements });
  }

  onProgress("Text extraction complete!", 70);
  return pages;
}

/**
 * Group text items into lines based on Y-position proximity.
 */
function groupItemsIntoLines(items: TextItemInfo[]): TextLine[] {
  if (items.length === 0) return [];

  // Sort by Y (top to bottom), then X (left to right)
  const sorted = [...items].sort((a, b) => {
    const yDiff = b.y - a.y; // PDF Y-axis is inverted (bottom to top)
    if (Math.abs(yDiff) > 3) return yDiff; // Different lines
    return a.x - b.x; // Same line, sort by X
  });

  const lines: TextLine[] = [];
  let currentLine: TextItemInfo[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const prevY = currentLine[0].y;
    const yThreshold = Math.max(item.fontSize * 0.5, 4);

    if (Math.abs(item.y - prevY) <= yThreshold) {
      // Same line — check X gap to detect word boundaries
      const lastItem = currentLine[currentLine.length - 1];
      const xGap = item.x - (lastItem.x + lastItem.width);

      if (xGap > item.fontSize * 2.5) {
        // Large X gap — likely a new word/phrase, add space
        lines.push(buildLine(currentLine));
        currentLine = [item];
      } else {
        currentLine.push(item);
      }
    } else {
      // New line
      lines.push(buildLine(currentLine));
      currentLine = [item];
    }
  }

  if (currentLine.length > 0) {
    lines.push(buildLine(currentLine));
  }

  return lines;
}

/**
 * Build a TextLine from a group of TextItemInfos.
 */
function buildLine(items: TextItemInfo[]): TextLine {
  // Sort by X position within the line
  const sorted = [...items].sort((a, b) => a.x - b.x);

  // Calculate average font size and detect bold
  const avgFontSize = sorted.reduce((s, i) => s + i.fontSize, 0) / sorted.length;
  const anyBold = sorted.some((i) => i.bold);

  // Join text with spaces (respecting X gaps)
  let text = "";
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const prevEnd = sorted[i - 1].x + sorted[i - 1].width;
      const gap = sorted[i].x - prevEnd;
      text += gap > sorted[i].fontSize * 0.3 ? " " : "";
    }
    text += sorted[i].str;
  }

  return {
    text: text.trim(),
    fontSize: Math.round(avgFontSize * 10) / 10,
    x: sorted[0].x,
    y: sorted[0].y,
    bold: anyBold,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3: DOCX Generation (shared by both modes)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a real Word table from element table data.
 */
function buildRealTable(element: GeminiElement): Table {
  const headers = element.headers || [];
  const rows = element.rows || [];
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
                  size: isHeader ? 22 : 20,
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
 * Convert a structured element into DOCX content nodes.
 */
function elementToDocxContent(element: GeminiElement): (Paragraph | Table)[] {
  switch (element.type) {
    case "heading1":
      return [new Paragraph({
        children: [new TextRun({ text: element.text || "", bold: true, size: 32, font: "Calibri" })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 360, after: 160 },
      })];

    case "heading2":
      return [new Paragraph({
        children: [new TextRun({ text: element.text || "", bold: true, size: 28, font: "Calibri" })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 120 },
      })];

    case "heading3":
      return [new Paragraph({
        children: [new TextRun({ text: element.text || "", bold: true, size: 24, font: "Calibri" })],
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 80 },
      })];

    case "paragraph":
      return [new Paragraph({
        children: [new TextRun({ text: element.text || "", bold: element.bold || false, size: 22, font: "Calibri" })],
        spacing: { after: 120, line: 276 },
      })];

    case "bullet_list": {
      const items = element.items || [];
      if (items.length === 0) return [];
      return items.map(
        (item) => new Paragraph({
          children: [new TextRun({ text: `•  ${item}`, size: 22, font: "Calibri" })],
          spacing: { after: 60, line: 276 },
          indent: { left: 360 },
        }),
      );
    }

    case "numbered_list": {
      const items = element.items || [];
      if (items.length === 0) return [];
      return items.map(
        (item, idx) => new Paragraph({
          children: [new TextRun({ text: `${idx + 1}.  ${item}`, size: 22, font: "Calibri" })],
          spacing: { after: 60, line: 276 },
          indent: { left: 360 },
        }),
      );
    }

    case "table":
      return [buildRealTable(element)];

    default:
      return [new Paragraph({
        children: [new TextRun({ text: element.text || "", size: 22, font: "Calibri" })],
        spacing: { after: 120, line: 276 },
      })];
  }
}

/**
 * Build the final DOCX document from structured pages.
 * Progress: 82% → 100%
 */
async function buildDocx(
  pages: GeminiPage[],
  onProgress: (status: string, percent: number) => void,
  startPercent: number = 82,
): Promise<Uint8Array> {
  onProgress("Building Word document...", startPercent);

  const children: (Paragraph | Table)[] = [];

  for (let p = 0; p < pages.length; p++) {
    const page = pages[p];

    if (p > 0) {
      children.push(new Paragraph({
        children: [new TextRun({ text: "", break: 1 })],
        pageBreakBefore: true,
      }));
    }

    if (!page.elements || page.elements.length === 0) {
      children.push(new Paragraph({ children: [] }));
      continue;
    }

    for (const element of page.elements) {
      const content = elementToDocxContent(element);
      children.push(...content);
    }

    const pageProgress = startPercent + Math.round(((p + 1) / pages.length) * 16);
    onProgress("Building Word document...", Math.min(pageProgress, 98));
  }

  onProgress("Finalizing document...", 98);

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
        heading1: { run: { font: "Calibri", size: 32, bold: true, color: "1F2937" } },
        heading2: { run: { font: "Calibri", size: 28, bold: true, color: "374151" } },
        heading3: { run: { font: "Calibri", size: 24, bold: true, color: "4B5563" } },
      },
    },
    sections: [{ properties: {}, children }],
  });

  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}

// ═══════════════════════════════════════════════════════════════════════════
// Main exported function
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert a PDF file to a DOCX (Word) file.
 *
 * Supports two modes via options["gemini-ocr"]:
 *   true  — Gemini OCR: Send raw PDF to Gemini AI for native PDF analysis
 *   false — Basic: Extract text client-side with pdfjs-dist (fast, no AI)
 *
 * @param file       — The uploaded PDF file
 * @param options    — Conversion options (gemini-ocr, language, columns, etc.)
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
  const useGeminiOcr = Boolean(options["gemini-ocr"] ?? true); // Default ON

  try {
    report("Preparing conversion...", 2);

    let pages: GeminiPage[];
    let totalPages: number;
    let modeLabel: string;

    if (useGeminiOcr) {
      // ── Mode 1: Gemini OCR (native PDF support) ──
      const ocrLang = String(options["language"] || "eng");
      const language = languageMap[ocrLang] || "English";

      pages = await analyzeWithGeminiOcr(file, language, report);
      totalPages = pages.length;
      modeLabel = "Gemini OCR";
    } else {
      // ── Mode 2: Basic text extraction ──
      pages = await extractBasicText(file, report);
      totalPages = pages.length;
      modeLabel = "Basic";
    }

    if (pages.length === 0) {
      return {
        success: false,
        outputFiles: [],
        message: "No content could be extracted from the PDF. The file may be empty or corrupted.",
      };
    }

    // Count stats
    let totalElements = 0;
    let headingCount = 0;
    let tableCount = 0;
    for (const page of pages) {
      for (const el of page.elements) {
        totalElements++;
        if (el.type === "heading1" || el.type === "heading2" || el.type === "heading3") headingCount++;
        if (el.type === "table") tableCount++;
      }
    }

    // ── Build DOCX ──
    const startPercent = useGeminiOcr ? 82 : 72;
    const docxBuffer = await buildDocx(pages, report, startPercent);

    report("Complete!", 100);

    const elapsed = Date.now() - startTime;

    return {
      success: true,
      outputFiles: [
        { name: `${baseName}.docx`, data: docxBuffer, size: docxBuffer.length },
      ],
      message: `Converted ${totalPages} page(s) to DOCX in ${(elapsed / 1000).toFixed(1)}s [${modeLabel}] — ${totalElements} elements (${headingCount} headings, ${tableCount} tables)`,
      stats: { originalSize: file.size, outputSize: docxBuffer.length },
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
