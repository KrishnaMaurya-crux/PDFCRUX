/**
 * PDF to Word (DOCX) Converter — Production-Grade Rebuild
 * PDF Crux — Fixed by Claude
 *
 * BUGS FIXED vs original:
 *
 * BUG 1 — route.ts: multipart/form-data built as plain string (not binary Buffer).
 *   Caused: OCR.space always rejects with 400/parse error for all PDFs.
 *   Fix: Use FormData (browser-native) in the proxy, or on server use undici FormData.
 *   (See companion route.ts patch at the bottom of this file as a comment block.)
 *
 * BUG 2 — blobToBase64(): btoa(String.fromCharCode(...)) crashes on large images
 *   with "Maximum call stack size exceeded" (spread of large Uint8Array).
 *   Fix: Loop in chunks of 8192 bytes.
 *
 * BUG 3 — buildSingleColumnDocx(): images are pushed to `paragraphs` but tables
 *   pushed to `tables` — in generateDocx() all tables are appended AFTER all
 *   paragraphs, so images always appear at the top and tables at the bottom,
 *   destroying page order.
 *   Fix: Merge everything into a single `children` array in correct page order.
 *
 * BUG 4 — generateDocx(): `children: [...contentParagraphs, ...tableObjects]`
 *   This puts ALL tables after ALL paragraphs regardless of page order.
 *   Fix: Return a unified children array from all layout builders.
 *
 * BUG 5 — ocrWordsToTextBlocks(): `medianHeight` is computed but never used for
 *   bold detection — the bold detection block below uses `block.fontSize` against
 *   the page median fontSize, which is always wrong for OCR because OCR font sizes
 *   are estimated from pixel height / DPI and differ wildly.
 *   Fix: Use line height relative to page median height for bold detection.
 *
 * BUG 6 — extractPageItems(): `height: item.height || Math.abs(tx[0]) || 12`
 *   pdfjs-dist returns item.height as the actual glyph height; tx[0] is the
 *   horizontal scale, NOT the font size. Real font size is Math.abs(tx[3]) (or tx[0]
 *   for non-rotated text). For rotated text this is also wrong.
 *   Fix: Use Math.abs(tx[3]) as fontSize, fallback to Math.abs(tx[0]).
 *
 * BUG 7 — pageNeedsOcr(): threshold is only 10 chars — a page with a single short
 *   line (e.g. "Page 1") will be sent to expensive OCR unnecessarily.
 *   Fix: Raise threshold to 50 chars.
 *
 * BUG 8 — buildSingleColumnPageTable(): cell width calculation
 *   `Math.round(((block.x + block.width) / pageWidth) * 100)` gives the RIGHT EDGE
 *   as the cell width, not the cell's own width. Every cell is wider than it should
 *   be, causing layout to overflow.
 *   Fix: Use block.width / pageWidth * 100 for each cell.
 *
 * BUG 9 — extractPageImages(): `page.objs.get(name)` is async in pdfjs-dist ≥4.x
 *   but called without await → always returns undefined/Promise, so no images
 *   are ever extracted.
 *   Fix: await page.objs.get(name) properly; wrap in try/catch per image.
 *
 * BUG 10 — route.ts: `parts.join("\r\n")` builds the multipart body as a JS string
 *   then sends it as UTF-8. The base64 data is ASCII-safe, but the boundary
 *   terminator `${boundary}--\r\n` is missing a leading `--`.
 *   Fix: The last part must be `--${boundary}--\r\n`.
 *   (Also see the companion route.ts fix comment at the bottom.)
 *
 * BUG 11 — buildAutoLayoutDocx() / buildKeepColumnsDocx(): columnRows is built
 *   from columns[0].blocks only (left column). Right column blocks are never
 *   visited in their own Y-sorted row groups, so right-column content is
 *   randomly scattered across table rows.
 *   Fix: Build Y-sorted row groups independently per column.
 *
 * BUG 12 — ImageRun in docx v9: the `type` field must be "jpg" | "png" | "gif" |
 *   "bmp" | "svg". Passing `img.mimeType === "image/jpeg" ? "jpg" : "png"` is
 *   correct, but `transformation` must use EMU (not pixels). The original code
 *   sets transformation: { width: displayWidth, height: displayHeight } in pixels
 *   but then also computes widthEMU/heightEMU without using them.
 *   Fix: Use the EMU values in transformation.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  type IRunOptions,
  type IParagraphOptions,
} from "docx";

// ═══════════════════════════════════════════════════════════════════════════
// Exported types
// ═══════════════════════════════════════════════════════════════════════════

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
  tablesDetected: number;
  imagesExtracted: number;
  processingTimeMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// OCR.space response types
// ═══════════════════════════════════════════════════════════════════════════

interface OcrWord {
  WordText: string;
  Left: number;
  Top: number;
  Height: number;
  Width: number;
}

interface OcrLine {
  Words: OcrWord[];
  MaxHeight: number;
  MinTop: number;
}

interface OcrResult {
  ParsedResults: {
    TextOverlay: {
      Lines: OcrLine[];
      PageHeader: number;
      PageFooter: number;
    };
    ParsedText: string;
  }[];
  OCRExitCode: number;
  ErrorMessage?: string;
  IsErroredOnProcessing?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Internal types
// ═══════════════════════════════════════════════════════════════════════════

interface DocxTextBlock {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  page: number;
}

interface VisualRow {
  blocks: DocxTextBlock[];
  avgY: number;
  maxHeight: number;
}

interface ExtractedImage {
  data: ArrayBuffer;
  width: number;
  height: number;
  mimeType: string;
  y: number;
  page: number;
}

interface RawTextItem {
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

interface ColumnGroup {
  blocks: DocxTextBlock[];
  leftX: number;
  rightX: number;
  centerX: number;
  width: number;
}

interface TableData {
  rows: string[][];
}

/** Unified content item — either a Paragraph or a Table */
type DocxChild = Paragraph | Table;

