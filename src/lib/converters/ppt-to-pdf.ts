/**
 * PPT to PDF Converter for PdfCrux
 *
 * Parses PPTX files (which are ZIP archives containing XML) using JSZip,
 * extracts text content and images from each slide, and renders them
 * into a PDF document using jsPDF.
 *
 * Implementation strategy:
 *   1. Unzip the .pptx file with JSZip
 *   2. Parse slide XML files (ppt/slides/slideN.xml)
 *   3. Extract text from <a:t> elements with positional info
 *   4. Extract images from ppt/media/ folder
 *   5. Optionally extract speaker notes from ppt/notesSlides/
 *   6. Render each slide as a PDF page with positioned text
 *
 * All processing runs client-side in the browser — no server APIs.
 */

import JSZip from "jszip";
import jsPDF from "jspdf";

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
  totalSlides: number;
  convertedSlides: number;
  totalTextElements: number;
  totalImages: number;
  outputSize: number;
  conversionTimeMs: number;
}

export interface PptToPdfOptions {
  pageSize: "a4" | "letter" | "widescreen";
  includeNotes: boolean;
}

// ========================
// Internal types
// ========================

interface TextElement {
  text: string;
  x: number;       // EMU (English Metric Units) — 914400 per inch
  y: number;
  width: number;
  height: number;
  fontSize: number; // pt
  bold: boolean;
  italic: boolean;
}

interface SlideContent {
  index: number;
  texts: TextElement[];
  images: {
    name: string;
    data: Uint8Array;
    x: number;
    y: number;
    width: number;
    height: number;
    contentType: string;
  }[];
  notes?: string;
}

// ========================
// Constants
// ========================

// EMU (English Metric Units) conversion
const EMU_PER_INCH = 914400;
const EMU_PER_PT = 914400 / 72; // ≈ 12700
const EMU_PER_MM = 914400 / 25.4; // ≈ 36000

// PPTX default slide dimensions in EMU (10" × 7.5" for widescreen)
const WIDESCREEN_WIDTH_EMU = 12192000;  // 13.333 inches
const WIDESCREEN_HEIGHT_EMU = 6858000;  // 7.5 inches

// Page dimensions in mm
const PAGE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
  widescreen: { width: 254, height: 190.5 }, // 10" × 7.5" in mm (landscape ratio)
};

// ========================
// XML Helpers
// ========================

/**
 * Parse an XML string into a Document.
 */
function parseXml(xmlStr: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(xmlStr, "application/xml");
}

/**
 * Get direct child elements by local name (ignoring namespace).
 */
function getChildrenByTagName(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter(
    (el) => el.localName === localName,
  );
}

/**
 * Get all descendant elements by local name (ignoring namespace).
 */
function getDescendantsByTagName(parent: Element, localName: string): Element[] {
  const results: Element[] = [];
  const stack = Array.from(parent.children);
  while (stack.length > 0) {
    const el = stack.pop()!;
    if (el.localName === localName) {
      results.push(el);
    }
    // Push children in reverse to maintain document order
    for (let i = el.children.length - 1; i >= 0; i--) {
      stack.push(el.children[i]);
    }
  }
  return results;
}

/**
 * Extract a boolean attribute value (defaults to false).
 */
function attrBool(el: Element, name: string): boolean {
  return el.getAttribute(name) === "1" || el.getAttribute(name) === "true";
}

/**
 * Get the "type" attribute from an <a:rPr> element to determine bold/italic.
 * Checks for the `b` and `i` child elements.
 */
function getRunProperties(rPr: Element | null): { bold: boolean; italic: boolean; fontSize: number } {
  if (!rPr) return { bold: false, italic: false, fontSize: 18 };

  const bold = attrBool(rPr, "b") || getChildrenByTagName(rPr, "b").length > 0;
  const italic = attrBool(rPr, "i") || getChildrenByTagName(rPr, "i").length > 0;

  // sz attribute is in hundredths of a point
  const szAttr = rPr.getAttribute("sz");
  let fontSize = 18; // default ~18pt for body text
  if (szAttr) {
    fontSize = parseInt(szAttr, 10) / 100;
    if (isNaN(fontSize) || fontSize < 1) fontSize = 18;
  }

  return { bold, italic, fontSize };
}

/**
 * Convert EMU coordinates to mm.
 */
function emuToMm(emu: number): number {
  return emu / EMU_PER_MM;
}

// ========================
// Slide Parser
// ========================

/**
 * Parse a single slide XML file and extract text + image info.
 */
