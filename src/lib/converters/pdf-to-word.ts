/**
 * PDF to Word (DOCX) Converter — Professional Reconstruction Engine
 *
 * High-fidelity converter that transforms PDFs into properly structured DOCX documents.
 *
 * Architecture:
 *   Phase 1: Load & Analyze PDF (0-10%)
 *   Phase 2: Page-by-page text extraction / OCR (10-70%)
 *   Phase 3: Layout analysis, column detection, table detection, image extraction (70-80%)
 *   Phase 4: DOCX generation with headings, tables, columns, images (80-95%)
 *   Phase 5: Finalize (95-100%)
 *
 * Modes:
 *   - useOcrSpace=true  → ALL pages go through OCR.space API (page-by-page, bypasses 3-page limit)
 *   - useOcrSpace=false → pdfjs-dist text extraction, with OCR fallback for scanned pages
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
  type IRunOptions,
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

/** A text block with spatial metadata extracted from a PDF page. */
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

/** A group of blocks forming a visual row at approximately the same Y. */
interface VisualRow {
  blocks: DocxTextBlock[];
  avgY: number;
  maxHeight: number;
}

/** An extracted image from a PDF page. */
interface ExtractedImage {
  data: ArrayBuffer;
  width: number;
  height: number;
  mimeType: string;
  y: number; // Y position on the page (PDF coords, bottom-up)
  page: number;
}

/** A raw text item from pdfjs-dist text extraction. */
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

/** Column boundary information for multi-column layout. */
interface ColumnGroup {
  blocks: DocxTextBlock[];
  leftX: number;
  rightX: number;
  centerX: number;
  width: number;
}

/** Detected table data. */
interface TableData {
  rows: string[][];
}

/** Type alias for a pdfjs-dist document handle. */
type PdfDoc = Awaited<ReturnType<typeof loadPdf>>;

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

// API key is now server-side only (.env.local → OCR_SPACE_API_KEY)
// No hardcoded keys in client code
const MAX_OCR_IMAGE_SIZE = 900 * 1024; // 900 KB
const OCR_DPI_LEVELS = [300, 250, 200, 150, 100, 72];
const OCR_JPEG_QUALITIES = [0.85, 0.7, 0.55, 0.4];

const Y_PROXIMITY_FACTOR = 0.6;
const COLUMN_GAP_THRESHOLD = 50;
const MIN_HEADING_FONT = 13;
const H1_FONT_THRESHOLD = 18;
const H2_FONT_THRESHOLD = 14;

const MAX_IMAGE_WIDTH_INCHES = 6; // Max image width in the DOCX

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

async function loadPdf(file: File): Promise<PdfDoc> {
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
 * Extract raw text items from a single PDF page using pdfjs-dist.
 */
async function extractPageItems(pdfDoc: PdfDoc, pageNum: number): Promise<RawTextItem[]> {
  const page = await pdfDoc.getPage(pageNum);
  const textContent = await page.getTextContent();

  return textContent.items
    .filter((item: any) => "str" in item && item.str.trim().length > 0)
    .map((item: any) => {
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

/**
 * Check if a page needs OCR (very little extractable text).
 */
async function pageNeedsOcr(pdfDoc: PdfDoc, pageNum: number): Promise<boolean> {
  const items = await extractPageItems(pdfDoc, pageNum);
  const totalChars = items.reduce((sum, item) => sum + item.text.length, 0);
  return totalChars < 10;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2: OCR.space processing
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render a PDF page to a canvas at a given DPI.
 */
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
  await page.render({ canvasContext: ctx, viewport }).promise;

  return canvas;
}

/**
 * Compress a PDF page image to fit within maxSize bytes.
 * Tries multiple DPI × quality combinations.
 */
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
  // Absolute last resort: lowest DPI with lowest quality
  const canvas = await renderPageToCanvas(pdfDoc, pageNum, 72);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.3)
  );
  return { blob: blob || new Blob(), dpi: 72 };
}

/**
 * Convert a Blob to a base64 string (without data: prefix).
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Call our server-side OCR.space proxy API.
 * API key is handled server-side — we only send the image and language.
 */
async function callOcrSpaceApi(
  base64Image: string,
  language: string
): Promise<OcrResult> {
  const response = await fetch("/api/ocr-space", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      base64Image,
      language,
    }),
  });

  if (!response.ok) {
    throw new Error(`OCR.space API request failed: ${response.status}`);
  }

  return response.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// Coordinate-based text reconstruction from OCR overlay
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert OCR.space overlay results into DocxTextBlock array using
 * coordinate-based line grouping and smart word merging.
 */
