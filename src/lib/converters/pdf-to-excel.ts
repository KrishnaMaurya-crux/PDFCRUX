/**
 * PDF to Excel (XLSX) Converter for PdfCrux
 *
 * Extracts text with positioning from PDFs using pdfjs-dist, detects table
 * structures by analyzing column alignment, maps text items to spreadsheet
 * cells, and generates a proper .xlsx workbook using the `xlsx` library.
 *
 * For scanned PDFs with no selectable text, falls back to Tesseract.js OCR.
 *
 * All processing happens client-side in the browser — no server APIs used.
 */

import type { TextItem } from "pdfjs-dist/types/src/display/api";
import * as XLSX from "xlsx";
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
  totalCells: number;
  totalRows: number;
  tablesDetected: number;
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
}

interface TextRow {
  items: ExtractedTextItem[];
  y: number;       // dominant y position of the row
  fontSize: number; // dominant font size
}

interface DetectedTable {
  startRow: number;
  endRow: number;   // exclusive
  columnBoundaries: number[]; // x positions defining column edges
  cells: string[][]; // cells[rowIdx][colIdx]
}

interface NonTableBlock {
  startRow: number;
  endRow: number;   // exclusive
  text: string;
}

/** Either a detected table or a block of non-table text */
type ContentBlock =
  | { kind: "table"; table: DetectedTable }
  | { kind: "text"; block: NonTableBlock };

interface PageContent {
  rows: TextRow[];
  width: number;
  height: number;
  blocks: ContentBlock[];
  isOcr: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format bytes into human-readable string */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// ---------------------------------------------------------------------------
// 1. Load PDF
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

// ---------------------------------------------------------------------------
// 2. Extract text items from a single page
// ---------------------------------------------------------------------------

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
      };
    });
}

// ---------------------------------------------------------------------------
// 3. Group items into rows by Y proximity
// ---------------------------------------------------------------------------

function groupItemsIntoRows(items: ExtractedTextItem[]): TextRow[] {
  if (items.length === 0) return [];

  // Sort: top of page first (high y in PDF coords), then left-to-right
  const sorted = [...items].sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 3) return yDiff;
    return a.x - b.x;
  });

  const rows: TextRow[] = [];
  let currentItems: ExtractedTextItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const dominantFontSize =
      currentItems.reduce((s, it) => s + it.fontSize, 0) / currentItems.length;
    const yThreshold = Math.max(dominantFontSize * 0.4, 3);

    if (Math.abs(item.y - currentY) > yThreshold) {
      rows.push(buildTextRow(currentItems));
      currentItems = [item];
      currentY = item.y;
    } else {
      currentItems.push(item);
      currentY = currentItems.reduce((s, it) => s + it.y, 0) / currentItems.length;
    }
  }

  if (currentItems.length > 0) {
    rows.push(buildTextRow(currentItems));
  }

  return rows;
}

function buildTextRow(items: ExtractedTextItem[]): TextRow {
  items.sort((a, b) => a.x - b.x);

  const dominantFontSize =
    items.reduce((s, it) => s + it.fontSize, 0) / items.length;
  const dominantY =
    items.reduce((s, it) => s + it.y, 0) / items.length;

  return {
    items,
    y: dominantY,
    fontSize: dominantFontSize,
  };
}

// ---------------------------------------------------------------------------
// 4. Table Detection Algorithm
// ---------------------------------------------------------------------------

/**
 * Analyzes an array of text rows and separates them into table blocks and
 * non-table (paragraph) blocks.
 *
 * Strategy:
 * 1. Build candidate column boundaries from x-positions of items across rows.
 * 2. Check if a contiguous set of rows shares common column alignments.
 * 3. A "table" is a contiguous group of ≥2 rows where items consistently
 *    align to a common set of column boundaries.
 * 4. Isolated rows or rows that don't align with neighbors → non-table text.
 */