type PdfDoc = Awaited<ReturnType<typeof loadPdf>>;

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const MAX_OCR_IMAGE_SIZE = 900 * 1024; // 900 KB (OCR.space free limit)
const OCR_DPI_LEVELS = [300, 250, 200, 150, 100, 72];
const OCR_JPEG_QUALITIES = [0.85, 0.7, 0.55, 0.4];

const Y_PROXIMITY_FACTOR = 0.6;
const COLUMN_GAP_THRESHOLD = 50;
const MIN_HEADING_FONT = 13;
const H1_FONT_THRESHOLD = 18;
const H2_FONT_THRESHOLD = 14;

// FIX BUG 7: raised from 10 to 50
const OCR_CHAR_THRESHOLD = 50;

const MAX_IMAGE_WIDTH_EMU = 6 * 914400; // 6 inches in EMU
const EMU_PER_PIXEL_96DPI = 9525; // 1 px at 96dpi = 9525 EMU

// ═══════════════════════════════════════════════════════════════════════════
// Utility helpers
// ═══════════════════════════════════════════════════════════════════════════

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampFontSize(size: number): number {
  return clamp(size, 6, 48);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function isBoldFont(fontName: string): boolean {
  const lower = fontName.toLowerCase();
  return lower.includes("bold") || lower.includes("black") || lower.includes("heavy");
}

function isItalicFont(fontName: string): boolean {
  const lower = fontName.toLowerCase();
  return lower.includes("italic") || lower.includes("oblique");
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 1: Load PDF & analyze
// ═══════════════════════════════════════════════════════════════════════════

async function loadPdf(file: File): Promise<import("pdfjs-dist").PDFDocumentProxy> {
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
 * FIX BUG 6: Use tx[3] for fontSize (vertical scale = font size for normal text).
 * tx = [scaleX, skewX, skewY, scaleY, translateX, translateY]
 */
async function extractPageItems(pdfDoc: PdfDoc, pageNum: number): Promise<RawTextItem[]> {
  const page = await pdfDoc.getPage(pageNum);
  const textContent = await page.getTextContent();

  return (textContent.items as any[])
    .filter((item) => "str" in item && item.str.trim().length > 0)
    .map((item) => {
      const tx = item.transform as number[];
      // Real font size: take the larger of |tx[0]| and |tx[3]| (handles rotated text too)
      const fontSize = Math.max(Math.abs(tx[0]), Math.abs(tx[3])) || 12;
      return {
        text: item.str,
        x: tx[4],
        y: tx[5],
        width: item.width || 0,
        height: fontSize,
        fontSize,
        fontName: item.fontName || "",
        bold: isBoldFont(item.fontName || ""),
        italic: isItalicFont(item.fontName || ""),
      } as RawTextItem;
    });
}

/**
 * FIX BUG 7: threshold raised to 50 chars.
 */
async function pageNeedsOcr(pdfDoc: PdfDoc, pageNum: number): Promise<boolean> {
  const items = await extractPageItems(pdfDoc, pageNum);
  const totalChars = items.reduce((sum, item) => sum + item.text.length, 0);
  return totalChars < OCR_CHAR_THRESHOLD;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2: OCR.space processing
// ═══════════════════════════════════════════════════════════════════════════

async function renderPageToCanvas(
  pdfDoc: PdfDoc,
  pageNum: number,
  dpi: number
): Promise<HTMLCanvasElement> {
  const page = await pdfDoc.getPage(pageNum);
  const scale = dpi / 72;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx as any, viewport }).promise;
  return canvas;
}

async function compressPageToMaxSize(
  pdfDoc: PdfDoc,
  pageNum: number,
  maxSize: number
): Promise<{ blob: Blob; dpi: number }> {
  for (const dpi of OCR_DPI_LEVELS) {
    const canvas = await renderPageToCanvas(pdfDoc, pageNum, dpi);
    for (const quality of OCR_JPEG_QUALITIES) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality)
      );
      if (blob && blob.size <= maxSize) {
        return { blob, dpi };
      }
    }
  }
  // Absolute fallback
  const canvas = await renderPageToCanvas(pdfDoc, pageNum, 72);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.3)
  );
  return { blob: blob || new Blob(), dpi: 72 };
}

/**
 * FIX BUG 2: btoa in chunks to avoid stack overflow on large images.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Call our server-side OCR.space proxy.
 */