function ocrWordsToTextBlocks(ocrResult: OcrResult, pageNum: number, dpi: number = 150): DocxTextBlock[] {
  const blocks: DocxTextBlock[] = [];

  if (!ocrResult.ParsedResults || ocrResult.ParsedResults.length === 0) return blocks;

  const overlay = ocrResult.ParsedResults[0].TextOverlay;
  if (!overlay || !overlay.Lines || overlay.Lines.length === 0) return blocks;

  // Collect all words with their line context
  for (const line of overlay.Lines) {
    if (!line.Words || line.Words.length === 0) continue;

    const lineWords = line.Words.filter((w) => w.WordText && w.WordText.trim().length > 0);
    if (lineWords.length === 0) continue;

    // Calculate median word height for this line (for bold detection)
    const heights = lineWords.map((w) => w.Height).sort((a, b) => a - b);
    const medianHeight = heights[Math.floor(heights.length / 2)];

    // Sort words by X position within the line
    const sorted = [...lineWords].sort((a, b) => a.Left - b.Left);

    // Average character width for spacing heuristic
    const avgWordWidth = sorted.reduce((s, w) => s + w.Width, 0) / sorted.length;
    const avgWordLen = sorted.reduce((s, w) => s + w.WordText.length, 0) / sorted.length;
    const avgCharWidth = avgWordLen > 0 ? avgWordWidth / avgWordLen : 5;

    // Merge words into a single line text block with proper spacing
    let mergedText = "";
    let lineX = sorted[0].Left;
    let lineEndX = sorted[0].Left + sorted[0].Width;
    let prevEndX = sorted[0].Left + sorted[0].Width;
    let lineMaxHeight = sorted[0].Height;

    for (let i = 0; i < sorted.length; i++) {
      const word = sorted[i];
      lineMaxHeight = Math.max(lineMaxHeight, word.Height);

      if (i === 0) {
        mergedText = word.WordText.trim();
      } else {
        const gap = word.Left - prevEndX;
        // Add space if gap > average char width * 0.3
        if (gap > avgCharWidth * 0.3) {
          mergedText += " ";
        }
        mergedText += word.WordText.trim();
      }
      prevEndX = word.Left + word.Width;
      lineEndX = Math.max(lineEndX, prevEndX);
    }

    // Font size estimation: convert pixel height to points using DPI
    // Formula: fontSize_pt = (height_px * 72) / DPI
    const fontSize = clampFontSize(Math.round((lineMaxHeight * 72) / dpi));

    blocks.push({
      text: mergedText,
      x: lineX,
      y: line.MinTop,
      width: lineEndX - lineX,
      height: lineMaxHeight,
      fontSize,
      bold: false, // Bold detection done below
      italic: false,
      page: pageNum,
    });
  }

  // Bold detection: if a block's font size is significantly larger (>1.3x) than
  // the median font size on the same page, mark it as bold
  if (blocks.length > 1) {
    const allFontSizes = blocks.map((b) => b.fontSize).sort((a, b) => a - b);
    const medianFontSize = allFontSizes[Math.floor(allFontSizes.length / 2)];
    for (const block of blocks) {
      if (block.fontSize > medianFontSize * 1.3 && block.fontSize >= MIN_HEADING_FONT) {
        block.bold = true;
      }
    }
  }

  return blocks;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2b: pdfjs-dist text extraction (for pages with selectable text)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Group pdfjs-dist text items into lines based on y-position proximity.
 * Uses the Y_PROXIMITY_FACTOR * max word height as the grouping threshold.
 */
function groupItemsIntoLines(items: RawTextItem[]): VisualRow[] {
  if (items.length === 0) return [];

  // Sort top-to-bottom then left-to-right (pdfjs y=0 is at bottom)
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

  if (currentItems.length > 0) {
    rows.push(itemsToRow(currentItems));
  }

  return rows;
}

/**
 * Merge a set of text items at approximately the same Y into a single VisualRow.
 * Words are joined with proper spacing (checking gaps between words).
 */
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
      if (gap > avgCharWidth * 1.5) {
        text += "  " + item.text;
      } else if (gap > avgCharWidth * 0.3) {
        text += " " + item.text;
      } else {
        text += item.text;
      }
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
    page: 0, // Will be set later
  };

  return {
    blocks: [block],
    avgY: block.y,
    maxHeight: largestItem.height,
  };
}

/**
 * Convert pdfjs-dist extraction to DocxTextBlock array for a page.
 */
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
 * Extract images from a PDF page using the operator list.
 * Returns an array of extracted images with position data.
 */
