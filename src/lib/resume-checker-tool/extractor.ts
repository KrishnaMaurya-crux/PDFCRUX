/**
 * Resume Checker Tool — Text Extraction
 *
 * Extracts text from a PDF file using pdfjs-dist.
 * Reuses the same extraction logic as the legacy module.
 */

import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { ExtractionResult } from "./types";

/**
 * Extract full text from a PDF file.
 *
 * @param file - The user-uploaded PDF file.
 * @returns An ExtractionResult with text, page count, and status.
 */
export async function extractText(file: File): Promise<ExtractionResult> {
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
      success: true,
      text,
      pageCount: pdf.numPages,
    };
  } catch (err) {
    return {
      success: false,
      text: "",
      pageCount: 0,
      error:
        err instanceof Error
          ? err.message
          : "Failed to extract text from PDF.",
    };
  }
}

/**
 * Validate a PDF file before processing.
 *
 * @param file - The file to validate.
 * @param maxMB - Maximum allowed file size in MB.
 * @returns An error message string, or null if valid.
 */
export function validateResumeFile(
  file: File,
  maxMB: number = 10
): string | null {
  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    return "Please upload a PDF file.";
  }
  const maxSizeBytes = maxMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return `File is too large. Maximum size is ${maxMB} MB.`;
  }
  return null;
}
