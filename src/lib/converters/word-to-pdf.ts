/**
 * Word (DOCX) to PDF Converter
 *
 * Uses mammoth to parse DOCX into HTML, html2canvas-pro to render the HTML
 * as a high-fidelity canvas, and jsPDF to produce a paginated PDF.
 *
 * Runs entirely client-side in the browser.
 */

import mammoth from "mammoth";
import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OutputFile {
  name: string;
  data: Uint8Array;
  size: number;
}

export interface ConversionStats {
  inputSize: number;
  outputPages: number;
  outputSize: number;
  elapsedMs: number;
  imagesExtracted: number;
}

// ---------------------------------------------------------------------------
// Page-size constants
// ---------------------------------------------------------------------------

const PAGE_SIZES_MM: Record<string, [number, number]> = {
  a4: [210, 297],
  letter: [215.9, 279.4],
  legal: [215.9, 355.6],
};

const MM_TO_PT = 2.83465;
const MM_TO_PX = 3.7795275591; // 1 mm ≈ 3.78 px at 96 DPI

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Resolve [pageWidth, pageHeight] in mm based on size + orientation. */
function resolvePageSize(
  pageSize: string,
  orientation: "portrait" | "landscape",
): [number, number] {
  const [w, h] = PAGE_SIZES_MM[pageSize] ?? PAGE_SIZES_MM["a4"];
  return orientation === "landscape" ? [h, w] : [w, h];
}

// ---------------------------------------------------------------------------
// HTML enhancement
// ---------------------------------------------------------------------------

/**
 * Post-process the HTML from mammoth to improve PDF rendering:
 * - Preserve hyperlinks (mammoth does this by default, but we ensure <a> styling)
 * - Add base styling for consistent rendering
 * - Handle images with proper sizing
 */
function enhanceHtml(rawHtml: string): string {
  // Wrap in a content container with base styles
  const wrappedHtml = `
    <div class="word-content">
      ${rawHtml}
    </div>
  `;
  return wrappedHtml;
}

/**
 * Inject the styling into the container so html2canvas renders it correctly.
 */
function injectStyles(container: HTMLElement, pageWidthMm: number, marginMm: number): void {
  const contentWidthPx = (pageWidthMm - marginMm * 2) * MM_TO_PX;

  container.innerHTML = `
    <style>
      .word-content {
        width: ${contentWidthPx}px;
        font-family: 'Times New Roman', 'Georgia', 'SimSun', serif;
        font-size: 12pt;
        line-height: 1.6;
        color: #000000;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      .word-content h1 {
        font-size: 24pt;
        font-weight: bold;
        margin: 12pt 0 6pt 0;
      }
      .word-content h2 {
        font-size: 18pt;
        font-weight: bold;
        margin: 10pt 0 5pt 0;
      }
      .word-content h3 {
        font-size: 14pt;
        font-weight: bold;
        margin: 8pt 0 4pt 0;
      }
      .word-content h4 {
        font-size: 12pt;
        font-weight: bold;
        margin: 6pt 0 3pt 0;
      }
      .word-content p {
        margin: 4pt 0;
      }
      .word-content ul, .word-content ol {
        margin: 6pt 0;
        padding-left: 24pt;
      }
      .word-content li {
        margin: 2pt 0;
      }
      .word-content table {
        border-collapse: collapse;
        width: 100%;
        margin: 8pt 0;
      }
      .word-content table td, .word-content table th {
        border: 1px solid #cccccc;
        padding: 4pt 6pt;
        vertical-align: top;
      }
      .word-content table th {
        background-color: #f0f0f0;
        font-weight: bold;
      }
      .word-content img {
        max-width: 100%;
        height: auto;
      }
      .word-content a {
        color: #0563C1;
        text-decoration: underline;
      }
      .word-content strong, .word-content b {
        font-weight: bold;
      }
      .word-content em, .word-content i {
        font-style: italic;
      }
      .word-content sup, .word-content sub {
        font-size: 0.75em;
      }
      .word-content blockquote {
        border-left: 3px solid #cccccc;
        padding-left: 12pt;
        margin: 8pt 0;
        color: #555555;
      }
    </style>
  ` + container.innerHTML;
}

// ---------------------------------------------------------------------------
// Main converter
// ---------------------------------------------------------------------------

/**
 * Convert a Word (DOCX) file to PDF.
 *
 * @param file        - The DOCX file to convert.
 * @param options     - Page size, orientation, and margin.
 * @param onProgress  - Optional progress callback `(status, percent)`.
 * @returns An object with the output file and conversion statistics.
 */