async function extractPageImages(
  pdfDoc: PdfDoc,
  pageNum: number
): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];
  try {
    const page = await pdfDoc.getPage(pageNum);
    const operatorList = await page.getOperatorList();

    // Find image-related operations (ops with name 'paintImageXObject' or 'paintJpegXObject')
    const imgObjNames: string[] = [];
    const imgTransforms: number[][] = [];

    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const fn = operatorList.fnArray[i];
      if (fn === 85 || fn === 82) {
        // 85 = paintImageXObject, 82 = paintJpegXObject
        imgObjNames.push(operatorList.argsArray[i][0] as string);
        // Get the current transform (CTM) from the graphics state
        imgTransforms.push([1, 0, 0, 1, 0, 0]); // Default; we'll refine below
      }
    }

    for (let i = 0; i < imgObjNames.length; i++) {
      try {
        const imgObj = await page.objs.get(imgObjNames[i]);
        if (!imgObj) continue;

        let data: ArrayBuffer | null = null;
        let mimeType = "image/png";
        let imgWidth = 100;
        let imgHeight = 100;

        if (imgObj.bitmap) {
          // ImageData-like object with bitmap
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
          if (blob) {
            data = await blob.arrayBuffer();
            mimeType = "image/png";
          }
        } else if (imgObj.data) {
          // Raw image data
          const w = imgObj.width || 100;
          const h = imgObj.height || 100;
          imgWidth = w;
          imgHeight = h;

          if (imgObj.kind === 1) {
            // Grayscale
            const rgba = new Uint8ClampedArray(w * h * 4);
            for (let j = 0; j < w * h; j++) {
              rgba[j * 4] = imgObj.data[j];
              rgba[j * 4 + 1] = imgObj.data[j];
              rgba[j * 4 + 2] = imgObj.data[j];
              rgba[j * 4 + 3] = 255;
            }
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d")!;
            const imageData = new ImageData(rgba, w, h);
            ctx.putImageData(imageData, 0, 0);
            const blob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, "image/png")
            );
            if (blob) {
              data = await blob.arrayBuffer();
              mimeType = "image/png";
            }
          } else if (imgObj.kind === 2) {
            // RGB
            const rgba = new Uint8ClampedArray(w * h * 4);
            for (let j = 0; j < w * h; j++) {
              rgba[j * 4] = imgObj.data[j * 3];
              rgba[j * 4 + 1] = imgObj.data[j * 3 + 1];
              rgba[j * 4 + 2] = imgObj.data[j * 3 + 2];
              rgba[j * 4 + 3] = 255;
            }
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d")!;
            const imageData = new ImageData(rgba, w, h);
            ctx.putImageData(imageData, 0, 0);
            const blob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, "image/png")
            );
            if (blob) {
              data = await blob.arrayBuffer();
              mimeType = "image/png";
            }
          } else if (imgObj.kind === 3) {
            // RGBA
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d")!;
            const imageData = new ImageData(new Uint8ClampedArray(imgObj.data), w, h);
            ctx.putImageData(imageData, 0, 0);
            const blob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, "image/png")
            );
            if (blob) {
              data = await blob.arrayBuffer();
              mimeType = "image/png";
            }
          }
        }

        if (data && data.byteLength > 0) {
          // Get approximate Y position from transforms if available
          const y = imgTransforms[i] ? imgTransforms[i][5] : 0;
          // Skip very small images (likely icons or decorative dots)
          if (imgWidth > 15 && imgHeight > 15) {
            images.push({
              data,
              width: imgWidth,
              height: imgHeight,
              mimeType,
              y,
              page: pageNum,
            });
          }
        }
      } catch {
        // Skip individual image extraction errors
      }
    }
  } catch {
    // Page-level image extraction failed, continue without images
  }

  return images;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3: Layout Analysis & Column Detection
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Group blocks into visual rows based on Y proximity.
 */