function detectContentBlocks(
  rows: TextRow[],
  pageWidth: number
): ContentBlock[] {
  if (rows.length === 0) return [];

  // Need at least 2 rows for a table
  if (rows.length === 1) {
    return [
      {
        kind: "text",
        block: {
          startRow: 0,
          endRow: 1,
          text: rows[0].items.map((it) => it.text).join(" "),
        },
      },
    ];
  }

  // ── Step A: Compute column boundaries for each pair of consecutive rows ──

  /**
   * For a single row, get the set of "column start" x positions.
   * We take the x of each item as a candidate column start.
   */
  function getColumnStarts(row: TextRow): number[] {
    return row.items.map((it) => it.x);
  }

  /**
   * Check if two rows share similar column structure.
   * Two sets of column starts are considered "compatible" if at least
   * half of the items in each row align (within 5px) with items in the other.
   */
  function rowsAreTableCompatible(a: TextRow, b: TextRow, tolerance: number = 5): boolean {
    const startsA = getColumnStarts(a);
    const startsB = getColumnStarts(b);

    if (startsA.length <= 1 && startsB.length <= 1) {
      // Single-column rows: only a table if both have exactly 1 item
      // AND there are other multi-column rows nearby.
      // For now, single-item rows don't form a table on their own.
      return false;
    }

    let alignedA = 0;
    for (const xa of startsA) {
      for (const xb of startsB) {
        if (Math.abs(xa - xb) <= tolerance) {
          alignedA++;
          break;
        }
      }
    }

    const matchRatio = alignedA / Math.max(startsA.length, startsB.length);
    return matchRatio >= 0.4;
  }

  // ── Step B: Find contiguous runs of table-compatible rows ──

  const isTableRun: boolean[] = new Array(rows.length).fill(false);

  // Sliding window: mark rows that are part of a potential table
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // A row with only 1 item could still be in a table if it's a header or
    // a row in a multi-column context. Check neighbors.
    if (row.items.length >= 2) {
      // Multi-item row: check if it has at least one compatible neighbor
      const hasPrev = i > 0 && rowsAreTableCompatible(row, rows[i - 1]);
      const hasNext = i < rows.length - 1 && rowsAreTableCompatible(row, rows[i + 1]);
      isTableRun[i] = hasPrev || hasNext;
    } else if (row.items.length === 1) {
      // Single-item row: it's part of a table if BOTH neighbors are table rows
      const prevIsTable = i > 0 && isTableRun[i - 1];
      const nextIsTable = i < rows.length - 1 && rows[i + 1].items.length >= 2;
      isTableRun[i] = prevIsTable && nextIsTable;
    }
  }

  // ── Step C: Group contiguous table rows into table blocks ──

  const blocks: ContentBlock[] = [];
  let i = 0;

  while (i < rows.length) {
    if (isTableRun[i]) {
      // Start of a table run
      const startRow = i;
      while (i < rows.length && isTableRun[i]) i++;
      const endRow = i;

      // Collect column boundaries across all rows in this block
      const tableRows = rows.slice(startRow, endRow);
      const boundaries = computeColumnBoundaries(tableRows);
      const cells = mapItemsToCells(tableRows, boundaries);

      blocks.push({
        kind: "table",
        table: {
          startRow,
          endRow,
          columnBoundaries: boundaries,
          cells,
        },
      });
    } else {
      // Non-table row(s): collect consecutive non-table rows into text blocks
      const startRow = i;
      while (i < rows.length && !isTableRun[i]) i++;
      const endRow = i;

      const textLines = rows.slice(startRow, endRow).map((r) =>
        r.items.map((it) => it.text).join(" ")
      );
      const text = textLines.join("\n");

      blocks.push({
        kind: "text",
        block: {
          startRow,
          endRow,
          text,
        },
      });
    }
  }

  return blocks;
}

/**
 * Compute column boundaries from a set of table rows.
 *
 * Algorithm:
 * 1. Collect all item x-positions.
 * 2. Cluster them into groups where items are within 5px of each other.
 * 3. Each cluster → one column boundary (the median x of the cluster).
 * 4. Sort boundaries left-to-right.
 */
