// Unique configuration for every PDF tool
// Each tool has its own options, processing steps, and UI behavior

export type OptionType =
  | "select"
  | "input"
  | "toggle"
  | "slider"
  | "password"
  | "radio"
  | "textarea"
  | "color-picker"
  | "page-range";

export type OptionDef = {
  id: string;
  label: string;
  type: OptionType;
  placeholder?: string;
  defaultValue: string | number | boolean;
  options?: { label: string; value: string; description?: string }[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  required?: boolean;
  hint?: string;
};

export type ToolConfig = {
  id: string;
  // Unique upload area text
  uploadTitle: string;
  uploadSubtitle: string;
  uploadIcon?: "merge" | "split" | "lock" | "unlock" | "sign" | "compare";
  // Show this BEFORE processing
  options: OptionDef[];
  // Processing step descriptions
  processingSteps: string[];
  // Custom button text
  processButtonText: string;
  // Output description
  outputDescription: string;
  // Output file extension
  outputExtension: string;
  // Multiple output files? (e.g. split)
  multipleOutput?: boolean;
  // Output label
  outputLabel?: string;
  // Special: two separate upload areas
  dualUpload?: boolean;
  dualUploadLabels?: [string, string];
};

export const toolConfigs: Record<string, ToolConfig> = {
  // ========================
  // INVOICE GENERATOR (custom UI — handled by InvoiceGenerator.tsx)
  // ========================
  "invoice-generator": {
    id: "invoice-generator",
    uploadTitle: "Build Your Invoice",
    uploadSubtitle: "Create professional invoices from scratch or upload existing PDFs.",
    options: [],
    processingSteps: ["Generating invoice...", "Building PDF layout...", "Adding your details...", "Finalizing PDF..."],
    processButtonText: "Download Invoice PDF",
    outputDescription: "Your professional invoice has been created.",
    outputExtension: ".pdf",
  },

  // ========================
  // ORGANIZE PDF
  // ========================
  "merge-pdf": {
    id: "merge-pdf",
    uploadTitle: "Select PDF files to merge",
    uploadSubtitle: "Combine multiple PDFs into one. Add files in the order you want them merged.",
    uploadIcon: "merge",
    options: [
      {
        id: "merge-mode",
        label: "Merge Mode",
        type: "radio",
        defaultValue: "sequential",
        options: [
          { label: "Sequential (all pages)", value: "sequential", description: "Merge all pages from each file in order" },
          { label: "Alternate pages", value: "alternate", description: "Interleave pages from each PDF" },
          { label: "Select pages per file", value: "custom", description: "Choose specific page ranges from each file" },
        ],
      },
    ],
    processingSteps: ["Reading PDF files...", "Merging pages together...", "Generating combined PDF..."],
    processButtonText: "Merge PDF Files",
    outputDescription: "Your PDFs have been merged into a single document.",
    outputExtension: ".pdf",
  },

  "split-pdf": {
    id: "split-pdf",
    uploadTitle: "Select PDF to split",
    uploadSubtitle: "Separate your PDF into individual pages or custom ranges.",
    uploadIcon: "split",
    options: [
      {
        id: "split-mode",
        label: "Split Mode",
        type: "radio",
        defaultValue: "all",
        options: [
          { label: "All pages (each page = 1 file)", value: "all", description: "Extract every page as a separate PDF" },
          { label: "By page ranges", value: "ranges", description: "Define custom ranges (e.g. 1-3, 5-7, 10)" },
          { label: "Extract specific pages", value: "extract", description: "Pick individual pages to extract" },
          { label: "Split by fixed interval", value: "interval", description: "Split every N pages" },
          { label: "By file size", value: "size", description: "Split into chunks under a max file size" },
        ],
      },
      {
        id: "page-ranges",
        label: "Page Ranges",
        type: "input",
        placeholder: "e.g. 1-3, 5-7, 10-12",
        defaultValue: "",
        hint: "Enter comma-separated ranges. Only needed for 'By page ranges' mode.",
      },
      {
        id: "interval",
        label: "Pages per split",
        type: "slider",
        defaultValue: 5,
        min: 1,
        max: 50,
        step: 1,
        unit: "pages",
        hint: "How many pages per output file.",
      },
      {
        id: "max-size",
        label: "Max file size",
        type: "select",
        defaultValue: "1mb",
        options: [
          { label: "1 MB", value: "1mb" },
          { label: "2 MB", value: "2mb" },
          { label: "5 MB", value: "5mb" },
          { label: "10 MB", value: "10mb" },
        ],
        hint: "Maximum size per output file.",
      },
    ],
    processingSteps: ["Analyzing PDF structure...", "Splitting pages...", "Creating individual PDFs..."],
    processButtonText: "Split PDF",
    outputDescription: "Your PDF has been split into multiple files.",
    outputExtension: ".pdf",
    multipleOutput: true,
    outputLabel: "Download All as ZIP",
  },

  "rotate-pdf": {
    id: "rotate-pdf",
    uploadTitle: "Select PDF to rotate",
    uploadSubtitle: "Fix the orientation of your PDF pages.",
    options: [
      {
        id: "rotation",
        label: "Rotation Angle",
        type: "radio",
        defaultValue: "90",
        options: [
          { label: "90° Clockwise", value: "90", description: "Rotate pages quarter turn right" },
          { label: "180°", value: "180", description: "Rotate pages upside down" },
          { label: "270° Clockwise", value: "270", description: "Rotate pages quarter turn left" },
        ],
      },
      {
        id: "apply-to",
        label: "Apply To",
        type: "radio",
        defaultValue: "all",
        options: [
          { label: "All Pages", value: "all" },
          { label: "Specific Pages Only", value: "specific" },
          { label: "Even Pages Only", value: "even" },
          { label: "Odd Pages Only", value: "odd" },
          { label: "Landscape Pages", value: "landscape" },
          { label: "Portrait Pages", value: "portrait" },
        ],
      },
      {
        id: "page-range",
        label: "Page Range",
        type: "input",
        placeholder: "e.g. 1-5, 8, 10-12",
        defaultValue: "",
        hint: "Only needed when 'Specific Pages Only' is selected.",
      },
    ],
    processingSteps: ["Reading page orientations...", "Applying rotation...", "Saving rotated PDF..."],
    processButtonText: "Rotate PDF",
    outputDescription: "Your PDF pages have been rotated successfully.",
    outputExtension: ".pdf",
  },

  "page-numbers": {
    id: "page-numbers",
    uploadTitle: "Select PDF to add page numbers",
    uploadSubtitle: "Insert professional page numbers to your document.",
    options: [
      {
        id: "format",
        label: "Number Format",
        type: "select",
        defaultValue: "numeric",
        options: [
          { label: "1, 2, 3...", value: "numeric" },
          { label: "Page 1, Page 2...", value: "page-prefix" },
          { label: "- 1 -, - 2 -...", value: "dashed" },
          { label: "i, ii, iii...", value: "roman-lower" },
          { label: "I, II, III...", value: "roman-upper" },
          { label: "a, b, c...", value: "alpha-lower" },
          { label: "A, B, C...", value: "alpha-upper" },
          { label: "of X (e.g. Page 1 of 10)", value: "of-total" },
        ],
      },
      {
        id: "position",
        label: "Position",
        type: "radio",
        defaultValue: "bottom-center",
        options: [
          { label: "Bottom Center", value: "bottom-center" },
          { label: "Bottom Left", value: "bottom-left" },
          { label: "Bottom Right", value: "bottom-right" },
          { label: "Top Center", value: "top-center" },
          { label: "Top Left", value: "top-left" },
          { label: "Top Right", value: "top-right" },
        ],
      },
      {
        id: "start-number",
        label: "Start Number",
        type: "input",
        placeholder: "1",
        defaultValue: "1",
        hint: "The number for the first page.",
      },
      {
        id: "font-size",
        label: "Font Size",
        type: "slider",
        defaultValue: 12,
        min: 6,
        max: 24,
        step: 1,
        unit: "pt",
      },
    ],
    processingSteps: ["Analyzing pages...", "Adding page numbers...", "Saving document..."],
    processButtonText: "Add Page Numbers",
    outputDescription: "Page numbers have been added to your PDF.",
    outputExtension: ".pdf",
  },

  "organize-pdf": {
    id: "organize-pdf",
    uploadTitle: "Select PDF to organize",
    uploadSubtitle: "Drag pages to reorder, delete unwanted pages, or extract specific ones.",
    options: [
      {
        id: "mode",
        label: "Action Mode",
        type: "radio",
        defaultValue: "reorder",
        options: [
          { label: "Reorder Pages", value: "reorder", description: "Drag and drop to rearrange page order" },
          { label: "Delete Pages", value: "delete", description: "Select and remove specific pages" },
          { label: "Extract Pages", value: "extract", description: "Save selected pages as a new PDF" },
          { label: "Insert Pages", value: "insert", description: "Add blank pages at specific positions" },
        ],
      },
      {
        id: "page-range",
        label: "Pages to Act On",
        type: "input",
        placeholder: "e.g. 1, 3, 5-8",
        defaultValue: "",
        hint: "Required for Delete/Extract/Insert modes.",
      },
      {
        id: "blank-position",
        label: "Insert Blank Page After",
        type: "input",
        placeholder: "e.g. 3",
        defaultValue: "",
        hint: "Page number after which to insert a blank page (Insert mode).",
      },
    ],
    processingSteps: ["Reading PDF structure...", "Applying changes...", "Generating new PDF..."],
    processButtonText: "Organize PDF",
    outputDescription: "Your PDF has been reorganized successfully.",
    outputExtension: ".pdf",
  },

  // ========================
  // OPTIMIZE PDF
  // ========================
  "compress-pdf": {
    id: "compress-pdf",
    uploadTitle: "Select PDF to compress",
    uploadSubtitle: "Reduce file size while keeping quality as high as possible.",
    options: [
      {
        id: "compression-level",
        label: "Compression Level",
        type: "radio",
        defaultValue: "medium",
        options: [
          { label: "Low — 15%", value: "low", description: "Best quality, exactly ~15% size reduction" },
          { label: "Medium — 40% (Recommended)", value: "medium", description: "Good balance, exactly ~40% size reduction" },
          { label: "High — 65%", value: "high", description: "Noticeable quality loss, exactly ~65% size reduction" },
          { label: "Extreme — 80%", value: "extreme", description: "Maximum reduction, exactly ~80% size reduction" },
        ],
      },
      {
        id: "color-mode",
        label: "Color Mode",
        type: "select",
        defaultValue: "color",
        options: [
          { label: "Full Color", value: "color" },
          { label: "Grayscale", value: "grayscale" },
          { label: "Black & White", value: "bw" },
        ],
      },
    ],
    processingSteps: ["Analyzing PDF content...", "Compressing images...", "Optimizing structure...", "Generating compressed PDF..."],
    processButtonText: "Compress PDF",
    outputDescription: "Your PDF has been compressed successfully.",
    outputExtension: ".pdf",
    outputLabel: "Original → Compressed",
  },

  "bulk-compress-pdf": {
    id: "bulk-compress-pdf",
    uploadTitle: "Drop multiple PDF files to compress",
    uploadSubtitle: "Compress up to 100 PDF files at once. Batch processing keeps your browser smooth.",
    options: [],
    processingSteps: ["Reading files...", "Compressing in batches...", "Generating ZIP..."],
    processButtonText: "Compress All PDFs",
    outputDescription: "All PDFs have been compressed successfully.",
    outputExtension: ".zip",
    outputLabel: "Download All as ZIP",
  },

  "repair-pdf": {
    id: "repair-pdf",
    uploadTitle: "Select damaged PDF to repair",
    uploadSubtitle: "Fix corrupted PDF files that won't open properly.",
    options: [],
    processingSteps: ["Scanning for errors...", "Rebuilding PDF structure...", "Fixing corrupted objects...", "Validating output..."],
    processButtonText: "Repair PDF",
    outputDescription: "Your PDF has been repaired and is ready to use.",
    outputExtension: ".pdf",
  },

  // ========================
  // CONVERT FROM PDF
  // ========================
  "pdf-to-word": {
    id: "pdf-to-word",
    uploadTitle: "Select PDF to convert",
    uploadSubtitle: "Powered by Gemini AI — Convert any PDF (even scanned) to a fully editable Word document. No size limits, no page limits.",
    options: [
      {
        id: "columns",
        label: "Column Handling",
        type: "radio",
        defaultValue: "auto",
        options: [
          { label: "Auto-detect columns", value: "auto", description: "Smart detection of single/multi-column layouts" },
          { label: "Single column", value: "single", description: "Flow all text into one column" },
          { label: "Keep original columns", value: "keep", description: "Preserve original multi-column layout" },
        ],
      },
      {
        id: "language",
        label: "Document Language",
        type: "select",
        defaultValue: "eng",
        hint: "Select the language of your document for best accuracy",
        options: [
          { label: "English", value: "eng" },
          { label: "Hindi", value: "hin" },
          { label: "Hindi + English (Mix)", value: "hin+eng" },
          { label: "Spanish", value: "spa" },
          { label: "French", value: "fra" },
          { label: "German", value: "deu" },
          { label: "Chinese (Simplified)", value: "chi_sim" },
          { label: "Chinese (Traditional)", value: "chi_tra" },
          { label: "Japanese", value: "jpn" },
          { label: "Korean", value: "kor" },
          { label: "Arabic", value: "ara" },
          { label: "Portuguese", value: "por" },
          { label: "Italian", value: "ita" },
          { label: "Russian", value: "rus" },
        ],
      },
    ],
    processingSteps: ["Loading PDF...", "Rendering pages...", "Gemini AI analyzing...", "Building Word document...", "Finalizing..."],
    processButtonText: "Convert to Word",
    outputDescription: "Your PDF has been converted to a fully editable Word document using AI.",
    outputExtension: ".docx",
  },

  "pdf-to-excel": {
    id: "pdf-to-excel",
    uploadTitle: "Select PDF to convert",
    uploadSubtitle: "Extract tables and data from your PDF into a spreadsheet.",
    options: [
      {
        id: "detection",
        label: "Table Detection",
        type: "radio",
        defaultValue: "auto",
        options: [
          { label: "Auto-detect tables", value: "auto", description: "Automatically find and extract tables" },
          { label: "All content as rows", value: "all", description: "Convert entire PDF content to rows" },
          { label: "Custom area", value: "custom", description: "Manually select table areas" },
        ],
      },
      {
        id: "ocr",
        label: "Enable OCR",
        type: "toggle",
        defaultValue: false,
        hint: "For scanned PDFs with table images.",
      },
      {
        id: "sheets",
        label: "Sheet Organization",
        type: "radio",
        defaultValue: "single",
        options: [
          { label: "All in one sheet", value: "single" },
          { label: "Each table → new sheet", value: "multi" },
          { label: "Each page → new sheet", value: "per-page" },
        ],
      },
    ],
    processingSteps: ["Detecting tables...", "Extracting data...", "Building spreadsheet...", "Formatting cells..."],
    processButtonText: "Convert to Excel",
    outputDescription: "Your PDF has been converted to an Excel spreadsheet.",
    outputExtension: ".xlsx",
  },

  "pdf-to-jpg": {
    id: "pdf-to-jpg",
    uploadTitle: "Select PDF to convert",
    uploadSubtitle: "Extract PDF pages as high-quality JPEG images.",
    options: [
      {
        id: "quality",
        label: "Image Quality",
        type: "slider",
        defaultValue: 85,
        min: 10,
        max: 100,
        step: 5,
        unit: "%",
      },
      {
        id: "dpi",
        label: "Resolution (DPI)",
        type: "select",
        defaultValue: "150",
        options: [
          { label: "72 DPI (Web)", value: "72" },
          { label: "150 DPI (Standard)", value: "150" },
          { label: "200 DPI (Good)", value: "200" },
          { label: "300 DPI (High Quality)", value: "300" },
          { label: "600 DPI (Ultra HD)", value: "600" },
        ],
      },
      {
        id: "page-range",
        label: "Page Range",
        type: "input",
        placeholder: "e.g. 1, 3-5, 8 (leave empty for all)",
        defaultValue: "",
      },
      {
        id: "mode",
        label: "Output Mode",
        type: "radio",
        defaultValue: "separate",
        options: [
          { label: "Separate images (one per page)", value: "separate" },
          { label: "Single combined image", value: "combined" },
        ],
      },
    ],
    processingSteps: ["Rendering pages...", "Converting to JPEG...", "Compressing images..."],
    processButtonText: "Convert to JPG",
    outputDescription: "Your PDF has been converted to JPEG images.",
    outputExtension: ".jpg",
    multipleOutput: true,
    outputLabel: "Download All as ZIP",
  },

  // ========================
  // CONVERT TO PDF
  // ========================
  "word-to-pdf": {
    id: "word-to-pdf",
    uploadTitle: "Select Word document",
    uploadSubtitle: "Convert your DOCX file to a professional PDF.",
    options: [
      {
        id: "page-size",
        label: "Page Size",
        type: "select",
        defaultValue: "a4",
        options: [
          { label: "A4 (210 × 297 mm)", value: "a4" },
          { label: "Letter (8.5 × 11 in)", value: "letter" },
          { label: "Legal (8.5 × 14 in)", value: "legal" },
          { label: "A3 (297 × 420 mm)", value: "a3" },
          { label: "A5 (148 × 210 mm)", value: "a5" },
        ],
      },
      {
        id: "orientation",
        label: "Orientation",
        type: "radio",
        defaultValue: "portrait",
        options: [
          { label: "Portrait", value: "portrait" },
          { label: "Landscape", value: "landscape" },
        ],
      },
      {
        id: "margins",
        label: "Margins",
        type: "select",
        defaultValue: "normal",
        options: [
          { label: "Normal (1 inch)", value: "normal" },
          { label: "Narrow (0.5 inch)", value: "narrow" },
          { label: "Wide (1.5 inch)", value: "wide" },
          { label: "None (0 inch)", value: "none" },
        ],
      },
    ],
    processingSteps: ["Parsing Word document...", "Converting formatting...", "Rendering pages...", "Creating PDF..."],
    processButtonText: "Convert to PDF",
    outputDescription: "Your Word document has been converted to PDF.",
    outputExtension: ".pdf",
  },

  "excel-to-pdf": {
    id: "excel-to-pdf",
    uploadTitle: "Select Excel spreadsheet",
    uploadSubtitle: "Convert your spreadsheet data to a PDF document.",
    options: [
      {
        id: "sheet-selection",
        label: "Sheet Selection",
        type: "radio",
        defaultValue: "all",
        options: [
          { label: "All Sheets", value: "all" },
          { label: "Active Sheet Only", value: "active" },
          { label: "Custom Selection", value: "custom" },
        ],
      },
      {
        id: "page-size",
        label: "Page Size",
        type: "select",
        defaultValue: "a4",
        options: [
          { label: "A4", value: "a4" },
          { label: "Letter", value: "letter" },
          { label: "Legal", value: "legal" },
        ],
      },
      {
        id: "orientation",
        label: "Orientation",
        type: "radio",
        defaultValue: "landscape",
        options: [
          { label: "Portrait", value: "portrait" },
          { label: "Landscape (Recommended)", value: "landscape" },
        ],
      },
      {
        id: "fit-to-page",
        label: "Fit to Page Width",
        type: "toggle",
        defaultValue: true,
        hint: "Scale content to fit within page width.",
      },
    ],
    processingSteps: ["Reading spreadsheet data...", "Processing sheets...", "Rendering content...", "Creating PDF..."],
    processButtonText: "Convert to PDF",
    outputDescription: "Your Excel file has been converted to PDF.",
    outputExtension: ".pdf",
  },

  "powerpoint-to-pdf": {
    id: "powerpoint-to-pdf",
    uploadTitle: "Select PowerPoint presentation",
    uploadSubtitle: "Convert your slides to a PDF document.",
    options: [
      {
        id: "slide-range",
        label: "Slide Range",
        type: "input",
        placeholder: "e.g. 1-10 (leave empty for all)",
        defaultValue: "",
      },
      {
        id: "include-notes",
        label: "Include Speaker Notes",
        type: "toggle",
        defaultValue: false,
      },
      {
        id: "frame-slides",
        label: "Add Frame Around Slides",
        type: "toggle",
        defaultValue: false,
        hint: "Add a thin border around each slide.",
      },
    ],
    processingSteps: ["Reading presentation...", "Processing slides...", "Rendering content...", "Creating PDF..."],
    processButtonText: "Convert to PDF",
    outputDescription: "Your PowerPoint has been converted to PDF.",
    outputExtension: ".pdf",
  },

  "jpg-to-pdf": {
    id: "jpg-to-pdf",
    uploadTitle: "Select JPG images",
    uploadSubtitle: "Combine multiple JPG images into a single PDF document.",
    uploadIcon: "merge",
    options: [
      {
        id: "page-size",
        label: "Page Size",
        type: "select",
        defaultValue: "a4",
        options: [
          { label: "A4", value: "a4" },
          { label: "Letter", value: "letter" },
          { label: "Fit to Image", value: "fit" },
        ],
      },
      {
        id: "orientation",
        label: "Orientation",
        type: "radio",
        defaultValue: "auto",
        options: [
          { label: "Auto-detect from images", value: "auto" },
          { label: "Portrait", value: "portrait" },
          { label: "Landscape", value: "landscape" },
        ],
      },
      {
        id: "margins",
        label: "Margins",
        type: "select",
        defaultValue: "normal",
        options: [
          { label: "No Margins", value: "none" },
          { label: "Small (0.25 in)", value: "small" },
          { label: "Normal (0.5 in)", value: "normal" },
          { label: "Large (1 in)", value: "large" },
        ],
      },
      {
        id: "fit",
        label: "Image Fit",
        type: "radio",
        defaultValue: "contain",
        options: [
          { label: "Fit within page", value: "contain" },
          { label: "Fill entire page", value: "cover" },
          { label: "Original size (may crop)", value: "original" },
        ],
      },
    ],
    processingSteps: ["Processing images...", "Arranging on pages...", "Generating PDF..."],
    processButtonText: "Convert to PDF",
    outputDescription: "Your JPG images have been combined into a PDF.",
    outputExtension: ".pdf",
  },

  // ========================
  // SECURITY
  // ========================
  "protect-pdf": {
    id: "protect-pdf",
    uploadTitle: "Select PDF to protect",
    uploadSubtitle: "Add password protection and set permissions.",
    uploadIcon: "lock",
    options: [
      {
        id: "password",
        label: "Set Password",
        type: "password",
        placeholder: "Enter password",
        defaultValue: "",
        required: true,
        hint: "Users will need this password to open the PDF.",
      },
      {
        id: "confirm-password",
        label: "Confirm Password",
        type: "password",
        placeholder: "Re-enter password",
        defaultValue: "",
        required: true,
      },
      {
        id: "encryption",
        label: "Encryption Level",
        type: "radio",
        defaultValue: "aes-128",
        options: [
          { label: "AES-128 (Standard)", value: "aes-128", description: "Good security, faster processing" },
          { label: "AES-256 (Maximum)", value: "aes-256", description: "Highest security, recommended for sensitive docs" },
        ],
      },
      {
        id: "allow-print",
        label: "Allow Printing",
        type: "toggle",
        defaultValue: true,
      },
      {
        id: "allow-copy",
        label: "Allow Copying",
        type: "toggle",
        defaultValue: false,
        hint: "Allow users to copy text and images from the PDF.",
      },
      {
        id: "allow-edit",
        label: "Allow Editing",
        type: "toggle",
        defaultValue: false,
        hint: "Allow users to modify the PDF content.",
      },
      {
        id: "allow-annotate",
        label: "Allow Annotations",
        type: "toggle",
        defaultValue: true,
        hint: "Allow users to add comments and highlights.",
      },
    ],
    processingSteps: ["Reading PDF...", "Applying encryption...", "Setting permissions...", "Securing document..."],
    processButtonText: "Protect PDF",
    outputDescription: "Your PDF has been password-protected successfully.",
    outputExtension: ".pdf",
  },

  "unlock-pdf": {
    id: "unlock-pdf",
    uploadTitle: "Select locked PDF",
    uploadSubtitle: "Remove password protection to make your PDF accessible.",
    uploadIcon: "unlock",
    options: [
      {
        id: "password",
        label: "Enter PDF Password",
        type: "password",
        placeholder: "Enter the current password",
        defaultValue: "",
        required: true,
        hint: "Enter the password that currently protects this PDF.",
      },
    ],
    processingSteps: ["Verifying password...", "Decrypting PDF...", "Removing restrictions...", "Saving unlocked PDF..."],
    processButtonText: "Unlock PDF",
    outputDescription: "Your PDF has been unlocked and is now accessible.",
    outputExtension: ".pdf",
  },

  "sign-pdf": {
    id: "sign-pdf",
    uploadTitle: "Select PDF to sign",
    uploadSubtitle: "Add your signature to any PDF document.",
    uploadIcon: "sign",
    options: [
      {
        id: "sign-type",
        label: "Signature Type",
        type: "radio",
        defaultValue: "type",
        options: [
          { label: "Type your name", value: "type", description: "Generate a signature from typed text" },
          { label: "Draw signature", value: "draw", description: "Draw your signature with mouse or touch" },
          { label: "Upload signature image", value: "upload", description: "Use a pre-made signature image" },
        ],
      },
      {
        id: "signer-name",
        label: "Signer Name",
        type: "input",
        placeholder: "Type your full name",
        defaultValue: "",
        hint: "This will be used to generate or label your signature.",
        required: true,
      },
      // === TEXT MODE OPTIONS ===
      {
        id: "sign-color",
        label: "Signature Color",
        type: "color-picker",
        defaultValue: "#00008B",
        hint: "Color of the typed signature text.",
      },
      {
        id: "sign-font-size",
        label: "Font Size",
        type: "slider",
        defaultValue: 36,
        min: 16,
        max: 72,
        step: 2,
        unit: "px",
        hint: "Size of the signature text.",
      },
      {
        id: "sign-font",
        label: "Signature Font",
        type: "select",
        defaultValue: "georgia",
        options: [
          { label: "Georgia (Classic Serif)", value: "georgia" },
          { label: "Palatino (Elegant)", value: "palatino" },
          { label: "Dancing Script (Cursive)", value: "dancing" },
          { label: "Great Vibes (Calligraphy)", value: "greatvibes" },
          { label: "Kalam (Handwritten)", value: "kalam" },
          { label: "Parisienne (Sophisticated)", value: "parisienne" },
          { label: "Caveat (Casual)", value: "caveat" },
        ],
        hint: "Font style for the signature text.",
      },
      // === DRAW MODE OPTIONS ===
      {
        id: "pen-color",
        label: "Pen Color",
        type: "color-picker",
        defaultValue: "#1a1a2e",
        hint: "Color of the drawing pen / cursor.",
      },
      {
        id: "pen-size",
        label: "Pen Size",
        type: "slider",
        defaultValue: 2.5,
        min: 1,
        max: 8,
        step: 0.5,
        unit: "px",
        hint: "Thickness of the drawing pen.",
      },
      // === UPLOAD MODE OPTIONS ===
      {
        id: "sig-image-size",
        label: "Image Size on PDF",
        type: "slider",
        defaultValue: 200,
        min: 50,
        max: 500,
        step: 10,
        unit: "px",
        hint: "How large the uploaded signature appears on the PDF.",
      },
      // === COMMON OPTIONS ===
      {
        id: "page",
        label: "Sign on Page",
        type: "input",
        placeholder: "e.g. 1 (last page if empty)",
        defaultValue: "1",
      },
      {
        id: "position",
        label: "Position",
        type: "select",
        defaultValue: "bottom-right",
        options: [
          { label: "Bottom Right", value: "bottom-right" },
          { label: "Bottom Left", value: "bottom-left" },
          { label: "Bottom Center", value: "bottom-center" },
          { label: "Top Right", value: "top-right" },
          { label: "Top Left", value: "top-left" },
        ],
      },
      {
        id: "reason",
        label: "Signing Reason (Optional)",
        type: "input",
        placeholder: "e.g. Approved, Contract Signature",
        defaultValue: "",
      },
    ],
    processingSteps: ["Preparing signature...", "Placing on document...", "Applying digital signature...", "Saving signed PDF..."],
    processButtonText: "Sign PDF",
    outputDescription: "Your PDF has been signed successfully.",
    outputExtension: ".pdf",
  },

  // ========================
  // AI TOOLS
  // ========================
  "pdf-summary": {
    id: "pdf-summary",
    uploadTitle: "Upload PDF to Summarize",
    uploadSubtitle: "Powered by Gemini AI — Get a professional executive summary of any document in seconds.",
    uploadIcon: "split",
    options: [],
    processingSteps: ["Uploading to AI engine...", "Gemini analyzing content...", "Generating professional summary...", "Finalizing summary..."],
    processButtonText: "Generate Summary with AI",
    outputDescription: "Your PDF has been summarized by Gemini AI.",
    outputExtension: ".txt",
  },

  "pdf-notes": {
    id: "pdf-notes",
    uploadTitle: "Upload PDF for Study Notes",
    uploadSubtitle: "Powered by Gemini AI — Convert any PDF into structured, exam-ready study notes.",
    uploadIcon: "split",
    options: [],
    processingSteps: ["Uploading to AI engine...", "Gemini detecting structure...", "Creating organized notes...", "Finalizing notes..."],
    processButtonText: "Generate Notes with AI",
    outputDescription: "Your study notes have been generated by Gemini AI.",
    outputExtension: ".txt",
  },

  "resume-checker": {
    id: "resume-checker",
    uploadTitle: "Upload Your Resume",
    uploadSubtitle: "Powered by Gemini AI — Get a detailed ATS score with keyword matching, section analysis, and actionable suggestions.",
    uploadIcon: "compare",
    options: [],
    processingSteps: ["Uploading to AI engine...", "Gemini analyzing sections...", "Matching keywords...", "Generating improvement report..."],
    processButtonText: "Analyze Resume with AI",
    outputDescription: "Your resume ATS analysis by Gemini AI is complete.",
    outputExtension: ".txt",
  },

  "watermark-pdf": {
    id: "watermark-pdf",
    uploadTitle: "Select PDF to watermark",
    uploadSubtitle: "Add custom text or image watermarks to your pages.",
    options: [
      {
        id: "watermark-type",
        label: "Watermark Type",
        type: "radio",
        defaultValue: "text",
        options: [
          { label: "Text Watermark", value: "text" },
          { label: "Image Watermark", value: "image" },
        ],
      },
      {
        id: "text",
        label: "Watermark Text",
        type: "input",
        placeholder: "e.g. CONFIDENTIAL, DRAFT, © Company Name",
        defaultValue: "",
        required: true,
        hint: "The text that will appear on each page.",
      },
      {
        id: "font-size",
        label: "Font Size",
        type: "slider",
        defaultValue: 48,
        min: 12,
        max: 120,
        step: 2,
        unit: "pt",
      },
      {
        id: "color",
        label: "Text Color",
        type: "select",
        defaultValue: "gray",
        options: [
          { label: "Gray (Light)", value: "gray" },
          { label: "Red", value: "red" },
          { label: "Blue", value: "blue" },
          { label: "Green", value: "green" },
          { label: "Black", value: "black" },
          { label: "Custom Color", value: "custom" },
        ],
      },
      {
        id: "opacity",
        label: "Opacity",
        type: "slider",
        defaultValue: 30,
        min: 5,
        max: 100,
        step: 5,
        unit: "%",
      },
      {
        id: "rotation",
        label: "Rotation",
        type: "slider",
        defaultValue: -45,
        min: -90,
        max: 90,
        step: 5,
        unit: "°",
      },
      {
        id: "position",
        label: "Position",
        type: "select",
        defaultValue: "center",
        options: [
          { label: "Center (Diagonal)", value: "center" },
          { label: "Top Left", value: "top-left" },
          { label: "Top Right", value: "top-right" },
          { label: "Bottom Left", value: "bottom-left" },
          { label: "Bottom Right", value: "bottom-right" },
          { label: "Tiled (Repeat)", value: "tiled" },
        ],
      },
      {
        id: "pages",
        label: "Apply To Pages",
        type: "input",
        placeholder: "e.g. 1-5, 8 (leave empty for all)",
        defaultValue: "",
      },
    ],
    processingSteps: ["Reading PDF pages...", "Rendering watermark...", "Applying to pages...", "Saving watermarked PDF..."],
    processButtonText: "Add Watermark",
    outputDescription: "Watermark has been added to your PDF successfully.",
    outputExtension: ".pdf",
  },

};

export function getToolConfig(toolId: string): ToolConfig {
  return (
    toolConfigs[toolId] || {
      id: toolId,
      uploadTitle: "Select your file",
      uploadSubtitle: "Upload a file to process.",
      options: [],
      processingSteps: ["Processing..."],
      processButtonText: "Process",
      outputDescription: "Processing complete.",
      outputExtension: ".pdf",
    }
  );
}