function groupIntoRows(blocks: DocxTextBlock[], yThreshold: number): VisualRow[] {
  if (blocks.length === 0) return [];

  // Sort by Y then X (Y descending because PDF origin is bottom-left)
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

/**
 * Detect column structure from visual rows.
 * Returns column boundaries if multi-column detected, or null for single column.
 */
function detectColumns(rows: VisualRow[]): { columns: ColumnGroup[]; isMultiColumn: boolean } {
  if (rows.length === 0) return { columns: [], isMultiColumn: false };

  // Analyze gaps between blocks in each row
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

  // If less than 30% of rows have column gaps, treat as single column
  if (multiColRows < rows.length * 0.3) {
    return { columns: [], isMultiColumn: false };
  }

  // Find the median column boundary
  columnBoundaries.sort((a, b) => a - b);
  const medianBoundary = columnBoundaries[Math.floor(columnBoundaries.length / 2)];

  // Create two column groups
  const leftCol: DocxTextBlock[] = [];
  const rightCol: DocxTextBlock[] = [];

  for (const row of rows) {
    for (const block of row.blocks) {
      if (block.x < medianBoundary) {
        leftCol.push(block);
      } else {
        rightCol.push(block);
      }
    }
  }

  const columns: ColumnGroup[] = [];
  if (leftCol.length > 0) {
    const leftX = Math.min(...leftCol.map((b) => b.x));
    const rightX = Math.max(...leftCol.map((b) => b.x + b.width));
    columns.push({
      blocks: leftCol,
      leftX,
      rightX,
      centerX: (leftX + rightX) / 2,
      width: rightX - leftX,
    });
  }
  if (rightCol.length > 0) {
    const leftX = Math.min(...rightCol.map((b) => b.x));
    const rightX = Math.max(...rightCol.map((b) => b.x + b.width));
    columns.push({
      blocks: rightCol,
      leftX,
      rightX,
      centerX: (leftX + rightX) / 2,
      width: rightX - leftX,
    });
  }

  return { columns, isMultiColumn: columns.length >= 2 };
}

/**
 * Check if a page is multi-column using auto-detection.
 * If ≥30% of multi-block rows have horizontal gaps > 50px → multi-column.
 */
function isPageMultiColumn(rows: VisualRow[]): boolean {
  const { isMultiColumn } = detectColumns(rows);
  return isMultiColumn;
}

// ═══════════════════════════════════════════════════════════════════════════
// Table detection
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect tabular structure from blocks on a page.
 * For pages with ≥4 blocks in grid alignment:
 *   - Cluster X positions (10px tolerance)
 *   - If ≥2 consistent columns and ≥50% of rows have matching column count → table
 *   - First row → header row (bold, gray shading)
 */
function detectTable(blocks: DocxTextBlock[]): TableData | null {
  if (blocks.length < 4) return null;

  const rows = groupIntoRows(blocks, 5);
  if (rows.length < 2) return null;

  // Collect x-positions of block starts across all rows
  const allColumns: number[] = [];
  for (const row of rows) {
    for (const block of row.blocks) {
      allColumns.push(Math.round(block.x));
    }
  }

  // Cluster x-positions into columns (10px tolerance)
  const uniqueXs = [...new Set(allColumns)].sort((a, b) => a - b);
  const columnClusters: number[][] = [];
  let currentCluster: number[] = [uniqueXs[0]];

  for (let i = 1; i < uniqueXs.length; i++) {
    if (uniqueXs[i] - uniqueXs[i - 1] <= 10) {
      currentCluster.push(uniqueXs[i]);
    } else {
      columnClusters.push(currentCluster);
      currentCluster = [uniqueXs[i]];
    }
  }
  columnClusters.push(currentCluster);

  const numColumns = columnClusters.length;
  if (numColumns < 2) return null;

  // Check if at least 50% of rows have blocks aligning to these columns
  let alignedRows = 0;
  for (const row of rows) {
    if (row.blocks.length >= 2) {
      alignedRows++;
    }
  }

  if (alignedRows / rows.length < 0.5) return null;

  // Build table data
  const tableRows: string[][] = [];
  for (const row of rows) {
    const sorted = [...row.blocks].sort((a, b) => a.x - b.x);
    tableRows.push(sorted.map((b) => b.text));
  }

  // Check consistency: all rows should have similar number of cells
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

/**
 * Detect if a text block is a heading based on font size and context.
 * ≥18pt → H1, ≥14pt → H2, ≥13pt and >1.3x average → H3
 */
function detectHeading(block: DocxTextBlock, pageBlocks: DocxTextBlock[]): ParagraphRole {
  const fontSize = clampFontSize(block.fontSize);

  if (fontSize >= H1_FONT_THRESHOLD) return "heading1";
  if (fontSize >= H2_FONT_THRESHOLD) return "heading2";
  if (fontSize >= MIN_HEADING_FONT) {
    const otherSizes = pageBlocks
      .filter((b) => b !== block)
      .map((b) => b.fontSize);
    if (otherSizes.length > 0) {
      const avgSize = otherSizes.reduce((s, v) => s + v, 0) / otherSizes.length;
      if (fontSize > avgSize * 1.3) return "heading3";
    }
  }
  return "normal";
}

/** Invisible border for table cells (used in multi-column layout simulation). */
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

/** Standard table border for detected tables. */
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

/**
 * Create a heading or normal paragraph from a text block.
 */
function blockToParagraph(block: DocxTextBlock, pageBlocks: DocxTextBlock[]): Paragraph {
  const role = detectHeading(block, pageBlocks);
  const runOptions: IRunOptions = {
    text: block.text,
    bold: block.bold || role !== "normal",
    italics: block.italic,
    size: Math.round(clampFontSize(block.fontSize) * 2), // docx uses half-points
  };

  const textRun = new TextRun(runOptions);

  switch (role) {
    case "heading1":
      return new Paragraph({
        children: [textRun],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 360, after: 160 },
      });
    case "heading2":
      return new Paragraph({
        children: [textRun],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 120 },
      });
    case "heading3":
      return new Paragraph({
        children: [textRun],
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 80 },
      });
    default:
      return new Paragraph({
        children: [textRun],
        spacing: { after: 80, line: 276 },
      });
  }
}