export async function convertWordToPdf(
  file: File,
  options: {
    pageSize: "a4" | "letter" | "legal";
    orientation: "portrait" | "landscape";
    margin: number; // mm
  },
  onProgress?: (status: string, percent: number) => void,
): Promise<{ file: OutputFile; stats: ConversionStats }> {
  const startTime = performance.now();
  const baseName = file.name.replace(/\.[^/.]+$/, "");

  // ── Step 1: Read the DOCX file ──────────────────────────────────────
  onProgress?.("Reading document...", 5);

  const arrayBuffer = await file.arrayBuffer();
  const inputSize = file.size;

  // ── Step 2: Convert DOCX → HTML with mammoth ────────────────────────
  onProgress?.("Converting to HTML...", 10);

  const mammothResult = await mammoth.convertToHtml({ arrayBuffer });
  const rawHtml = mammothResult.value;

  // Count warnings for stats
  const warnings = mammothResult.messages ?? [];

  // Count images extracted from mammoth messages
  const imagesExtracted = warnings.filter(
    (m: { type: string; message: string }) => m.type === "warning" && m.message.toLowerCase().includes("image"),
  ).length;

  if (rawHtml.trim().length === 0) {
    throw new Error(
      "Could not extract any content from the DOCX file. The file may be empty or corrupted.",
    );
  }

  const enhancedHtml = enhanceHtml(rawHtml);

  onProgress?.("Rendering pages...", 20);

  // ── Step 3: Create temporary DOM container & render ─────────────────
  const [pageWidthMm, pageHeightMm] = resolvePageSize(
    options.pageSize,
    options.orientation,
  );

  // Create an off-screen container for rendering
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.zIndex = "-1";
  container.style.backgroundColor = "#ffffff";
  container.style.overflow = "visible";

  // Set the container width to the page content width (page width minus margins)
  const contentWidthMm = pageWidthMm - options.margin * 2;
  const contentWidthPx = contentWidthMm * MM_TO_PX;
  container.style.width = `${contentWidthPx}px`;
  container.style.padding = "0";

  // Inject HTML and styles
  container.innerHTML = enhancedHtml;
  injectStyles(container, pageWidthMm, options.margin);

  // Attach to DOM so html2canvas can render it
  document.body.appendChild(container);

  try {
    // ── Step 4: Render with html2canvas at 2× scale ───────────────────
    onProgress?.("Rendering content to canvas...", 30);

    // Wait a tick for styles to apply and images to load
    await new Promise((resolve) => setTimeout(resolve, 200));

    const canvas = await html2canvas(container, {
      scale: 2, // 2× for high quality
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      // Match the container width precisely
      width: contentWidthPx,
      windowWidth: contentWidthPx,
    });

    onProgress?.("Generating PDF pages...", 60);

    // ── Step 5: Create PDF and split into pages ────────────────────────
    const pageWidthPt = pageWidthMm * MM_TO_PT;
    const pageHeightPt = pageHeightMm * MM_TO_PT;
    const marginPt = options.margin * MM_TO_PT;

    // Available content area in points
    const contentWidthPt = pageWidthPt - marginPt * 2;
    const contentHeightPt = pageHeightPt - marginPt * 2;

    // Calculate the scale from canvas pixels to PDF points
    // Canvas is 2× the container, and container is in px; we need to map to pt
    const canvasContentWidthPx = canvas.width;
    const scaleToPt = contentWidthPt / canvasContentWidthPx;

    // How tall (in canvas pixels) each page's content area is
    const pageContentCanvasHeight = contentHeightPt / scaleToPt;

    // Total rendered height in canvas pixels
    const totalCanvasHeight = canvas.height;

    // Number of pages needed
    const totalPages = Math.max(
      1,
      Math.ceil(totalCanvasHeight / pageContentCanvasHeight),
    );

    // Create jsPDF instance
    const pdf = new jsPDF({
      orientation: options.orientation === "landscape" ? "l" : "p",
      unit: "pt",
      format: [pageWidthPt, pageHeightPt],
    });

    // ── Step 6: Slice canvas and add pages ────────────────────────────
    for (let page = 0; page < totalPages; page++) {
      if (page > 0) {
        pdf.addPage([pageWidthPt, pageHeightPt], options.orientation === "landscape" ? "l" : "p");
      }

      const sourceY = page * pageContentCanvasHeight;
      const sliceHeight = Math.min(pageContentCanvasHeight, totalCanvasHeight - sourceY);

      if (sliceHeight <= 0) continue;

      // Create a sub-canvas for this page slice
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = Math.max(1, Math.round(sliceHeight));
      const sliceCtx = sliceCanvas.getContext("2d")!;

      // Fill with white background
      sliceCtx.fillStyle = "#ffffff";
      sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);

      // Draw the slice from the full canvas
      sliceCtx.drawImage(
        canvas,
        0, Math.round(sourceY), canvas.width, Math.round(sliceHeight), // source
        0, 0, canvas.width, Math.round(sliceHeight), // destination
      );

      // Convert to data URL and add to PDF
      const imgData = sliceCanvas.toDataURL("image/jpeg", 0.92);

      // Calculate destination dimensions in PDF points
      const destWidthPt = contentWidthPt;
      const destHeightPt = sliceHeight * scaleToPt;

      pdf.addImage(imgData, "JPEG", marginPt, marginPt, destWidthPt, destHeightPt);

      const progressPercent = 60 + Math.round((40 * (page + 1)) / totalPages);
      onProgress?.(
        `Processing page ${page + 1} of ${totalPages}...`,
        Math.min(progressPercent, 95),
      );
    }

    // ── Step 7: Generate PDF bytes ─────────────────────────────────────
    onProgress?.("Generating PDF...", 96);

    const pdfBlob = pdf.output("arraybuffer");
    const pdfUint8 = new Uint8Array(pdfBlob);
    const outputSize = pdfUint8.length;

    onProgress?.("Finalizing...", 98);

    const elapsedMs = Math.round(performance.now() - startTime);
    const outputFileName = `${baseName}.pdf`;

    onProgress?.(
      `Done! Converted ${totalPages} pages (${formatBytes(outputSize)}) in ${(elapsedMs / 1000).toFixed(1)}s`,
      100,
    );

    return {
      file: {
        name: outputFileName,
        data: pdfUint8,
        size: outputSize,
      },
      stats: {
        inputSize,
        outputPages: totalPages,
        outputSize,
        elapsedMs,
        imagesExtracted,
      },
    };
  } finally {
    // ── Cleanup: remove temporary DOM elements ─────────────────────────
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}
