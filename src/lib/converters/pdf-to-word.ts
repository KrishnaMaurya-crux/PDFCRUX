/**
 * PDF to Word (DOCX) Converter
 *
 * High-fidelity converter that extracts text with positioning from PDFs
 * using pdfjs-dist, reconstructs layout (headings, bold, italic, font sizes),
 * and generates a proper DOCX file using the `docx` library.
 *
 * For scanned PDFs with no selectable text, uses Tesseract.js OCR.
 *
 * All processing happens client-side in the browser.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  PageBreak,
  AlignmentType,
  type IRunOptions,
} from "docx";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import Tesseract from "tesseract.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OutputFile {
  name: string;
  file: File;
  size: number;
}

export interface ConversionStats {
  totalPages: number;
  ocrPages: number;
  totalCharacters: number;
  headingsDetected: number;
  processingTimeMs: number;
}

// ---------------------------------------------------------------------------
// Internal types for text extraction
// ---------------------------------------------------------------------------

interface ExtractedTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  bold: boolean;
  italic: boolean;
}

interface ExtractedLine {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  fontName: string;
  items: ExtractedTextItem[];
}

interface ExtractedPage {
  lines: ExtractedLine[];
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Detect if a font name suggests bold styling */
function isBoldFont(fontName: string): boolean {
  const lower = fontName.toLowerCase();
  return (
    lower.includes("bold") ||
    lower.includes("black") ||
    lower.includes("heavy")
  );
}

/** Detect if a font name suggests italic styling */
function isItalicFont(fontName: string): boolean {
  const lower = fontName.toLowerCase();
  return lower.includes("italic") || lower.includes("oblique");
}

/** Clamp a value between min and max */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Format bytes into human-readable string */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// ---------------------------------------------------------------------------
// 1. Load PDF and extract text items with positioning
// ---------------------------------------------------------------------------

async function loadPdf(
  file: File,
  onProgress?: (status: string, percent: number) => void
) {
  onProgress?.("Loading PDF document...", 2);

  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useWorkerFetch: false,
  }).promise;

  return pdfDoc;
}

/**
 * Extract text items from a single PDF page with full positioning data.
 */
async function extractPageItems(
  pdfDoc: Awaited<ReturnType<typeof loadPdf>>,
  pageNum: number
): Promise<ExtractedTextItem[]> {
  const page = await pdfDoc.getPage(pageNum);
  const textContent = await page.getTextContent();

  return textContent.items
    .filter((item): item is TextItem => "str" in item && item.str.trim().length > 0)
    .map((item) => {
      const tx = item.transform;
      return {
        text: item.str,
        x: tx[4],
        y: tx[5],
        width: item.width || 0,
        height: item.height || Math.abs(tx[0]) || 12,
        fontSize: Math.abs(tx[0]) || 12,
        fontName: item.fontName || "",
        bold: isBoldFont(item.fontName || ""),
        italic: isItalicFont(item.fontName || ""),
      };
    });
}

// ---------------------------------------------------------------------------
// 2. Group text items into lines based on y-position proximity
// ---------------------------------------------------------------------------

function groupItemsIntoLines(items: ExtractedTextItem[]): ExtractedLine[] {
  if (items.length === 0) return [];

  // Sort: top of page first (high y), then left-to-right
  const sorted = [...items].sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 3) return yDiff;
    return a.x - b.x;
  });

  const lines: ExtractedLine[] = [];
  let currentItems: ExtractedTextItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    // Compute adaptive threshold based on the dominant font size in the current line
    const dominantFontSize =
      currentItems.reduce((s, it) => s + it.fontSize, 0) / currentItems.length;
    const yThreshold = Math.max(dominantFontSize * 0.4, 3);

    if (Math.abs(item.y - currentY) > yThreshold) {
      // New line
      lines.push(buildLine(currentItems));
      currentItems = [item];
      currentY = item.y;
    } else {
      // Same line — append
      currentItems.push(item);
      // Update currentY as the average y of items in this line
      currentY = currentItems.reduce((s, it) => s + it.y, 0) / currentItems.length;
    }
  }

  if (currentItems.length > 0) {
    lines.push(buildLine(currentItems));
  }

  return lines;
}

/**
 * Build a single ExtractedLine from a group of text items on the same visual line.
 * Items are already sorted left-to-right within the group.
 */