/**
 * Build a real Word table from detected table data.
 * First row is treated as header (bold, gray shading).
 */
function buildRealTable(tableData: TableData): Table {
  const tableRows: TableRow[] = [];

  for (let r = 0; r < tableData.rows.length; r++) {
    const cells: TableCell[] = [];
    const isHeader = r === 0;

    for (let c = 0; c < tableData.rows[r].length; c++) {
      const cellText = tableData.rows[r][c] || "";
      cells.push(
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: cellText,
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
        })
      );
    }

    tableRows.push(new TableRow({ children: cells }));
  }

  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

/**
 * Build an invisible-border table that preserves X,Y positioning for a page.
 * Each visual row → table row. Each text block → table cell with proportional width.
 * This is the KEY function for ID cards, forms, and layout-sensitive documents.
 */
function buildSingleColumnPageTable(blocks: DocxTextBlock[]): Table {
  const pageWidth = Math.max(...blocks.map((b) => b.x + b.width)) || 612;
  const avgHeight = blocks.length > 0
    ? blocks.reduce((s, b) => s + b.height, 0) / blocks.length
    : 12;
  const visualRows = groupIntoRows(blocks, avgHeight);
  const tableRows: TableRow[] = [];

  for (const vRow of visualRows) {
    const sortedBlocks = [...vRow.blocks].sort((a, b) => a.x - b.x);
    const cells: TableCell[] = [];

    for (const block of sortedBlocks) {
      // Cell width proportional to block's extent relative to page width
      const cellWidth = Math.max(10, Math.round(((block.x + block.width) / pageWidth) * 100));
      cells.push(
        new TableCell({
          children: [blockToParagraph(block, blocks)],
          width: { size: cellWidth, type: WidthType.PERCENTAGE },
          borders: noBorders,
          margins: { top: 20, bottom: 20, left: 60, right: 60 },
        })
      );
    }

    if (cells.length > 0) {
      tableRows.push(new TableRow({ children: cells }));
    }
  }

  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

/**
 * Build a single-column DOCX section from pages of text blocks.
 * Uses invisible-border tables to preserve spatial positioning.
 */
function buildSingleColumnDocx(
  pages: DocxTextBlock[][],
  pageImages: ExtractedImage[][]
): { paragraphs: Paragraph[]; tables: Table[] } {
  const paragraphs: Paragraph[] = [];
  const tables: Table[] = [];

  for (let p = 0; p < pages.length; p++) {
    const blocks = pages[p];
    const images = pageImages[p] || [];

    // Page break before pages after the first
    if (p > 0) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: "", break: 1 })],
          pageBreakBefore: true,
        })
      );
    }

    if (blocks.length === 0 && images.length === 0) {
      paragraphs.push(new Paragraph({ children: [] }));
      continue;
    }

    // Add page images first
    for (const img of images) {
      paragraphs.push(createImageParagraph(img));
    }

    // Build invisible table preserving X,Y positioning
    if (blocks.length > 0) {
      tables.push(buildSingleColumnPageTable(blocks));
    }
  }

  return { paragraphs, tables };
}

/**
 * Build a "keep original columns" layout using invisible-border table cells.
 * For each row of blocks: if multiple blocks have same Y but different X with
 * gap > 50px → multi-column row. Split into columns using the median gap boundary.
 * ALL pages (single or multi-column) use invisible tables for positioning.
 */