function computeColumnBoundaries(tableRows: TextRow[]): number[] {
  const allXPositions: number[] = [];
  for (const row of tableRows) {
    for (const item of row.items) {
      allXPositions.push(item.x);
    }
  }

  if (allXPositions.length === 0) return [];

  // Sort x positions
  allXPositions.sort((a, b) => a - b);

  // Cluster positions that are within 5px of each other
  const clusters: number[][] = [];
  let currentCluster: number[] = [allXPositions[0]];
  let clusterMedian = allXPositions[0];

  for (let i = 1; i < allXPositions.length; i++) {
    const x = allXPositions[i];
    if (Math.abs(x - clusterMedian) <= 5) {
      currentCluster.push(x);
      // Recompute median
      currentCluster.sort((a, b) => a - b);
      const mid = Math.floor(currentCluster.length / 2);
      clusterMedian =
        currentCluster.length % 2 === 0
          ? (currentCluster[mid - 1] + currentCluster[mid]) / 2
          : currentCluster[mid];
    } else {
      clusters.push(currentCluster);
      currentCluster = [x];
      clusterMedian = x;
    }
  }
  clusters.push(currentCluster);

  // Each cluster's median → one column boundary
  const boundaries = clusters.map((cluster) => {
    const sorted = [...cluster].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  });

  boundaries.sort((a, b) => a - b);
  return boundaries;
}

/**
 * Map text items to cells based on column boundaries.
 *
 * For each item, find which column boundary it's closest to.
 * If an item doesn't fall near any boundary, assign it to the closest column.
 */
function mapItemsToCells(
  tableRows: TextRow[],
  boundaries: number[]
): string[][] {
  const numCols = boundaries.length;
  if (numCols === 0) return tableRows.map((r) => [r.items.map((it) => it.text).join(" ")]);

  const cells: string[][] = [];

  for (const row of tableRows) {
    // Initialize empty cells
    const rowCells: string[] = new Array(numCols).fill("");

    for (const item of row.items) {
      const itemCenter = item.x + item.width / 2;

      // Find closest column boundary
      let bestCol = 0;
      let bestDist = Infinity;
      for (let c = 0; c < numCols; c++) {
        const dist = Math.abs(itemCenter - boundaries[c]);
        if (dist < bestDist) {
          bestDist = dist;
          bestCol = c;
        }
      }

      // Append text to the cell
      if (rowCells[bestCol].length > 0) {
        rowCells[bestCol] += " " + item.text;
      } else {
        rowCells[bestCol] = item.text;
      }
    }

    cells.push(rowCells);
  }

  return cells;
}

// ---------------------------------------------------------------------------
// 5. OCR fallback for scanned pages
// ---------------------------------------------------------------------------

async function runOcrOnPage(
  pdfDoc: Awaited<ReturnType<typeof loadPdf>>,
  pageNum: number,
  language: string,
  onProgress?: (status: string, percent: number) => void
): Promise<string> {
  onProgress?.(`Running OCR on page ${pageNum}...`, 0);

  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 2 });

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
// 6. Build Excel workbook from page contents
// ---------------------------------------------------------------------------

/**
 * Build an XLSX workbook from the detected content blocks.
 *
 * - Each PDF page → separate worksheet named "Page 1", "Page 2", etc.
 * - Table blocks → rows of cells
 * - Text blocks → single merged cell spanning all columns of that page
 * - Column widths auto-sized based on content
 */
function buildWorkbook(pageContents: PageContent[]): XLSX.WorkBook {
  const book = XLSX.utils.book_new();

  // Track the maximum columns across all pages for consistent width calculations
  let maxCols = 1;

  for (let p = 0; p < pageContents.length; p++) {
    const page = pageContents[p];
    const sheetName = p === 0 ? "Page 1" : `Page ${p + 1}`;

    // Collect all rows for this page as AoA (array of arrays)
    const aoa: (string | number)[][] = [];

    // Track max columns for this page
    let pageMaxCols = 1;

    for (const block of page.blocks) {
      if (block.kind === "table") {
        for (const row of block.table.cells) {
          aoa.push(row);
          pageMaxCols = Math.max(pageMaxCols, row.length);
        }
      } else {
        // Non-table text: put as a single cell in a row
        const lines = block.block.text.split("\n");
        for (const line of lines) {
          if (line.trim().length > 0) {
            aoa.push([line]);
          }
        }
      }
    }

    // If page is empty (OCR produced no text), add a placeholder
    if (aoa.length === 0) {
      aoa.push(["(No content detected on this page)"]);
    }

    maxCols = Math.max(maxCols, pageMaxCols);

    // Create worksheet from AoA
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Set column widths based on content
    if (pageMaxCols > 1) {
      const colWidths: XLSX.ColInfo[] = [];
      for (let c = 0; c < pageMaxCols; c++) {
        // Find the maximum content length in this column
        let maxLen = 8; // minimum width
        for (const row of aoa) {
          if (row[c] !== undefined && row[c] !== null) {
            const cellStr = String(row[c]);
            maxLen = Math.max(maxLen, cellStr.length);
          }
        }
        // Cap width at 50 characters, use wch (characters)
        colWidths.push({ wch: Math.min(maxLen + 2, 50) });
      }
      ws["!cols"] = colWidths;
    } else {
      // Single column: use wider default
      ws["!cols"] = [{ wch: 80 }];
    }

    XLSX.utils.book_append_sheet(book, ws, sheetName);
  }

  return book;
}