function parseSlideXml(
  slideXml: string,
  slideIndex: number,
  zip: JSZip,
  slideWidthEmu: number,
  slideHeightEmu: number,
): SlideContent {
  const doc = parseXml(slideXml);
  const texts: TextElement[] = [];
  const images: SlideContent["images"] = [];

  // Find all shape trees: <p:spTree> inside <p:cSld>
  const cSld = doc.getElementsByTagName("p:cSld");
  const spTrees: Element[] = [];
  for (let i = 0; i < cSld.length; i++) {
    const trees = getChildrenByTagName(cSld[i], "spTree");
    spTrees.push(...trees);
  }

  for (const spTree of spTrees) {
    // Process shapes (text containers)
    const shapes = getDescendantsByTagName(spTree, "sp");

    for (const shape of shapes) {
      const textFrames = getChildrenByTagName(shape, "txBody");

      for (const txBody of textFrames) {
        // Get shape position from the <p:spPr><a:xfrm> element
        const spPr = getChildrenByTagName(shape, "spPr")[0];
        let x = 0, y = 0, width = slideWidthEmu, height = slideHeightEmu;

        if (spPr) {
          const xfrm = getChildrenByTagName(spPr, "xfrm")[0];
          if (xfrm) {
            const off = getChildrenByTagName(xfrm, "off")[0];
            const ext = getChildrenByTagName(xfrm, "ext")[0];
            if (off) {
              x = parseInt(off.getAttribute("x") || "0", 10);
              y = parseInt(off.getAttribute("y") || "0", 10);
            }
            if (ext) {
              width = parseInt(ext.getAttribute("cx") || "0", 10);
              height = parseInt(ext.getAttribute("cy") || "0", 10);
            }
          }
        }

        // Get default text properties from <a:pPr> (paragraph properties)
        const paragraphs = getChildrenByTagName(txBody, "p");

        for (const para of paragraphs) {
          // Get default paragraph properties
          const pPr = getChildrenByTagName(para, "pPr")[0];
          let defaultFontSize = 18;
          let defaultBold = false;
          let defaultItalic = false;

          if (pPr) {
            const defRPr = getChildrenByTagName(pPr, "defRPr")[0];
            if (defRPr) {
              const props = getRunProperties(defRPr);
              defaultFontSize = props.fontSize;
              defaultBold = props.bold;
              defaultItalic = props.italic;
            }
          }

          // Collect text runs
          const runs = getChildrenByTagName(para, "r");
          let paraText = "";
          let paraFontSize = defaultFontSize;
          let paraBold = defaultBold;
          let paraItalic = defaultItalic;
          let hasText = false;

          for (const run of runs) {
            const rPr = getChildrenByTagName(run, "rPr")[0];
            const tElements = getChildrenByTagName(run, "t");

            const props = rPr ? getRunProperties(rPr) : { bold: defaultBold, italic: defaultItalic, fontSize: defaultFontSize };

            for (const t of tElements) {
              const txt = t.textContent || "";
              if (txt.trim()) {
                paraText += txt;
                hasText = true;
                // Use properties from the first non-empty run
                if (!paraText.trim() || paraText === txt.trim()) {
                  paraFontSize = props.fontSize;
                  paraBold = props.bold;
                  paraItalic = props.italic;
                }
              }
            }
          }

          // Also check for end paragraph run properties (<a:endParaRPr>)
          const endRPr = getChildrenByTagName(para, "endParaRPr")[0];
          if (endRPr) {
            const props = getRunProperties(endRPr);
            if (props.fontSize > 0) paraFontSize = props.fontSize;
          }

          // Only add non-empty text
          if (hasText && paraText.trim()) {
            texts.push({
              text: paraText.trim(),
              x,
              y,
              width,
              height,
              fontSize: paraFontSize,
              bold: paraBold,
              italic: paraItalic,
            });
          }
        }
      }
    }

    // Process picture elements (images)
    const pictures = getDescendantsByTagName(spTree, "pic");

    for (const pic of pictures) {
      const blipFill = getChildrenByTagName(pic, "blipFill")[0];
      const xfrm = (() => {
        const spPr = getChildrenByTagName(pic, "spPr")[0];
        if (spPr) return getChildrenByTagName(spPr, "xfrm")[0];
        return null;
      })();

      if (!blipFill || !xfrm) continue;

      // Get image reference from <a:blip r:embed="rIdN">
      const blip = getChildrenByTagName(blipFill, "blip")[0];
      if (!blip) continue;

      // The embed attribute references a relationship ID like "rId2"
      // We need to look up the relationships file to find the actual image path
      const embedId = blip.getAttribute("r:embed") || blip.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "embed",
      );

      if (!embedId) continue;

      // Parse the slide relationships file to find image path
      const relsPath = `ppt/slides/_rels/slide${slideIndex + 1}.xml.rels`;
      const relsFile = zip.file(relsPath);
      if (!relsFile) continue;

      // We'll resolve relationships later — for now just record the ref
      // Store a placeholder; we'll resolve it after
      const off = getChildrenByTagName(xfrm, "off")[0];
      const ext = getChildrenByTagName(xfrm, "ext")[0];

      const imgX = off ? parseInt(off.getAttribute("x") || "0", 10) : 0;
      const imgY = off ? parseInt(off.getAttribute("y") || "0", 10) : 0;
      const imgW = ext ? parseInt(ext.getAttribute("cx") || "0", 10) : 0;
      const imgH = ext ? parseInt(ext.getAttribute("cy") || "0", 10) : 0;

      images.push({
        name: embedId,
        data: new Uint8Array(0), // placeholder
        x: imgX,
        y: imgY,
        width: imgW,
        height: imgH,
        contentType: "image/png", // will be resolved later
      });
    }
  }

  return { index: slideIndex, texts, images };
}