function buildKeepColumnsDocx(
  pages: DocxTextBlock[][],
  pageImages: ExtractedImage[][]
): { paragraphs: Paragraph[]; tables: Table[] } {
  const paragraphs: Paragraph[] = [];
  const tables: Table[] = [];

  for (let p = 0; p < pages.length; p++) {
    const blocks = pages[p];
    const images = pageImages[p] || [];

    if (p > 0) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: "", break: 1 })],
          pageBreakBefore: true,
        })
      );
    }

    if (blocks.length === 0 && images.length === 0) {
      paragraphs.push(new Paragraph({ children: [] }));
      continue;
    }

    // Add any page-level images at the top
    for (const img of images) {
      paragraphs.push(createImageParagraph(img));
    }

    // Group into rows and detect columns
    const avgHeight = blocks.length > 0
      ? blocks.reduce((s, b) => s + b.height, 0) / blocks.length
      : 12;
    const rows = groupIntoRows(blocks, avgHeight);
    const { columns, isMultiColumn } = detectColumns(rows);

    if (!isMultiColumn) {
      // Single-column: still use invisible table to preserve positioning
      tables.push(buildSingleColumnPageTable(blocks));
      continue;
    }

    // Build table rows for multi-column layout
    const numCols = columns.length;
    const totalWidth = columns.reduce((s, c) => s + c.width, 0);

    // Group column blocks by Y rows
    const columnRows: VisualRow[] = [];
    if (columns[0].blocks.length > 0) {
      const leftSorted = [...columns[0].blocks].sort((a, b) => b.y - a.y);
      let currentBlocks: DocxTextBlock[] = [leftSorted[0]];
      let currentY = leftSorted[0].y;

      for (let i = 1; i < leftSorted.length; i++) {
        const block = leftSorted[i];
        const threshold = Math.max(block.height * Y_PROXIMITY_FACTOR, 5);
        if (Math.abs(block.y - currentY) > threshold) {
          columnRows.push({
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
        columnRows.push({
          blocks: currentBlocks,
          avgY: currentY,
          maxHeight: Math.max(...currentBlocks.map((b) => b.height)),
        });
      }
    }

    for (const row of columnRows) {
      const cells: TableCell[] = [];

      for (let c = 0; c < numCols; c++) {
        const col = columns[c];
        const rowBlocks = col.blocks.filter(
          (b) => Math.abs(b.y - row.avgY) < row.maxHeight * Y_PROXIMITY_FACTOR + 5
        );

        const cellParagraphs: Paragraph[] = [];
        if (rowBlocks.length === 0) {
          cellParagraphs.push(new Paragraph({ children: [] }));
        } else {
          const sortedBlocks = [...rowBlocks].sort((a, b) => a.x - b.x);
          for (const block of sortedBlocks) {
            const role = detectHeading(block, blocks);
            const textRun = new TextRun({
              text: block.text,
              bold: block.bold || role !== "normal",
              italics: block.italic,
              size: Math.round(clampFontSize(block.fontSize) * 2),
            });
            cellParagraphs.push(
              new Paragraph({ children: [textRun], spacing: { after: 40, line: 240 } })
            );
          }
        }

        const widthPercent = totalWidth > 0 ? (col.width / totalWidth) * 100 : 50;
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
  }

  return { paragraphs, tables };
}

/**
 * Build an auto-detect layout: analyze each page independently.
 * If a page is multi-column (≥30% of rows have gaps > 50px) → keep columns.
 * Otherwise → single column flow.
 */
function buildAutoLayoutDocx(
  pages: DocxTextBlock[][],
  pageImages: ExtractedImage[][]
): { paragraphs: Paragraph[]; tables: Table[] } {
  const paragraphs: Paragraph[] = [];
  const tables: Table[] = [];

  for (let p = 0; p < pages.length; p++) {
    const blocks = pages[p];
    const images = pageImages[p] || [];

    if (p > 0) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: "", break: 1 })],
          pageBreakBefore: true,
        })
      );
    }

    if (blocks.length === 0 && images.length === 0) {
      paragraphs.push(new Paragraph({ children: [] }));
      continue;
    }

    // Sort blocks by Y
    const sorted = [...blocks].sort((a, b) => b.y - a.y);

    // Check for tables first
    if (blocks.length >= 4) {
      const tableData = detectTable(blocks);
      if (tableData && tableData.rows.length >= 2 && tableData.rows[0].length >= 2) {
        // This page has a table
        for (const img of images) {
          paragraphs.push(createImageParagraph(img));
        }
        tables.push(buildRealTable(tableData));
        continue;
      }
    }

    // Check if this page is multi-column
    const avgHeight = blocks.length > 0
      ? blocks.reduce((s, b) => s + b.height, 0) / blocks.length
      : 12;
    const rows = groupIntoRows(blocks, avgHeight);
    const multiCol = isPageMultiColumn(rows);

    // Add images interleaved
    const sortedImages = [...images].sort((a, b) => b.y - a.y);

    if (!multiCol) {
      // Single column: use invisible table to preserve positioning (for ID cards, forms, etc.)
      for (const img of sortedImages) {
        paragraphs.push(createImageParagraph(img));
      }
      tables.push(buildSingleColumnPageTable(blocks));
    } else {
      // Multi-column layout for this page
      const { columns, isMultiColumn } = detectColumns(rows);

      if (!isMultiColumn || columns.length < 2) {
        // Fallback: use invisible table
        for (const img of sortedImages) {
          paragraphs.push(createImageParagraph(img));
        }
        tables.push(buildSingleColumnPageTable(blocks));
        continue;
      }

      // Add images at top
      for (const img of sortedImages) {
        paragraphs.push(createImageParagraph(img));
      }

      const numCols = columns.length;
      const totalWidth = columns.reduce((s, c) => s + c.width, 0);

      const columnRows: VisualRow[] = [];
      if (columns[0].blocks.length > 0) {
        const leftSorted = [...columns[0].blocks].sort((a, b) => b.y - a.y);
        let currentBlocks: DocxTextBlock[] = [leftSorted[0]];
        let currentY = leftSorted[0].y;

        for (let i = 1; i < leftSorted.length; i++) {
          const block = leftSorted[i];
          const threshold = Math.max(block.height * Y_PROXIMITY_FACTOR, 5);
          if (Math.abs(block.y - currentY) > threshold) {
            columnRows.push({
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
          columnRows.push({
            blocks: currentBlocks,
            avgY: currentY,
            maxHeight: Math.max(...currentBlocks.map((b) => b.height)),
          });
        }
      }

      for (const row of columnRows) {
        const cells: TableCell[] = [];
        for (let c = 0; c < numCols; c++) {
          const col = columns[c];
          const rowBlocks = col.blocks.filter(
            (b) => Math.abs(b.y - row.avgY) < row.maxHeight * Y_PROXIMITY_FACTOR + 5
          );

          const cellParagraphs: Paragraph[] = [];
          if (rowBlocks.length === 0) {
            cellParagraphs.push(new Paragraph({ children: [] }));
          } else {
            const sortedBlocks = [...rowBlocks].sort((a, b) => a.x - b.x);
            for (const block of sortedBlocks) {
              const role = detectHeading(block, blocks);
              const textRun = new TextRun({
                text: block.text,
                bold: block.bold || role !== "normal",
                italics: block.italic,
                size: Math.round(clampFontSize(block.fontSize) * 2),
              });
              cellParagraphs.push(
                new Paragraph({ children: [textRun], spacing: { after: 40, line: 240 } })
              );
            }
          }

          const widthPercent = totalWidth > 0 ? (col.width / totalWidth) * 100 : 50;
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
    }
  }

  return { paragraphs, tables };
}

/**
 * Create an ImageRun paragraph from an extracted image.
 * Resizes to fit page width (max 6 inches wide).
 */
function createImageParagraph(img: ExtractedImage): Paragraph {
  try {
    // Calculate display size (max 6 inches wide, maintain aspect ratio)
    const pixelsPerInch = 96;
    const maxWidthPixels = MAX_IMAGE_WIDTH_INCHES * pixelsPerInch;
    let displayWidth = img.width;
    let displayHeight = img.height;

    if (displayWidth > maxWidthPixels) {
      const ratio = maxWidthPixels / displayWidth;
      displayWidth = maxWidthPixels;
      displayHeight = Math.round(displayHeight * ratio);
    }

    // Convert to EMU (English Metric Units) for docx: 1 inch = 914400 EMU, 1 pixel = 9525 EMU at 96dpi
    const widthEMU = Math.round(displayWidth * 9525);
    const heightEMU = Math.round(displayHeight * 9525);

    const imageRun = new ImageRun({
      data: img.data,
      transformation: {
        width: displayWidth,
        height: displayHeight,
      },
      type: img.mimeType === "image/jpeg" ? "jpg" : "png",
    });

    return new Paragraph({
      children: [imageRun],
      spacing: { before: 120, after: 120 },
    });
  } catch {
    return new Paragraph({ children: [] });
  }
}

/**
 * Generate the final DOCX blob from paragraphs and tables.
 */
async function generateDocx(
  contentParagraphs: Paragraph[],
  tableObjects: Table[],
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
              top: 1440, // 1 inch
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: [...contentParagraphs, ...tableObjects],
      },
    ],
  });

  return Packer.toBlob(doc);
}

