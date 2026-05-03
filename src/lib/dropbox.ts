/**
 * Dropbox Integration — Import files from user's Dropbox
 *
 * Uses Dropbox Chooser API (client-side) + Dropbox API v2 for download
 * Requires: DROPBOX_ACCESS_TOKEN
 *
 * Flow:
 * 1. Client opens Dropbox Chooser
 * 2. User selects file(s)
 * 3. Client gets download links
 * 4. Server fetches files via Dropbox API
 * 5. Files are processed locally
 */

import { env } from "@/lib/env";

export interface DropboxFile {
  name: string;
  size: number;
  link: string;
  isDir: boolean;
}

export interface ImportedFile {
  name: string;
  data: ArrayBuffer;
  mimeType: string;
  size: number;
}

/**
 * Load Dropbox Chooser API script dynamically
 */
export function loadDropboxChooser(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Not in browser"));

    // Check if already loaded
    if ((window as Record<string, unknown>).Dropbox) {
      return resolve();
    }

    if (!env.dropbox.isConfigured) {
      return reject(new Error("Dropbox is not configured. Missing app key."));
    }

    const script = document.createElement("script");
    script.src = "https://www.dropbox.com/static/api/2/dropins.js";
    script.id = "dropboxjs";
    script.setAttribute("data-app-key", env.dropbox.appKey);
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Dropbox Chooser"));
    document.head.appendChild(script);
  });
}

/**
 * Open Dropbox Chooser for PDF file selection
 * Returns selected files with download links
 */
export async function openDropboxChooser(): Promise<DropboxFile[]> {
  return new Promise((resolve, reject) => {
    if (!env.dropbox.isConfigured) {
      return reject(new Error("Dropbox is not configured"));
    }

    // Set up the Dropbox Chooser options
    const options = {
      success: (files: DropboxFile[]) => {
        const pdfFiles = files.filter(
          (f) =>
            f.name.toLowerCase().endsWith(".pdf") && !f.isDir
        );
        if (pdfFiles.length > 0) {
          resolve(pdfFiles);
        } else {
          reject(new Error("No PDF files selected"));
        }
      },
      cancel: () => {
        reject(new Error("Dropbox selection cancelled"));
      },
      error: () => {
        reject(new Error("Dropbox chooser error"));
      },
      linkType: "direct", // Direct download links
      multiselect: true, // Allow multiple file selection
      extensions: [".pdf"], // Only PDF files
    };

    // Create a temporary button to trigger the chooser
    // Dropbox Chooser attaches to a DOM element
    const button = document.createElement("button");
    button.style.display = "none";
    document.body.appendChild(button);

    (window as Record<string, Record<string, (btn: HTMLElement, opts: Record<string, unknown>) => void>>)
      .Dropbox?.choose(button, options);
  });
}

/**
 * Download a file from Dropbox using direct link
 */
export async function downloadDropboxFile(link: string, fileName: string): Promise<ImportedFile> {
  // Dropbox direct links can be used with ?dl=1 for download
  const downloadUrl = link.includes("?dl=1") ? link : `${link}?dl=1`;

  const response = await fetch(downloadUrl);

  if (!response.ok) {
    throw new Error(`Failed to download from Dropbox: ${response.statusText}`);
  }

  const data = await response.arrayBuffer();

  return {
    name: fileName || "dropbox_file.pdf",
    data,
    mimeType: "application/pdf",
    size: data.byteLength,
  };
}

export const isDropboxReady = env.dropbox.isConfigured;

/** Dropbox app key for Chooser initialization */
export const dropboxAppKey = env.dropbox.appKey;
