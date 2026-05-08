/**
 * Excel to PDF Converter for PdfCrux
 *
 * Parses Excel (.xlsx, .xls) files using the `xlsx` library and renders
 * each worksheet as a formatted table in a PDF using jsPDF + jspdf-autotable.
 *
 * Features:
 *   - All worksheets → separate PDF pages
 *   - Configurable page size, orientation, fit-to-width, gridlines
 *   - Real-time progress callbacks
 *   - Full client-side — no server APIs
 */

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  totalSheets: number;
  convertedSheets: number;
  totalRows: number;
  totalColumns: number;
  outputSize: number;
  conversionTimeMs: number;
}

export interface ExcelToPdfOptions {
  pageSize: "a4" | "letter" | "legal";
  orientation: "portrait" | "landscape";
  fitToWidth: boolean;
  gridlines: boolean;
}

// ========================
// Page-size map (jsPDF format strings)
// ========================

const PAGE_FORMAT_MAP: Record<string, "a4" | "letter" | "legal"> = {
  a4: "a4",
  letter: "letter",
  legal: "legal",
};

/**
 * Convert our pageSize option into jsPDF + autotable compatible page dimensions (in mm).
 */
function getPageDimensions(
  pageSize: string,
  orientation: string,
): { width: number; height: number; jsPdfPageSize: "a4" | "letter" | "legal"; jsPdfOrientation: "p" | "l" } {
  // Raw dimensions in mm
  const dims: Record<string, [number, number]> = {
    a4: [210, 297],
    letter: [215.9, 279.4],
    legal: [215.9, 355.6],
  };

  const [w, h] = dims[pageSize] ?? dims["a4"];
  const isLandscape = orientation === "landscape";

  return {
    width: isLandscape ? h : w,
    height: isLandscape ? w : h,
    jsPdfPageSize: PAGE_FORMAT_MAP[pageSize] ?? "a4",
    jsPdfOrientation: isLandscape ? "l" : "p",
  };
}

// ========================
// Helpers
// ========================

/**
 * Calculate column widths (in mm) for the autotable plugin.
 *
 * - fitToWidth: distribute evenly across usable page width.
 * - !fitToWidth: use character-based heuristic widths.
 */
function calculateColumnWidths(
  rows: (string | number | boolean | null)[][],
  usableWidth: number,
  fitToWidth: boolean,
): number[] {
  if (rows.length === 0) return [usableWidth];

  const colCount = Math.max(...rows.map((r) => r.length), 1);

  if (fitToWidth) {
    // Even distribution
    return Array(colCount).fill(usableWidth / colCount);
  }

  // Character-based heuristic: estimate width from max content length per column
  const colMaxChars: number[] = new Array(colCount).fill(0);

  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      const str = cell == null ? "" : String(cell);
      colMaxChars[c] = Math.max(colMaxChars[c], str.length);
    }
  }

  // Character width ≈ 2.0mm for default font at ~10pt
  const CHAR_WIDTH_MM = 2.0;
  const rawWidths = colMaxChars.map((ch) => Math.max(ch * CHAR_WIDTH_MM, 8)); // minimum 8mm

  // Scale down if total exceeds usable width
  const totalRaw = rawWidths.reduce((s, w) => s + w, 0);
  const scale = totalRaw > usableWidth ? usableWidth / totalRaw : 1;

  return rawWidths.map((w) => w * scale);
}

/**
 * Convert cell values to display strings for the table.
 * Dates are formatted, null/undefined → empty string.
 */