/**
 * Resolve image references using relationship files and load image data.
 */
async function resolveSlideImages(
  slide: SlideContent,
  zip: JSZip,
): Promise<void> {
  if (slide.images.length === 0) return;

  const relsPath = `ppt/slides/_rels/slide${slide.index + 1}.xml.rels`;
  const relsFile = zip.file(relsPath);
  if (!relsFile) return;

  const relsXml = await relsFile.async("text");
  const relsDoc = parseXml(relsXml);

  // Build a map of relationship ID → target path
  const relsMap = new Map<string, string>();
  const relationships = relsDoc.getElementsByTagName("Relationship");
  for (let i = 0; i < relationships.length; i++) {
    const rel = relationships[i];
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    const type = rel.getAttribute("Type") || "";
    if (id && target && type.includes("image")) {
      // Target is relative to ppt/slides/, so prepend ppt/ if needed
      const fullPath = target.startsWith("../")
        ? "ppt/" + target.replace("../", "")
        : "ppt/slides/" + target;
      relsMap.set(id, fullPath);
    }
  }

  // Resolve each image
  for (const img of slide.images) {
    const targetPath = relsMap.get(img.name);
    if (!targetPath) continue;

    // Try multiple possible paths
    let imgFile = zip.file(targetPath);
    if (!imgFile) {
      imgFile = zip.file("ppt/" + targetPath.replace("ppt/", ""));
    }
    if (!imgFile) {
      // Try matching by filename
      const imgFileName = targetPath.split("/").pop();
      const mediaFiles = Object.keys(zip.files).filter(
        (f) => f.endsWith(imgFileName || "notfound"),
      );
      if (mediaFiles.length > 0) {
        imgFile = zip.file(mediaFiles[0]);
      }
    }

    if (imgFile) {
      img.data = await imgFile.async("uint8array");

      // Determine content type from extension
      const path = targetPath.toLowerCase();
      if (path.endsWith(".png")) img.contentType = "image/png";
      else if (path.endsWith(".jpg") || path.endsWith(".jpeg")) img.contentType = "image/jpeg";
      else if (path.endsWith(".gif")) img.contentType = "image/gif";
      else if (path.endsWith(".svg")) img.contentType = "image/svg+xml";
      else if (path.endsWith(".bmp")) img.contentType = "image/bmp";
      else if (path.endsWith(".webp")) img.contentType = "image/webp";
    }
  }
}

/**
 * Extract speaker notes for a given slide.
 */
async function extractSpeakerNotes(
  slideIndex: number,
  zip: JSZip,
): Promise<string> {
  const notesPath = `ppt/notesSlides/notesSlide${slideIndex + 1}.xml`;
  const notesFile = zip.file(notesPath);
  if (!notesFile) return "";

  try {
    const notesXml = await notesFile.async("text");
    const doc = parseXml(notesXml);

    // Get all text elements within <p:txBody>
    const texts = doc.getElementsByTagName("a:t");
    const parts: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const txt = texts[i].textContent?.trim();
      if (txt) parts.push(txt);
    }

    return parts.join(" ").trim();
  } catch {
    return "";
  }
}

// ========================
// PDF Renderer
// ========================

/**
 * Render all parsed slides into a PDF document.
 */