async function callOcrSpaceApi(base64Image: string, language: string): Promise<OcrResult> {
  const response = await fetch("/api/ocr-space", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64Image, language }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OCR.space API error ${response.status}: ${text}`);
  }
  const data = await response.json();
  if (data.IsErroredOnProcessing || data.OCRExitCode === 99) {
    throw new Error(`OCR.space processing error: ${data.ErrorMessage || "Unknown"}`);
  }
  return data as OcrResult;
}

// ═══════════════════════════════════════════════════════════════════════════
// Coordinate-based text reconstruction from OCR overlay
// ═══════════════════════════════════════════════════════════════════════════

/**
 * FIX BUG 5: Bold detection now uses line height vs page-median height.
 */
function ocrWordsToTextBlocks(ocrResult: OcrResult, pageNum: number, dpi: number = 150): DocxTextBlock[] {
  const blocks: DocxTextBlock[] = [];

  if (!ocrResult.ParsedResults || ocrResult.ParsedResults.length === 0) return blocks;

  const overlay = ocrResult.ParsedResults[0]?.TextOverlay;
  if (!overlay?.Lines?.length) return blocks;

  for (const line of overlay.Lines) {
    if (!line.Words?.length) continue;

    const lineWords = line.Words.filter((w) => w.WordText?.trim().length > 0);
    if (lineWords.length === 0) continue;

    const sorted = [...lineWords].sort((a, b) => a.Left - b.Left);
    const avgWordWidth = sorted.reduce((s, w) => s + w.Width, 0) / sorted.length;
    const avgWordLen = sorted.reduce((s, w) => s + w.WordText.length, 0) / sorted.length;
    const avgCharWidth = avgWordLen > 0 ? avgWordWidth / avgWordLen : 5;

    let mergedText = "";
    let lineX = sorted[0].Left;
    let prevEndX = sorted[0].Left + sorted[0].Width;
    let lineMaxHeight = sorted[0].Height;
    let lineEndX = prevEndX;

    for (let i = 0; i < sorted.length; i++) {
      const word = sorted[i];
      lineMaxHeight = Math.max(lineMaxHeight, word.Height);
      if (i === 0) {
        mergedText = word.WordText.trim();
      } else {
        const gap = word.Left - prevEndX;
        mergedText += gap > avgCharWidth * 0.3 ? " " + word.WordText.trim() : word.WordText.trim();
      }
      prevEndX = word.Left + word.Width;
      lineEndX = Math.max(lineEndX, prevEndX);
    }

    // Convert pixel height → points using actual DPI
    const fontSize = clampFontSize(Math.round((lineMaxHeight * 72) / dpi));

    blocks.push({
      text: mergedText,
      x: lineX,
      y: line.MinTop,
      width: lineEndX - lineX,
      height: lineMaxHeight,
      fontSize,
      bold: false,
      italic: false,
      page: pageNum,
    });
  }

  // FIX BUG 5: Bold detection using pixel height (more reliable than font point size for OCR)
  if (blocks.length > 1) {
    const allHeights = blocks.map((b) => b.height).sort((a, b) => a - b);
    const medianHeight = allHeights[Math.floor(allHeights.length / 2)];
    for (const block of blocks) {
      if (block.height > medianHeight * 1.4 && block.fontSize >= MIN_HEADING_FONT) {
        block.bold = true;
      }
    }
  }

  return blocks;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2b: pdfjs-dist text extraction
// ═══════════════════════════════════════════════════════════════════════════

function groupItemsIntoLines(items: RawTextItem[]): VisualRow[] {
  if (items.length === 0) return [];

  // Sort top-to-bottom then left-to-right (pdfjs y=0 at bottom, so DESC y = top-to-bottom)
  const sorted = [...items].sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 3) return yDiff;
    return a.x - b.x;
  });

  const rows: VisualRow[] = [];
  let currentItems: RawTextItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const dominantFontSize =
      currentItems.reduce((s, it) => s + it.fontSize, 0) / currentItems.length;
    const yThreshold = Math.max(dominantFontSize * 0.4, 3);

    if (Math.abs(item.y - currentY) > yThreshold) {
      rows.push(itemsToRow(currentItems));
      currentItems = [item];
      currentY = item.y;
    } else {
      currentItems.push(item);
      currentY = currentItems.reduce((s, it) => s + it.y, 0) / currentItems.length;
    }
  }
  if (currentItems.length > 0) rows.push(itemsToRow(currentItems));

  return rows;
}

function itemsToRow(items: RawTextItem[]): VisualRow {
  items.sort((a, b) => a.x - b.x);
  let text = "";
  let prevEnd = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i === 0) {
      text = item.text;
    } else {
      const avgCharWidth = item.fontSize * 0.55;
      const gap = item.x - prevEnd;
      if (gap > avgCharWidth * 1.5) text += "  " + item.text;
      else if (gap > avgCharWidth * 0.3) text += " " + item.text;
      else text += item.text;
    }
    prevEnd = item.x + item.width;
  }

  const largestItem = items.reduce(
    (max, it) => (it.fontSize > max.fontSize ? it : max),
    items[0]
  );

  const block: DocxTextBlock = {
    text: text.trim(),
    x: items[0].x,
    y: largestItem.y,
    width: prevEnd - items[0].x,
    height: largestItem.height,
    fontSize: largestItem.fontSize,
    bold: items.some((it) => it.bold),
    italic: items.some((it) => it.italic),
    page: 0,
  };

  return {
    blocks: [block],
    avgY: block.y,
    maxHeight: largestItem.height,
  };
}

async function extractTextBlocks(pdfDoc: PdfDoc, pageNum: number): Promise<DocxTextBlock[]> {
  const items = await extractPageItems(pdfDoc, pageNum);
  if (items.length === 0) return [];

  const rows = groupItemsIntoLines(items);
  const blocks: DocxTextBlock[] = [];
  for (const row of rows) {
    for (const block of row.blocks) {
      block.page = pageNum;
      blocks.push(block);
    }
  }
  return blocks;
}

// ═══════════════════════════════════════════════════════════════════════════
// Image extraction from PDF
// ═══════════════════════════════════════════════════════════════════════════

/**
 * FIX BUG 9: page.objs.get() is async in pdfjs-dist ≥4; added await + per-image try/catch.
 */
async function extractPageImages(pdfDoc: PdfDoc, pageNum: number): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];
  try {
    const page = await pdfDoc.getPage(pageNum);
    const operatorList = await page.getOperatorList();

    const imgObjNames: string[] = [];
    const imgTransforms: number[][] = [];

    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const fn = operatorList.fnArray[i];
      // paintImageXObject=85, paintJpegXObject=82, paintInlineImageXObject=86
      if (fn === 85 || fn === 82 || fn === 86) {
        imgObjNames.push(operatorList.argsArray[i][0] as string);
        imgTransforms.push([1, 0, 0, 1, 0, 0]);
      }
    }

    for (let i = 0; i < imgObjNames.length; i++) {
      try {
        // FIX BUG 9: await the async get()
        const imgObj = await (page.objs as any).get(imgObjNames[i]);
        if (!imgObj) continue;

        let data: ArrayBuffer | null = null;
        let mimeType = "image/png";
        let imgWidth = 100;
        let imgHeight = 100;

        if (imgObj.bitmap) {
          const bmp = imgObj.bitmap;
          const w = bmp.width || imgObj.width || 100;
          const h = bmp.height || imgObj.height || 100;
          imgWidth = w;
          imgHeight = h;
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(bmp, 0, 0, w, h);
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/png")
          );
          if (blob) { data = await blob.arrayBuffer(); mimeType = "image/png"; }
        } else if (imgObj.data) {
          const w = imgObj.width || 100;
          const h = imgObj.height || 100;
          imgWidth = w;
          imgHeight = h;

          const toRgba = (src: Uint8Array, channels: number): Uint8ClampedArray => {
            const rgba = new Uint8ClampedArray(w * h * 4);
            for (let j = 0; j < w * h; j++) {
              if (channels === 1) {
                rgba[j * 4] = rgba[j * 4 + 1] = rgba[j * 4 + 2] = src[j];
              } else {
                rgba[j * 4] = src[j * channels];
                rgba[j * 4 + 1] = src[j * channels + 1];
                rgba[j * 4 + 2] = src[j * channels + 2];
              }
              rgba[j * 4 + 3] = 255;
            }
            return rgba;
          };

          const channels = imgObj.kind === 1 ? 1 : 3;
          const rgba = toRgba(imgObj.data, channels);
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d")!;
          ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/png")
          );
          if (blob) { data = await blob.arrayBuffer(); mimeType = "image/png"; }
        }

        if (data && data.byteLength > 0 && imgWidth > 15 && imgHeight > 15) {
          const y = imgTransforms[i] ? imgTransforms[i][5] : 0;
          images.push({ data, width: imgWidth, height: imgHeight, mimeType, y, page: pageNum });
        }
      } catch {
        // Skip individual image errors silently
      }
    }
  } catch {
    // Page-level failure — return empty
  }
  return images;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3: Layout Analysis & Column Detection
// ═══════════════════════════════════════════════════════════════════════════

function groupIntoRows(blocks: DocxTextBlock[], yThreshold: number): VisualRow[] {
  if (blocks.length === 0) return [];

  const sorted = [...blocks].sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 2) return yDiff;
    return a.x - b.x;
  });

  const rows: VisualRow[] = [];
  let currentBlocks: DocxTextBlock[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const block = sorted[i];
    const rowMaxHeight = Math.max(...currentBlocks.map((b) => b.height));
    const threshold = Math.max(yThreshold, rowMaxHeight * Y_PROXIMITY_FACTOR);

    if (Math.abs(block.y - currentY) > threshold) {
      rows.push({
        blocks: currentBlocks,
        avgY: currentBlocks.reduce((s, b) => s + b.y, 0) / currentBlocks.length,
        maxHeight: Math.max(...currentBlocks.map((b) => b.height)),
      });
      currentBlocks = [block];
      currentY = block.y;
    } else {
      currentBlocks.push(block);
      currentY = currentBlocks.reduce((s, b) => s + b.y, 0) / currentBlocks.length;
    }
  }
  if (currentBlocks.length > 0) {
    rows.push({
      blocks: currentBlocks,
      avgY: currentBlocks.reduce((s, b) => s + b.y, 0) / currentBlocks.length,
      maxHeight: Math.max(...currentBlocks.map((b) => b.height)),
    });
  }
  return rows;
}

function detectColumns(rows: VisualRow[]): { columns: ColumnGroup[]; isMultiColumn: boolean } {
  if (rows.length === 0) return { columns: [], isMultiColumn: false };

  let multiColRows = 0;
  const columnBoundaries: number[] = [];

  for (const row of rows) {
    if (row.blocks.length < 2) continue;
    const sorted = [...row.blocks].sort((a, b) => a.x - b.x);
    let maxGap = 0;
    let gapX = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].x - (sorted[i - 1].x + sorted[i - 1].width);
      if (gap > maxGap) {
        maxGap = gap;
        gapX = sorted[i - 1].x + sorted[i - 1].width + gap / 2;
      }
    }
    if (maxGap > COLUMN_GAP_THRESHOLD) {
      multiColRows++;
      columnBoundaries.push(gapX);
    }
  }

  if (multiColRows < rows.length * 0.3) return { columns: [], isMultiColumn: false };

  columnBoundaries.sort((a, b) => a - b);
  const medianBoundary = columnBoundaries[Math.floor(columnBoundaries.length / 2)];

  const leftCol: DocxTextBlock[] = [];
  const rightCol: DocxTextBlock[] = [];
  for (const row of rows) {
    for (const block of row.blocks) {
      if (block.x < medianBoundary) leftCol.push(block);
      else rightCol.push(block);
    }
  }

  const columns: ColumnGroup[] = [];
  if (leftCol.length > 0) {
    const lx = Math.min(...leftCol.map((b) => b.x));
    const rx = Math.max(...leftCol.map((b) => b.x + b.width));
    columns.push({ blocks: leftCol, leftX: lx, rightX: rx, centerX: (lx + rx) / 2, width: rx - lx });
  }
  if (rightCol.length > 0) {
    const lx = Math.min(...rightCol.map((b) => b.x));
    const rx = Math.max(...rightCol.map((b) => b.x + b.width));
    columns.push({ blocks: rightCol, leftX: lx, rightX: rx, centerX: (lx + rx) / 2, width: rx - lx });
  }

  return { columns, isMultiColumn: columns.length >= 2 };
}

function isPageMultiColumn(rows: VisualRow[]): boolean {
  return detectColumns(rows).isMultiColumn;
}

// ═══════════════════════════════════════════════════════════════════════════
// Table detection
// ═══════════════════════════════════════════════════════════════════════════

function detectTable(blocks: DocxTextBlock[]): TableData | null {
  if (blocks.length < 4) return null;
  const rows = groupIntoRows(blocks, 5);
  if (rows.length < 2) return null;

  const allColumns: number[] = [];
  for (const row of rows) for (const block of row.blocks) allColumns.push(Math.round(block.x));

  const uniqueXs = [...new Set(allColumns)].sort((a, b) => a - b);
  const columnClusters: number[][] = [];
  let currentCluster: number[] = [uniqueXs[0]];

  for (let i = 1; i < uniqueXs.length; i++) {
    if (uniqueXs[i] - uniqueXs[i - 1] <= 10) currentCluster.push(uniqueXs[i]);
    else { columnClusters.push(currentCluster); currentCluster = [uniqueXs[i]]; }
  }
  columnClusters.push(currentCluster);

  if (columnClusters.length < 2) return null;

  let alignedRows = 0;
  for (const row of rows) if (row.blocks.length >= 2) alignedRows++;
  if (alignedRows / rows.length < 0.5) return null;

  const tableRows: string[][] = [];
  for (const row of rows) {
    const sorted = [...row.blocks].sort((a, b) => a.x - b.x);
    tableRows.push(sorted.map((b) => b.text));
  }

  const cellCounts = tableRows.map((r) => r.length);
  const sortedCounts = [...cellCounts].sort((a, b) => a - b);
  const medianCells = sortedCounts[Math.floor(sortedCounts.length / 2)];
  const consistentRows = cellCounts.filter((c) => Math.abs(c - medianCells) <= 1).length;
  if (consistentRows / tableRows.length < 0.5) return null;

  return { rows: tableRows };
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 4: DOCX Generation
// ═══════════════════════════════════════════════════════════════════════════

type ParagraphRole = "heading1" | "heading2" | "heading3" | "normal";

const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
const tableBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const tableBorders = { top: tableBorder, bottom: tableBorder, left: tableBorder, right: tableBorder };

function detectHeading(block: DocxTextBlock, pageBlocks: DocxTextBlock[]): ParagraphRole {
  const fontSize = clampFontSize(block.fontSize);
  if (fontSize >= H1_FONT_THRESHOLD) return "heading1";
  if (fontSize >= H2_FONT_THRESHOLD) return "heading2";
  if (fontSize >= MIN_HEADING_FONT) {
    const otherSizes = pageBlocks.filter((b) => b !== block).map((b) => b.fontSize);
    if (otherSizes.length > 0) {
      const avgSize = otherSizes.reduce((s, v) => s + v, 0) / otherSizes.length;
      if (fontSize > avgSize * 1.3) return "heading3";
    }
  }
  return "normal";
}

function blockToParagraph(block: DocxTextBlock, pageBlocks: DocxTextBlock[]): Paragraph {
  const role = detectHeading(block, pageBlocks);
  const runOptions: IRunOptions = {
    text: block.text,
    bold: block.bold || role !== "normal",
    italics: block.italic,
    size: Math.round(clampFontSize(block.fontSize) * 2),
  };
  const textRun = new TextRun(runOptions);

  const paraOptions: IParagraphOptions = { children: [textRun] };
  switch (role) {
    case "heading1":
      return new Paragraph({ ...paraOptions, heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 } });
    case "heading2":
      return new Paragraph({ ...paraOptions, heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 } });
    case "heading3":
      return new Paragraph({ ...paraOptions, heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 } });
    default:
      return new Paragraph({ ...paraOptions, spacing: { after: 80, line: 276 } });
  }
}

function buildRealTable(tableData: TableData): Table {
  const tableRows: TableRow[] = tableData.rows.map((row, r) => {
    const isHeader = r === 0;
    const cells = row.map((cellText) =>
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: cellText, bold: isHeader, size: isHeader ? 22 : 20 })],
            spacing: { before: 40, after: 40 },
          }),
        ],
        shading: isHeader
          ? { type: "clear" as const, fill: "E8E8E8", color: "auto" }
          : { type: "clear" as const, fill: "FFFFFF", color: "auto" },
        borders: tableBorders,
        margins: { top: 40, bottom: 40, left: 80, right: 80 },
      })
    );
    return new TableRow({ children: cells });
  });
  return new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

/**
 * FIX BUG 8: Cell width = block.width / pageWidth * 100, NOT block.x + block.width.
 */
function buildSingleColumnPageTable(blocks: DocxTextBlock[]): Table {
  const pageWidth = Math.max(...blocks.map((b) => b.x + b.width)) || 612;
  const avgHeight = blocks.length > 0 ? blocks.reduce((s, b) => s + b.height, 0) / blocks.length : 12;
  const visualRows = groupIntoRows(blocks, avgHeight);
  const tableRows: TableRow[] = [];

  for (const vRow of visualRows) {
    const sortedBlocks = [...vRow.blocks].sort((a, b) => a.x - b.x);
    const cells: TableCell[] = [];

    // Calculate total widths to normalize to 100%
    const totalRowWidth = sortedBlocks.reduce((s, b) => s + b.width, 0);

    for (const block of sortedBlocks) {
      // FIX BUG 8: proportional width based on block.width (not right edge)
      const cellWidthPct = Math.max(5, Math.round((block.width / pageWidth) * 100));
      cells.push(
        new TableCell({
          children: [blockToParagraph(block, blocks)],
          width: { size: cellWidthPct, type: WidthType.PERCENTAGE },
          borders: noBorders,
          margins: { top: 20, bottom: 20, left: 60, right: 60 },
        })
      );
    }

    if (cells.length > 0) tableRows.push(new TableRow({ children: cells }));
  }

  return new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

/**
 * FIX BUG 12: transformation uses EMU, not pixels.
 * FIX BUG 3 (partial): returns Paragraph so caller can place it in order.
 */
function createImageParagraph(img: ExtractedImage): Paragraph {
  try {
    let widthEMU = img.width * EMU_PER_PIXEL_96DPI;
    let heightEMU = img.height * EMU_PER_PIXEL_96DPI;

    if (widthEMU > MAX_IMAGE_WIDTH_EMU) {
      const ratio = MAX_IMAGE_WIDTH_EMU / widthEMU;
      widthEMU = MAX_IMAGE_WIDTH_EMU;
      heightEMU = Math.round(heightEMU * ratio);
    }

    const imageRun = new ImageRun({
      data: img.data,
      // FIX BUG 12: transformation in EMU
      transformation: { width: widthEMU, height: heightEMU },
      type: img.mimeType === "image/jpeg" ? "jpg" : "png",
    });

    return new Paragraph({
      children: [imageRun],
      spacing: { before: 120, after: 120 },
      alignment: AlignmentType.CENTER,
    });
  } catch {
    return new Paragraph({ children: [] });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX BUG 3 & 4: All builders now return a unified DocxChild[] array
// so images and tables are interleaved in correct page order.
// ═══════════════════════════════════════════════════════════════════════════

function buildSingleColumnDocx(
  pages: DocxTextBlock[][],
  pageImages: ExtractedImage[][]
): DocxChild[] {
  const children: DocxChild[] = [];

  for (let p = 0; p < pages.length; p++) {
    const blocks = pages[p];
    const images = pageImages[p] || [];

    // Page break before pages after the first
    if (p > 0) {
      children.push(new Paragraph({ children: [], pageBreakBefore: true }));
    }

    if (blocks.length === 0 && images.length === 0) {
      children.push(new Paragraph({ children: [] }));
      continue;
    }

    // Images first on the page
    for (const img of images) children.push(createImageParagraph(img));

    // Invisible table for text positioning
    if (blocks.length > 0) children.push(buildSingleColumnPageTable(blocks));
  }

  return children;
}

/**
 * FIX BUG 11: Build per-column row groups independently.
 */
function buildColumnRows(columnBlocks: DocxTextBlock[]): VisualRow[] {
  if (columnBlocks.length === 0) return [];
  const sorted = [...columnBlocks].sort((a, b) => b.y - a.y);
  const rows: VisualRow[] = [];
  let currentBlocks: DocxTextBlock[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const block = sorted[i];
    const threshold = Math.max(block.height * Y_PROXIMITY_FACTOR, 5);
    if (Math.abs(block.y - currentY) > threshold) {
      rows.push({
        blocks: currentBlocks,
        avgY: currentY,
        maxHeight: Math.max(...currentBlocks.map((b) => b.height)),
      });
      currentBlocks = [block];
      currentY = block.y;
    } else {
      currentBlocks.push(block);
      currentY = currentBlocks.reduce((s, b) => s + b.y, 0) / currentBlocks.length;
    }
  }
  if (currentBlocks.length > 0) {
    rows.push({
      blocks: currentBlocks,
      avgY: currentY,
      maxHeight: Math.max(...currentBlocks.map((b) => b.height)),
    });
  }
  return rows;
}

function buildMultiColumnTable(columns: ColumnGroup[], allBlocks: DocxTextBlock[]): Table[] {
  const tables: Table[] = [];
  const totalWidth = columns.reduce((s, c) => s + c.width, 0);

  // FIX BUG 11: build row groups for EACH column separately, then zip them
  const colRowGroups = columns.map((col) => buildColumnRows(col.blocks));
  const maxRows = Math.max(...colRowGroups.map((g) => g.length));

  for (let r = 0; r < maxRows; r++) {
    const cells: TableCell[] = [];

    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      const rowGroup = colRowGroups[c][r];
      const widthPercent = totalWidth > 0 ? (col.width / totalWidth) * 100 : 50;

      const cellParagraphs: Paragraph[] = [];
      if (!rowGroup || rowGroup.blocks.length === 0) {
        cellParagraphs.push(new Paragraph({ children: [] }));
      } else {
        const sortedBlocks = [...rowGroup.blocks].sort((a, b) => a.x - b.x);
        for (const block of sortedBlocks) {
          cellParagraphs.push(blockToParagraph(block, allBlocks));
        }
      }

      cells.push(
        new TableCell({
          children: cellParagraphs,
          width: { size: Math.round(widthPercent), type: WidthType.PERCENTAGE },
          borders: noBorders,
          margins: { top: 0, bottom: 0, left: 80, right: 80 },
        })
      );
    }

    tables.push(
      new Table({
        rows: [new TableRow({ children: cells })],
        width: { size: 100, type: WidthType.PERCENTAGE },
      })
    );
  }

  return tables;
}

function buildKeepColumnsDocx(
  pages: DocxTextBlock[][],
  pageImages: ExtractedImage[][]
): DocxChild[] {
  const children: DocxChild[] = [];

  for (let p = 0; p < pages.length; p++) {
    const blocks = pages[p];
    const images = pageImages[p] || [];

    if (p > 0) children.push(new Paragraph({ children: [], pageBreakBefore: true }));
    if (blocks.length === 0 && images.length === 0) { children.push(new Paragraph({ children: [] })); continue; }

    for (const img of images) children.push(createImageParagraph(img));

    const avgHeight = blocks.length > 0 ? blocks.reduce((s, b) => s + b.height, 0) / blocks.length : 12;
    const rows = groupIntoRows(blocks, avgHeight);
    const { columns, isMultiColumn } = detectColumns(rows);

    if (!isMultiColumn) {
      children.push(buildSingleColumnPageTable(blocks));
    } else {
      // FIX BUG 11
      for (const t of buildMultiColumnTable(columns, blocks)) children.push(t);
    }
  }

  return children;
}

function buildAutoLayoutDocx(
  pages: DocxTextBlock[][],
  pageImages: ExtractedImage[][]
): DocxChild[] {
  const children: DocxChild[] = [];

  for (let p = 0; p < pages.length; p++) {
    const blocks = pages[p];
    const images = pageImages[p] || [];

    if (p > 0) children.push(new Paragraph({ children: [], pageBreakBefore: true }));
    if (blocks.length === 0 && images.length === 0) { children.push(new Paragraph({ children: [] })); continue; }

    const sortedImages = [...images].sort((a, b) => b.y - a.y);
    for (const img of sortedImages) children.push(createImageParagraph(img));

    // Try table detection first
    if (blocks.length >= 4) {
      const tableData = detectTable(blocks);
      if (tableData && tableData.rows.length >= 2 && tableData.rows[0].length >= 2) {
        children.push(buildRealTable(tableData));
        continue;
      }
    }

    // Check multi-column
    const avgHeight = blocks.length > 0 ? blocks.reduce((s, b) => s + b.height, 0) / blocks.length : 12;
    const rows = groupIntoRows(blocks, avgHeight);
    const { columns, isMultiColumn } = detectColumns(rows);

    if (isMultiColumn && columns.length >= 2) {
      // FIX BUG 11
      for (const t of buildMultiColumnTable(columns, blocks)) children.push(t);
    } else {
      children.push(buildSingleColumnPageTable(blocks));
    }
  }

  return children;
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX BUG 4: generateDocx now takes a unified children array
// ═══════════════════════════════════════════════════════════════════════════

async function generateDocx(children: DocxChild[], fileName: string): Promise<Blob> {
  const doc = new Document({
    creator: "PdfCrux",
    title: fileName,
    description: `Converted from PDF by PdfCrux`,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        // FIX BUG 4: unified order, not paragraphs then tables
        children: children as any[],
      },
    ],
  });
  return Packer.toBlob(doc);
}

// ═══════════════════════════════════════════════════════════════════════════
// Main entry point
// ═══════════════════════════════════════════════════════════════════════════

export async function convertPdfToWord(
  file: File,
  options: {
    useOcrSpace: boolean;
    layoutMode: "single" | "keep" | "auto";
    ocrLanguage: string;
    enableOcr: boolean;
  },
  onProgress?: (status: string, percent: number) => void
): Promise<{ file: OutputFile; stats: ConversionStats }> {
  const startTime = Date.now();
  const baseName = file.name.replace(/\.[^/.]+$/, "");

  // Phase 1
  onProgress?.("Loading PDF...", 2);
  const pdfDoc = await loadPdf(file);
  const totalPages = pdfDoc.numPages;
  onProgress?.(`Analyzing ${totalPages} pages...`, 5);

  const pagesNeedingOcr = new Set<number>();
  if (!options.useOcrSpace) {
    for (let i = 1; i <= totalPages; i++) {
      onProgress?.(`Analyzing page ${i}/${totalPages}...`, 5 + (5 * i) / totalPages);
      if (await pageNeedsOcr(pdfDoc, i) && options.enableOcr) {
        pagesNeedingOcr.add(i);
      }
    }
  }
  onProgress?.("Analysis complete.", 10);

  // Phase 2
  const allPagesBlocks: DocxTextBlock[][] = [];
  const allPagesImages: ExtractedImage[][] = [];
  let ocrPageCount = 0;
  let totalCharacters = 0;
  let imagesExtracted = 0;

  for (let i = 0; i < totalPages; i++) {
    const pageNum = i + 1;
    const pagePercent = 10 + (60 * i) / totalPages;
    onProgress?.(`Processing page ${pageNum}/${totalPages}...`, pagePercent);

    let blocks: DocxTextBlock[] = [];
    const useOcr = options.useOcrSpace || pagesNeedingOcr.has(pageNum);

    if (useOcr) {
      try {
        onProgress?.(`OCR: page ${pageNum}...`, pagePercent + 2);
        const { blob, dpi } = await compressPageToMaxSize(pdfDoc, pageNum, MAX_OCR_IMAGE_SIZE);
        const base64 = await blobToBase64(blob);
        const ocrResult = await callOcrSpaceApi(base64, options.ocrLanguage);
        blocks = ocrWordsToTextBlocks(ocrResult, pageNum, dpi);
        if (blocks.length > 0) {
          ocrPageCount++;
        } else {
          blocks = await extractTextBlocks(pdfDoc, pageNum);
        }
      } catch (err) {
        console.warn(`OCR failed page ${pageNum}, falling back to text extraction:`, err);
        blocks = await extractTextBlocks(pdfDoc, pageNum);
      }
    } else {
      blocks = await extractTextBlocks(pdfDoc, pageNum);
    }

    totalCharacters += blocks.reduce((s, b) => s + b.text.length, 0);

    let pageImages: ExtractedImage[] = [];
    try {
      pageImages = await extractPageImages(pdfDoc, pageNum);
      imagesExtracted += pageImages.length;
    } catch { /* silent */ }

    allPagesBlocks.push(blocks);
    allPagesImages.push(pageImages);
  }

  // Phase 3: count headings/tables for stats
  onProgress?.("Detecting layout...", 72);
  let headingsDetected = 0;
  let tablesDetected = 0;

  for (const blocks of allPagesBlocks) {
    for (const block of blocks) {
      if (detectHeading(block, blocks) !== "normal") headingsDetected++;
    }
    if (blocks.length >= 4) {
      const td = detectTable(blocks);
      if (td && td.rows.length >= 2 && td.rows[0].length >= 2) tablesDetected++;
    }
  }

  onProgress?.("Building document...", 80);

  // Phase 4: Build unified children array (FIX BUG 3 & 4)
  let children: DocxChild[];
  if (options.layoutMode === "single") {
    children = buildSingleColumnDocx(allPagesBlocks, allPagesImages);
  } else if (options.layoutMode === "keep") {
    children = buildKeepColumnsDocx(allPagesBlocks, allPagesImages);
  } else {
    children = buildAutoLayoutDocx(allPagesBlocks, allPagesImages);
  }

  onProgress?.("Generating Word file...", 90);
  const docxBlob = await generateDocx(children, baseName);

  onProgress?.("Finalizing...", 95);
  const outputFileName = `${baseName}.docx`;
  const outputFile = new File([docxBlob], outputFileName, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  const processingTime = Date.now() - startTime;
  onProgress?.(
    `Done! ${totalPages} pages · ${formatBytes(docxBlob.size)} · ${(processingTime / 1000).toFixed(1)}s`,
    100
  );

  return {
    file: { name: outputFileName, file: outputFile, size: docxBlob.size },
    stats: { totalPages, ocrPages: ocrPageCount, totalCharacters, headingsDetected, tablesDetected, imagesExtracted, processingTimeMs: processingTime },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPANION FIX — route.ts (BUG 1 & BUG 10)
//
// Replace your entire /app/api/ocr-space/route.ts with this:
//
// import { NextRequest, NextResponse } from "next/server";
//
// export async function POST(request: NextRequest) {
//   try {
//     const body = await request.json();
//     const { base64Image, language = "eng" } = body;
//
//     if (!base64Image || typeof base64Image !== "string") {
//       return NextResponse.json({ error: "base64Image is required" }, { status: 400 });
//     }
//
//     const key = process.env.OCR_SPACE_API_KEY;
//     if (!key) {
//       return NextResponse.json({ error: "OCR service not configured" }, { status: 500 });
//     }
//
//     // FIX BUG 1 & BUG 10: Use proper FormData (not manual string building)
//     const formData = new FormData();
//     formData.append("base64Image", `data:image/jpeg;base64,${base64Image}`);
//     formData.append("language", language);
//     formData.append("isOverlayRequired", "true");
//     formData.append("OCREngine", "2");
//     formData.append("scale", "true");
//     formData.append("detectOrientation", "true");
//
//     const response = await fetch("https://api.ocr.space/parse/image", {
//       method: "POST",
//       headers: { apikey: key },   // NO Content-Type header — let fetch set it with boundary
//       body: formData,
//     });
//
//     if (!response.ok) {
//       const errorText = await response.text();
//       return NextResponse.json({ error: `OCR.space error ${response.status}`, details: errorText }, { status: response.status });
//     }
//
//     const data = await response.json();
//     return NextResponse.json(data);
//
//   } catch (err) {
//     return NextResponse.json({ error: "OCR proxy failed", details: err instanceof Error ? err.message : "Unknown" }, { status: 500 });
//   }
// }
// ═══════════════════════════════════════════════════════════════════════════