function cellToString(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

// ========================
// Main Converter
// ========================

/**
 * Converts an Excel file (.xlsx / .xls) to a PDF.
 *
 * Each worksheet is rendered as a separate page with a formatted table.
 * Uses jspdf-autotable for high-quality table rendering with automatic
 * page breaks for long sheets.
 */
export async function convertExcelToPdf(
  file: File,
  options: ExcelToPdfOptions,
  onProgress?: (status: string, percent: number) => void,
): Promise<{ file: OutputFile; stats: ConversionStats }> {
  const startTime = performance.now();

  onProgress?.("Reading Excel file...", 2);

  // --- 1. Parse Excel file ---
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });

  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    throw new Error("The Excel file contains no worksheets.");
  }

  onProgress?.(`Found ${sheetNames.length} worksheet(s)`, 5);

  // --- 2. Setup PDF document ---
  const { width: pageWidth, jsPdfPageSize, jsPdfOrientation } = getPageDimensions(
    options.pageSize,
    options.orientation,
  );

  const marginMm = 14; // left/right margins in mm
  const usableWidth = pageWidth - marginMm * 2;

  const pdf = new jsPDF({
    orientation: jsPdfOrientation,
    unit: "mm",
    format: jsPdfPageSize,
  });

  // --- 3. Process each worksheet ---
  let totalRows = 0;
  let totalColumns = 0;

  for (let si = 0; si < sheetNames.length; si++) {
    const sheetName = sheetNames[si];
    const percentBase = Math.round(5 + (si / sheetNames.length) * 85);

    onProgress?.(
      `Processing sheet "${sheetName}" (${si + 1}/${sheetNames.length})...`,
      percentBase,
    );

    // Add new page (skip for the first sheet — jsPDF creates page 1 automatically)
    if (si > 0) {
      pdf.addPage();
    }

    // Add sheet title at the top
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text(sheetName, marginMm, 12);

    // Get sheet data as 2D array
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
    });

    // Convert to string rows for the table
    const rows = rawRows.map((row) => row.map(cellToString));

    // Skip empty sheets
    if (rows.length === 0 || (rows.length === 1 && rows[0].every((c) => c === ""))) {
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "italic");
      pdf.text("(empty sheet)", marginMm, 20);
      continue;
    }

    // Track stats
    const sheetRows = rows.length;
    const sheetCols = Math.max(...rows.map((r) => r.length));
    totalRows += sheetRows;
    totalColumns = Math.max(totalColumns, sheetCols);

    // Calculate column widths
    const colWidths = calculateColumnWidths(rows, usableWidth, options.fitToWidth);

    // Detect header row (first row) and apply styling
    const hasHeader = rows.length > 1;

    // Use autotable to render the table
    autoTable(pdf, {
      startY: 16, // below sheet title
      margin: { left: marginMm, right: marginMm, top: 16, bottom: 14 },
      head: hasHeader ? [rows[0]] : undefined,
      body: hasHeader ? rows.slice(1) : rows,
      columnStyles: colWidths.reduce(
        (acc, w, i) => {
          acc[i] = { cellWidth: w };
          return acc;
        },
        {} as Record<number, { cellWidth: number }>,
      ),
      theme: options.gridlines ? "grid" : "plain",
      styles: {
        fontSize: 8,
        cellPadding: 2,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8.5,
        halign: "left" as const,
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      tableLineColor: options.gridlines ? [180, 180, 180] : [255, 255, 255],
      tableLineWidth: options.gridlines ? 0.2 : 0,
      // Page break handling for long tables
      didDrawPage: () => {
        // Add footer with sheet name + page number
        const pageCount = pdf.getNumberOfPages();
        pdf.setFontSize(7);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(150);
        const footerText = `${sheetName} — Page ${pageCount}`;
        pdf.text(footerText, pageWidth / 2, pdf.internal.pageSize.getHeight() - 8, {
          align: "center",
        });
        pdf.setTextColor(0); // reset
      },
    });

    onProgress?.(
      `Sheet "${sheetName}" complete (${sheetRows} rows)`,
      percentBase + Math.round(85 / sheetNames.length),
    );
  }

  // --- 4. Generate PDF blob ---
  onProgress?.("Generating PDF...", 92);

  const pdfBlob = pdf.output("blob");
  const outputSize = pdfBlob.size;
  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const outputName = `${baseName}.pdf`;

  const conversionTimeMs = Math.round(performance.now() - startTime);

  onProgress?.("Conversion complete!", 100);

  return {
    file: {
      name: outputName,
      data: pdfBlob,
      size: outputSize,
    },
    stats: {
      originalSize: file.size,
      totalSheets: sheetNames.length,
      convertedSheets: sheetNames.length,
      totalRows,
      totalColumns,
      outputSize,
      conversionTimeMs,
    },
  };
}