function buildLine(items: ExtractedTextItem[]): ExtractedLine {
  // Sort items left-to-right within the line
  items.sort((a, b) => a.x - b.x);

  let text = "";
  let prevEnd = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i === 0) {
      text = item.text;
    } else {
      // Detect word gaps: if the space between previous item end and this item start
      // is larger than a typical character width, add extra space
      const avgCharWidth = item.fontSize * 0.55;
      const gap = item.x - prevEnd;

      if (gap > avgCharWidth * 1.5) {
        text += "  " + item.text; // Significant gap → likely word boundary
      } else if (gap > avgCharWidth * 0.3) {
        text += " " + item.text;
      } else {
        text += item.text;
      }
    }
    prevEnd = item.x + item.width;
  }

  // Derive line-level font properties from the first/largest item
  const largestItem = items.reduce(
    (max, it) => (it.fontSize > max.fontSize ? it : max),
    items[0]
  );

  const bold = items.some((it) => it.bold);
  const italic = items.some((it) => it.italic);

  return {
    text: text.trim(),
    x: items[0].x,
    y: largestItem.y,
    fontSize: largestItem.fontSize,
    bold,
    italic,
    fontName: largestItem.fontName,
    items,
  };
}

// ---------------------------------------------------------------------------
// 3. Detect structure: headings, paragraphs
// ---------------------------------------------------------------------------

type ParagraphRole = "heading1" | "heading2" | "heading3" | "normal";

function detectRole(line: ExtractedLine): ParagraphRole {
  if (line.fontSize > 18) return "heading1";
  if (line.fontSize > 14) return "heading2";
  if (line.fontSize > 12) return "heading3";
  return "normal";
}

// ---------------------------------------------------------------------------
// 4. OCR fallback for scanned pages
// ---------------------------------------------------------------------------

async function runOcrOnPage(
  pdfDoc: Awaited<ReturnType<typeof loadPdf>>,
  pageNum: number,
  language: string,
  onProgress?: (status: string, percent: number) => void
): Promise<string> {
  onProgress?.(`Running OCR on page ${pageNum}...`, 0);

  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 2 }); // 2x for better OCR accuracy

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  const result = await Tesseract.recognize(canvas, language, {
    logger: (m) => {
      if (m.status === "recognizing text") {
        onProgress?.(
          `Running OCR on page ${pageNum}... ${Math.round(m.progress * 100)}%`,
          m.progress * 100
        );
      }
    },
  });

  return result.data.text;
}

// ---------------------------------------------------------------------------
// 5. Build Word document using `docx` library
// ---------------------------------------------------------------------------

function buildDocxParagraphs(
  pages: { lines: ExtractedLine[]; isOcr: boolean }[]
): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  for (let p = 0; p < pages.length; p++) {
    const { lines } = pages[p];

    // Add page break before pages after the first
    if (p > 0) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: "", break: 1 })],
          pageBreakBefore: true,
        })
      );
    }

    // If no lines at all, add an empty paragraph
    if (lines.length === 0) {
      paragraphs.push(new Paragraph({ children: [] }));
      continue;
    }

    for (const line of lines) {
      const role = detectRole(line);

      // Build TextRun with appropriate styling
      const runOptions: IRunOptions = {
        text: line.text,
        bold: line.bold || role !== "normal",
        italics: line.italic,
        size: Math.round(clamp(line.fontSize, 8, 36) * 2), // docx uses half-points
      };

      const textRun = new TextRun(runOptions);

      switch (role) {
        case "heading1":
          paragraphs.push(
            new Paragraph({
              children: [textRun],
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 240, after: 120 },
            })
          );
          break;
        case "heading2":
          paragraphs.push(
            new Paragraph({
              children: [textRun],
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 200, after: 100 },
            })
          );
          break;
        case "heading3":
          paragraphs.push(
            new Paragraph({
              children: [textRun],
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 160, after: 80 },
            })
          );
          break;
        default:
          paragraphs.push(
            new Paragraph({
              children: [textRun],
              spacing: { after: 80, line: 276 }, // 1.15x line spacing
            })
          );
          break;
      }
    }
  }

  return paragraphs;
}