/**
 * Alternative: build a single-sheet workbook with all content.
 */
function buildSingleSheetWorkbook(pageContents: PageContent[]): XLSX.WorkBook {
  const book = XLSX.utils.book_new();
  const aoa: (string | number)[][] = [];

  for (let p = 0; p < pageContents.length; p++) {
    const page = pageContents[p];

    // Add page separator for multi-page documents
    if (p > 0 && page.blocks.length > 0) {
      aoa.push([`--- Page ${p + 1} ---`]);
    }

    for (const block of page.blocks) {
      if (block.kind === "table") {
        for (const row of block.table.cells) {
          aoa.push(row);
        }
      } else {
        const lines = block.block.text.split("\n");
        for (const line of lines) {
          if (line.trim().length > 0) {
            aoa.push([line]);
          }
        }
      }
    }
  }

  if (aoa.length === 0) {
    aoa.push(["(No content detected)"]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Calculate column widths
  const numCols = Math.max(...aoa.map((row) => row.length), 1);
  const colWidths: XLSX.ColInfo[] = [];
  for (let c = 0; c < numCols; c++) {
    let maxLen = 8;
    for (const row of aoa) {
      if (row[c] !== undefined && row[c] !== null) {
        const cellStr = String(row[c]);
        maxLen = Math.max(maxLen, cellStr.length);
      }
    }
    colWidths.push({ wch: Math.min(maxLen + 2, 50) });
  }
  ws["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(book, ws, "Sheet 1");

  return book;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Convert a PDF file to an Excel (XLSX) spreadsheet.
 *
 * @param file        - The PDF file to convert.
 * @param options     - Conversion options:
 *   - enableOcr     Whether to use OCR for scanned pages.
 *   - extractMode   'auto' (detect tables), 'tables' (only tables), or 'full-text' (all as rows).
 *   - language      Tesseract language code ('eng', 'hin', etc.).
 * @param onProgress  - Optional progress callback `(status, percent)`.
 * @returns An object with the generated File and conversion statistics.
 */
export async function convertPdfToExcel(
  file: File,
  options: {
    enableOcr: boolean;
    extractMode: "auto" | "tables" | "full-text";
    language: string;
  },
  onProgress?: (status: string, percent: number) => void
): Promise<{ file: OutputFile; stats: ConversionStats }> {
  const startTime = Date.now();
  const baseName = file.name.replace(/\.[^/.]+$/, "");

  onProgress?.("Loading PDF document...", 5);

  // ── Step 1: Load PDF ──────────────────────────────────────────────
  const pdfDoc = await loadPdf(file, onProgress);
  const totalPages = pdfDoc.numPages;

  onProgress?.(`Analyzing ${totalPages} pages...`, 10);

  // ── Step 2: Extract text and detect tables page by page ───────────
  const pageContents: PageContent[] = [];
  let ocrPageCount = 0;
  let totalCells = 0;
  let totalRows = 0;
  let tablesDetected = 0;

  // Percentage range for extraction: 10% → 75%
  const extractBase = 10;
  const extractEnd = 75;
  const extractRange = extractEnd - extractBase;

  for (let i = 1; i <= totalPages; i++) {
    const pagePercent =
      extractBase + (extractRange * (i - 1)) / totalPages;
    onProgress?.(`Analyzing page ${i} of ${totalPages}...`, pagePercent);

    const items = await extractPageItems(pdfDoc, i);
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });

    // Check if the page is scanned (very little extractable text)
    const pageTextLength = items.reduce((sum, it) => sum + it.text.length, 0);

    let isOcr = false;

    if (pageTextLength < 10 && options.enableOcr) {
      // ── OCR fallback ──
      const ocrPercent =
        pagePercent + (extractRange * 0.5) / totalPages;
      const ocrText = await runOcrOnPage(
        pdfDoc,
        i,
        options.language,
        (status, pct) => {
          onProgress?.(status, ocrPercent + (pct * 0.5) / totalPages);
        }
      );

      ocrPageCount++;
      isOcr = true;

      // Build rows from OCR text (no positioning info — one row per line)
      const ocrRows: TextRow[] = ocrText
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l, idx) => ({
          items: [{ text: l.trim(), x: 72, y: 0, width: 0, height: 12, fontSize: 12, fontName: "" }],
          y: idx * 16,
          fontSize: 12,
        }));

      // For OCR text in "tables" mode, try tab/space-delimited splitting
      let blocks: ContentBlock[];
      if (options.extractMode === "tables") {
        const tableRows = ocrRows.map((r) => {
          const parts = r.items[0].text.split(/\t+/);
          if (parts.length <= 1) {
            // Try splitting by multiple spaces
            const spaceParts = r.items[0].text.split(/  +/);
            if (spaceParts.length > 1) return spaceParts;
            return [r.items[0].text];
          }
          return parts;
        });
        const cells = tableRows.filter((r) => r.length > 1).length > 0 ? tableRows : tableRows.map((r) => [r.join(" ")]);
        blocks = [
          {
            kind: "table",
            table: {
              startRow: 0,
              endRow: cells.length,
              columnBoundaries: [],
              cells,
            },
          },
        ];
      } else {
        blocks = [
          {
            kind: "text",
            block: {
              startRow: 0,
              endRow: ocrRows.length,
              text: ocrText,
            },
          },
        ];
      }

      pageContents.push({
        rows: ocrRows,
        width: viewport.width,
        height: viewport.height,
        blocks,
        isOcr: true,
      });
    } else {
      // ── Normal text extraction ──
      const rows = groupItemsIntoRows(items);

      onProgress?.(`Detecting tables on page ${i}...`, pagePercent + extractRange / totalPages * 0.3);

      let blocks: ContentBlock[];

      if (options.extractMode === "full-text") {
        // Full-text mode: everything as single-column rows
        blocks = rows.map((r, idx) => ({
          kind: "text" as const,
          block: {
            startRow: idx,
            endRow: idx + 1,
            text: r.items.map((it) => it.text).join(" "),
          },
        }));
      } else {
        // "auto" or "tables" mode: detect table structure
        blocks = detectContentBlocks(rows, viewport.width);

        if (options.extractMode === "tables") {
          // Filter out non-table blocks in "tables" mode
          blocks = blocks.filter((b) => b.kind === "table");
        }
      }

      pageContents.push({
        rows,
        width: viewport.width,
        height: viewport.height,
        blocks,
        isOcr: false,
      });
    }

    onProgress?.(`Mapping cells on page ${i}...`, pagePercent + extractRange / totalPages * 0.6);
  }

  // ── Step 3: Count stats ───────────────────────────────────────────
  for (const page of pageContents) {
    for (const block of page.blocks) {
      if (block.kind === "table") {
        tablesDetected++;
        for (const row of block.table.cells) {
          totalRows++;
          totalCells += row.length;
        }
      } else {
        totalRows++;
        totalCells++;
      }
    }
  }

  // ── Step 4: Generate Excel workbook ───────────────────────────────
  onProgress?.("Generating Excel...", 78);

  // If only one page or a simple document, use single sheet
  const book =
    totalPages === 1
      ? buildSingleSheetWorkbook(pageContents)
      : buildWorkbook(pageContents);

  onProgress?.("Writing XLSX file...", 88);

  // Write workbook to array buffer, then to Blob
  const wbout = XLSX.write(book, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  onProgress?.("Finalizing...", 95);

  const outputFileName = `${baseName}.xlsx`;
  const outputFile = new File([blob], outputFileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const processingTime = Date.now() - startTime;

  const stats: ConversionStats = {
    totalPages,
    ocrPages: ocrPageCount,
    totalCells,
    totalRows,
    tablesDetected,
    processingTimeMs: processingTime,
  };

  onProgress?.(
    `Done! Converted ${totalPages} pages → ${stats.tablesDetected} tables, ${totalRows} rows (${formatBytes(blob.size)}) in ${(processingTime / 1000).toFixed(1)}s`,
    100
  );

  return {
    file: {
      name: outputFileName,
      file: outputFile,
      size: blob.size,
    },
    stats,
  };
}