// ═══════════════════════════════════════════════════════════════════════════
// Main entry point
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert a PDF file to a Word (DOCX) document.
 *
 * @param file        - The PDF file to convert.
 * @param options     - Conversion options.
 * @param onProgress  - Optional progress callback `(status, percent)`.
 * @returns An object with the generated File and conversion statistics.
 */
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

  // ── Phase 1: Load & Analyze (0-10%) ──────────────────────────────────
  onProgress?.("Loading PDF...", 2);

  const pdfDoc = await loadPdf(file);
  const totalPages = pdfDoc.numPages;

  onProgress?.(`Analyzing ${totalPages} pages...`, 5);

  // Determine which pages need OCR (only relevant when useOcrSpace is false)
  const pagesNeedingOcr: Set<number> = new Set();

  if (!options.useOcrSpace) {
    for (let i = 1; i <= totalPages; i++) {
      onProgress?.(`Analyzing page ${i} of ${totalPages}...`, 5 + (5 * i) / totalPages);
      const needsOcr = await pageNeedsOcr(pdfDoc, i);
      if (needsOcr && options.enableOcr) {
        pagesNeedingOcr.add(i);
      }
    }
  }

  onProgress?.("Analysis complete.", 10);

  // ── Phase 2: Extract text (10-70%) ──────────────────────────────────
  const allPagesBlocks: DocxTextBlock[][] = [];
  const allPagesImages: ExtractedImage[][] = [];
  let ocrPageCount = 0;
  let totalCharacters = 0;
  let imagesExtracted = 0;
  const percentBase = 10;
  const percentEnd = 70;
  const percentRange = percentEnd - percentBase;

  for (let i = 0; i < totalPages; i++) {
    const pageNum = i + 1;
    const pagePercent = percentBase + (percentRange * i) / totalPages;
    onProgress?.(`Processing page ${pageNum} of ${totalPages}...`, pagePercent);

    let blocks: DocxTextBlock[] = [];
    let useOcr = false;

    if (options.useOcrSpace) {
      // When useOcrSpace is true, EVERY page goes through OCR.space
      useOcr = true;
    } else if (pagesNeedingOcr.has(pageNum)) {
      // Fallback OCR for scanned pages only
      useOcr = true;
    }

    if (useOcr) {
      try {
        onProgress?.(`Running OCR on page ${pageNum}...`, pagePercent + 2);

        // Render page to JPEG and compress
        const { blob, dpi } = await compressPageToMaxSize(pdfDoc, pageNum, MAX_OCR_IMAGE_SIZE);
        const base64 = await blobToBase64(blob);

        onProgress?.(`Calling OCR.space for page ${pageNum}...`, pagePercent + 4);

        // Sequential API call (one page at a time — bypasses 3-page limit)
        const ocrResult = await callOcrSpaceApi(base64, options.ocrLanguage);
        blocks = ocrWordsToTextBlocks(ocrResult, pageNum, dpi);

        if (blocks.length > 0) {
          ocrPageCount++;
        } else {
          // OCR returned nothing — try pdfjs-dist extraction as fallback
          onProgress?.(`OCR empty on page ${pageNum}, extracting text...`, pagePercent + 5);
          blocks = await extractTextBlocks(pdfDoc, pageNum);
        }
      } catch (err) {
        // OCR failed — fall back to pdfjs-dist text extraction
        console.warn(`OCR failed for page ${pageNum}, using text extraction fallback:`, err);
        onProgress?.(`OCR failed on page ${pageNum}, extracting text...`, pagePercent + 5);
        blocks = await extractTextBlocks(pdfDoc, pageNum);
      }
    } else {
      // pdfjs-dist text extraction
      onProgress?.(`Extracting text from page ${pageNum}...`, pagePercent + 2);
      blocks = await extractTextBlocks(pdfDoc, pageNum);
    }

    totalCharacters += blocks.reduce((s, b) => s + b.text.length, 0);

    // Extract images from this page
    try {
      const pageImages = await extractPageImages(pdfDoc, pageNum);
      allPagesImages.push(pageImages);
      imagesExtracted += pageImages.length;
    } catch {
      allPagesImages.push([]);
    }

    allPagesBlocks.push(blocks);
  }

  // ── Phase 3: Layout Analysis (70-80%) ───────────────────────────────
  onProgress?.("Detecting layout...", 72);

  let headingsDetected = 0;
  let tablesDetected = 0;

  for (let p = 0; p < allPagesBlocks.length; p++) {
    const blocks = allPagesBlocks[p];

    // Count headings
    for (const block of blocks) {
      if (detectHeading(block, blocks) !== "normal") {
        headingsDetected++;
      }
    }

    // Count detected tables
    if (blocks.length >= 4) {
      const tableData = detectTable(blocks);
      if (tableData && tableData.rows.length >= 2 && tableData.rows[0].length >= 2) {
        tablesDetected++;
      }
    }
  }

  onProgress?.("Analyzing columns...", 76);

  const layoutMode = options.layoutMode;

  // ── Phase 4: DOCX Generation (80-95%) ───────────────────────────────
  onProgress?.("Generating Word document...", 82);

  let contentParagraphs: Paragraph[] = [];
  const tableObjects: Table[] = [];

  if (layoutMode === "single") {
    const result = buildSingleColumnDocx(allPagesBlocks, allPagesImages);
    contentParagraphs = result.paragraphs;
    tableObjects.push(...result.tables);
  } else if (layoutMode === "keep") {
    const result = buildKeepColumnsDocx(allPagesBlocks, allPagesImages);
    contentParagraphs = result.paragraphs;
    tableObjects.push(...result.tables);
  } else {
    // "auto" mode
    const result = buildAutoLayoutDocx(allPagesBlocks, allPagesImages);
    contentParagraphs = result.paragraphs;
    tableObjects.push(...result.tables);
  }

  onProgress?.("Building document...", 90);

  const docxBlob = await generateDocx(contentParagraphs, tableObjects, baseName);

  // ── Phase 5: Finalize (95-100%) ─────────────────────────────────────
  onProgress?.("Finalizing...", 95);

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
    tablesDetected,
    imagesExtracted,
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