async function generateDocx(
  paragraphs: Paragraph[],
  fileName: string
): Promise<Blob> {
  const doc = new Document({
    creator: "PdfCrux",
    title: fileName,
    description: `Converted from PDF by PdfCrux`,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch in twips
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  return Packer.toBlob(doc);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Convert a PDF file to a Word (DOCX) document.
 *
 * @param file        - The PDF file to convert.
 * @param options     - Conversion options (OCR, layout, language).
 * @param onProgress  - Optional progress callback `(status, percent)`.
 * @returns An object with the generated File and conversion statistics.
 */
export async function convertPdfToWord(
  file: File,
  options: {
    enableOcr: boolean;
    preserveLayout: boolean;
    language: string; // 'eng', 'hin', etc.
  },
  onProgress?: (status: string, percent: number) => void
): Promise<{ file: OutputFile; stats: ConversionStats }> {
  const startTime = Date.now();
  const baseName = file.name.replace(/\.[^/.]+$/, "");

  onProgress?.("Loading PDF document...", 5);

  // ── Step 1: Load PDF ──────────────────────────────────────────────
  const pdfDoc = await loadPdf(file, onProgress);
  const totalPages = pdfDoc.numPages;

  onProgress?.(`Extracting text from ${totalPages} pages...`, 10);

  // ── Step 2: Extract text page by page ─────────────────────────────
  const extractedPages: ExtractedPage[] = [];
  const ocrPageTexts: Map<number, string> = new Map();
  let ocrPageCount = 0;
  let totalCharacters = 0;
  let headingsDetected = 0;

  // Calculate the percentage range for text extraction (10% to 70%)
  const extractPercentBase = 10;
  const extractPercentEnd = 70;
  const extractPercentRange = extractPercentEnd - extractPercentBase;

  for (let i = 1; i <= totalPages; i++) {
    const pagePercent =
      extractPercentBase +
      (extractPercentRange * (i - 1)) / totalPages;
    onProgress?.(
      `Extracting text from page ${i} of ${totalPages}...`,
      pagePercent
    );

    const items = await extractPageItems(pdfDoc, i);
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });

    // Check if the page has very little text → likely scanned
    const pageTextLength = items.reduce((sum, it) => sum + it.text.length, 0);

    if (pageTextLength < 10 && options.enableOcr) {
      // OCR this page
      const ocrPercent =
        pagePercent + (extractPercentRange * 0.5) / totalPages;
      const ocrText = await runOcrOnPage(
        pdfDoc,
        i,
        options.language,
        (status, pct) => {
          onProgress?.(status, ocrPercent + (pct * 0.5) / totalPages);
        }
      );

      ocrPageTexts.set(i, ocrText);
      ocrPageCount++;
      totalCharacters += ocrText.length;

      // Build fake lines from OCR text (no positioning available)
      const ocrLines: ExtractedLine[] = ocrText
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l) => ({
          text: l.trim(),
          x: 72,
          y: 0,
          fontSize: 12,
          bold: false,
          italic: false,
          fontName: "",
          items: [],
        }));

      extractedPages.push({
        lines: ocrLines,
        width: viewport.width,
        height: viewport.height,
      });
    } else {
      // Normal text extraction with positioning
      const lines = groupItemsIntoLines(items);
      const charCount = lines.reduce((sum, l) => sum + l.text.length, 0);
      totalCharacters += charCount;

      // Count headings
      for (const line of lines) {
        if (detectRole(line) !== "normal") {
          headingsDetected++;
        }
      }

      extractedPages.push({
        lines,
        width: viewport.width,
        height: viewport.height,
      });
    }
  }

  // ── Step 3: Reconstruct layout & generate Word document ────────────
  onProgress?.("Reconstructing layout...", 72);

  const pagesForDoc = extractedPages.map((ep, idx) => ({
    lines: ep.lines,
    isOcr: ocrPageTexts.has(idx + 1),
  }));

  onProgress?.("Generating Word document...", 80);

  const paragraphs = buildDocxParagraphs(pagesForDoc);
  const docxBlob = await generateDocx(paragraphs, baseName);

  onProgress?.("Finalizing...", 95);

  // Create output File from Blob
  const outputFileName = `${baseName}.docx`;
  const outputFile = new File([docxBlob], outputFileName, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  const processingTime = Date.now() - startTime;

  const stats: ConversionStats = {
    totalPages,
    ocrPages: ocrPageCount,
    totalCharacters,
    headingsDetected,
    processingTimeMs: processingTime,
  };

  onProgress?.(
    `Done! Converted ${totalPages} pages (${formatBytes(docxBlob.size)}) in ${(processingTime / 1000).toFixed(1)}s`,
    100
  );

  return {
    file: {
      name: outputFileName,
      file: outputFile,
      size: docxBlob.size,
    },
    stats,
  };
}