function renderSlidesToPdf(
  slides: SlideContent[],
  pageSize: string,
  includeNotes: boolean,
  slideWidthEmu: number,
  slideHeightEmu: number,
): jsPDF {
  // Determine PDF dimensions based on page size
  const dims = PAGE_DIMENSIONS[pageSize] ?? PAGE_DIMENSIONS["widescreen"];
  const isWidescreen = pageSize === "widescreen";

  const pdf = new jsPDF({
    orientation: isWidescreen ? "l" : "p",
    unit: "mm",
    format: isWidescreen ? [dims.width, dims.height] : (pageSize === "a4" ? "a4" : "letter"),
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const marginMm = 10;
  const usableWidth = pdfWidth - marginMm * 2;
  const usableHeight = pdfHeight - marginMm * 2;

  // Calculate scale factors from EMU slide space to PDF mm space
  const scaleX = usableWidth / (slideWidthEmu / EMU_PER_MM);
  const scaleY = usableHeight / (slideHeightEmu / EMU_PER_MM);

  for (let si = 0; si < slides.length; si++) {
    const slide = slides[si];

    if (si > 0) {
      pdf.addPage();
    }

    // --- Draw slide number header ---
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(160);
    pdf.text(`Slide ${si + 1} of ${slides.length}`, marginMm, marginMm - 3);
    pdf.setTextColor(0);

    // --- Draw images first (as background) ---
    for (const img of slide.images) {
      if (img.data.length === 0) continue;

      // Convert EMU position to PDF mm
      const imgXmm = marginMm + (img.x / EMU_PER_MM) * scaleX;
      const imgYmm = marginMm + (img.y / EMU_PER_MM) * scaleY;
      const imgWmm = (img.width / EMU_PER_MM) * scaleX;
      const imgHmm = (img.height / EMU_PER_MM) * scaleY;

      // Try to add image to PDF (only PNG and JPEG supported by jsPDF)
      try {
        if (img.contentType === "image/png") {
          pdf.addImage(img.data, "PNG", imgXmm, imgYmm, imgWmm, imgHmm);
        } else if (img.contentType === "image/jpeg") {
          pdf.addImage(img.data, "JPEG", imgXmm, imgYmm, imgWmm, imgHmm);
        }
        // Other formats (GIF, SVG, BMP, WebP) are not directly supported by jsPDF
      } catch {
        // Skip images that fail to render
      }
    }

    // --- Draw text elements ---
    for (const text of slide.texts) {
      // Convert EMU position to PDF mm
      const textXmm = marginMm + (text.x / EMU_PER_MM) * scaleX;
      const textYmm = marginMm + (text.y / EMU_PER_MM) * scaleY;
      const textWmm = (text.width / EMU_PER_MM) * scaleX;
      const textHmm = (text.height / EMU_PER_MM) * scaleY;

      // Scale font size proportionally
      const scaledFontSize = text.fontSize * Math.min(scaleX, scaleY, 1.2);
      const clampedFontSize = Math.max(6, Math.min(scaledFontSize, 36));

      pdf.setFontSize(clampedFontSize);
      const fontStyle = text.bold && text.italic
        ? "bolditalic"
        : text.bold
          ? "bold"
          : text.italic
            ? "italic"
            : "normal";
      pdf.setFont("helvetica", fontStyle);

      // Word-wrap text within the text box
      const lines = pdf.splitTextToSize(text.text, textWmm);

      // Calculate actual line height based on font size
      const lineHeight = clampedFontSize * 0.35;

      // Vertical centering within the text box
      const totalTextHeight = lines.length * lineHeight;
      let startY = textYmm + (textHmm - totalTextHeight) / 2 + clampedFontSize * 0.3;

      // Clamp to page bounds
      if (startY < marginMm) startY = marginMm;
      if (startY + totalTextHeight > pdfHeight - marginMm) {
        startY = Math.max(marginMm, pdfHeight - marginMm - totalTextHeight);
      }

      pdf.text(lines, textXmm, startY);
    }

    // --- Draw speaker notes at bottom if requested ---
    if (includeNotes && slide.notes) {
      const notesFontSize = 7;
      pdf.setFontSize(notesFontSize);
      pdf.setFont("helvetica", "italic");
      pdf.setTextColor(100);

      // Split notes into lines that fit in the available width
      const notesLines = pdf.splitTextToSize(
        `Notes: ${slide.notes}`,
        usableWidth,
      );

      // Draw notes at the bottom of the page
      const notesAreaHeight = 15; // mm reserved for notes
      const notesStartY = pdfHeight - marginMm - notesAreaHeight;

      // Add a subtle separator line
      pdf.setDrawColor(200);
      pdf.setLineWidth(0.3);
      pdf.line(marginMm, notesStartY - 2, pdfWidth - marginMm, notesStartY - 2);

      // Clip notes to available space
      const maxNotesLines = Math.floor(notesAreaHeight / (notesFontSize * 0.35));
      const truncatedLines = notesLines.slice(0, maxNotesLines);
      if (notesLines.length > maxNotesLines) {
        truncatedLines.push("...");
      }

      pdf.text(truncatedLines, marginMm, notesStartY + 3);
      pdf.setTextColor(0);
    }
  }

  return pdf;
}

// ========================
// Main Converter
// ========================

/**
 * Converts a PPTX file to a PDF.
 *
 * Each slide becomes a PDF page with extracted text and images.
 * Speaker notes can optionally be included at the bottom of each page.
 */
export async function convertPptToPdf(
  file: File,
  options: PptToPdfOptions,
  onProgress?: (status: string, percent: number) => void,
): Promise<{ file: OutputFile; stats: ConversionStats }> {
  const startTime = performance.now();

  onProgress?.("Reading PPTX file...", 2);

  // --- 1. Read and unzip the PPTX file ---
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  onProgress?.("Extracting slide content...", 5);

  // --- 2. Discover slide files ---
  // Slides are in ppt/slides/slide1.xml, slide2.xml, etc.
  const slideFiles: { filename: string; index: number }[] = [];
  zip.forEach((relativePath, zipEntry) => {
    const match = relativePath.match(/^ppt\/slides\/slide(\d+)\.xml$/);
    if (match && !zipEntry.dir) {
      const index = parseInt(match[1], 10);
      slideFiles.push({ filename: relativePath, index });
    }
  });

  // Sort by slide number
  slideFiles.sort((a, b) => a.index - b.index);

  if (slideFiles.length === 0) {
    throw new Error("No slides found in the PPTX file.");
  }

  onProgress?.(`Found ${slideFiles.length} slide(s)`, 8);

  // --- 3. Determine slide dimensions from presentation.xml ---
  let slideWidthEmu = WIDESCREEN_WIDTH_EMU;
  let slideHeightEmu = WIDESCREEN_HEIGHT_EMU;

  const presXml = zip.file("ppt/presentation.xml");
  if (presXml) {
    try {
      const presContent = await presXml.async("text");
      const presDoc = parseXml(presContent);
      const sldSz = presDoc.getElementsByTagName("p:sldSz")[0];
      if (sldSz) {
        const cx = sldSz.getAttribute("cx");
        const cy = sldSz.getAttribute("cy");
        if (cx) slideWidthEmu = parseInt(cx, 10);
        if (cy) slideHeightEmu = parseInt(cy, 10);
      }
    } catch {
      // Use default dimensions
    }
  }

  // --- 4. Parse each slide ---
  const slides: SlideContent[] = [];
  let totalTextElements = 0;
  let totalImages = 0;

  for (let i = 0; i < slideFiles.length; i++) {
    const { filename, index } = slideFiles[i];
    const percentBase = Math.round(8 + (i / slideFiles.length) * 60);

    onProgress?.(
      `Parsing slide ${i + 1} of ${slideFiles.length}...`,
      percentBase,
    );

    const slideFile = zip.file(filename);
    if (!slideFile) continue;

    const slideXml = await slideFile.async("text");
    const slideContent = parseSlideXml(slideXml, index, zip, slideWidthEmu, slideHeightEmu);

    // Resolve image references
    await resolveSlideImages(slideContent, zip);

    // Extract speaker notes if requested
    if (options.includeNotes) {
      slideContent.notes = await extractSpeakerNotes(index, zip);
    }

    totalTextElements += slideContent.texts.length;
    totalImages += slideContent.images.filter((img) => img.data.length > 0).length;

    slides.push(slideContent);

    onProgress?.(
      `Slide ${i + 1} parsed (${slideContent.texts.length} text blocks, ${slideContent.images.length} images)`,
      percentBase + Math.round(60 / slideFiles.length),
    );
  }

  if (slides.length === 0) {
    throw new Error("Could not parse any slides from the PPTX file.");
  }

  // --- 5. Render slides to PDF ---
  onProgress?.("Rendering slides to PDF...", 72);

  const pdf = renderSlidesToPdf(slides, options.pageSize, options.includeNotes, slideWidthEmu, slideHeightEmu);

  onProgress?.("Generating PDF file...", 90);

  // --- 6. Output the PDF ---
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
      totalSlides: slideFiles.length,
      convertedSlides: slides.length,
      totalTextElements,
      totalImages,
      outputSize,
      conversionTimeMs,
    },
  };
}
