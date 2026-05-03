/**
 * PDF Text Extractor
 *
 * Reusable module for extracting raw text from PDF files.
 * Uses pdfjs-dist for client-side extraction — no server upload required.
 *
 * Worker script expected at `/pdf.worker.min.mjs` (served from `public/`).
 */

import type { TextItem } from "pdfjs-dist/types/src/display/api";

export interface ExtractionResult {
  /** Full concatenated text from all pages */
  text: string;
  /** Number of pages in the PDF */
  pageCount: number;
  /** Whether extraction was successful */
  success: boolean;
  /** Human-readable error message (null on success) */
  error: string | null;
}

/**
 * Extract all text from a PDF file using pdfjs-dist.
 *
 * @param file - A PDF `File` object selected by the user.
 * @returns An `ExtractionResult` with the full text, page count, and status.
 */
export async function extractTextFromPDF(file: File): Promise<ExtractionResult> {
  try {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
      useWorkerFetch: false,
    }).promise;

    const pageTexts: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      const pageText = textContent.items
        .filter((item): item is TextItem => "str" in item)
        .map((item) => item.str)
        .join(" ");

      pageTexts.push(pageText);
    }

    const text = pageTexts.join("\n\n");

    return {
      text,
      pageCount: pdf.numPages,
      success: true,
      error: null,
    };
  } catch (err) {
    return {
      text: "",
      pageCount: 0,
      success: false,
      error: err instanceof Error ? err.message : "Failed to extract text from PDF.",
    };
  }
}

/**
 * Validate a file before extraction.
 *
 * @param file - The file to validate.
 * @param maxSizeMB - Maximum allowed size in megabytes (default: 50).
 * @returns An error message, or `null` if the file is valid.
 */
export function validatePDFFile(file: File, maxSizeMB = 50): string | null {
  if (!file) return "No file selected.";
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    return "Please upload a valid PDF file.";
  }
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return `File is too large. Maximum size is ${maxSizeMB} MB.`;
  }
  return null;
}
