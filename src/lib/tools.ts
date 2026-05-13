import {
  FileText,
  Scissors,
  Minimize2,
  ArrowRightLeft,
  FileUp,
  FileDown,
  Image,
  Type,
  Lock,
  Unlock,
  PenTool,
  Droplets,
  Hash,
  Layers,
  Wrench,
  RotateCw,
  FileSpreadsheet,
  Receipt,
  Sparkles,
  FileSearch,
  BookOpen,
  UserCheck,
  FolderArchive,
} from "lucide-react";
import { type LucideIcon } from "lucide-react";

export type ToolCategory = {
  id: string;
  name: string;
  description: string;
  tools: Tool[];
  isAICategory?: boolean;
};

export type Tool = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  acceptTypes?: string;
  multipleFiles?: boolean;
  maxFileSize?: string;
};

export const toolCategories: ToolCategory[] = [
  {
    id: "ai-tools",
    name: "AI Tools",
    description: "Smart AI-powered tools for students and job seekers",
    isAICategory: true,
    tools: [
      {
        id: "pdf-summary",
        name: "PDF Summary",
        description: "Summarize any PDF into key bullet points instantly",
        icon: Sparkles,
        color: "text-amber-600 dark:text-amber-400",
        bgColor: "bg-amber-50 dark:bg-amber-950/40",
        acceptTypes: ".pdf",
        multipleFiles: false,
        maxFileSize: "50MB",
      },
      {
        id: "pdf-notes",
        name: "PDF to Notes",
        description: "Convert any PDF into structured study notes with headings and highlights",
        icon: BookOpen,
        color: "text-emerald-600 dark:text-emerald-400",
        bgColor: "bg-emerald-50 dark:bg-emerald-950/40",
        acceptTypes: ".pdf",
        multipleFiles: false,
        maxFileSize: "50MB",
      },
      {
        id: "resume-checker",
        name: "Resume ATS Checker",
        description: "Check your resume ATS score with detailed section, keyword & structure analysis",
        icon: UserCheck,
        color: "text-violet-600 dark:text-violet-400",
        bgColor: "bg-violet-50 dark:bg-violet-950/40",
        acceptTypes: ".pdf",
        multipleFiles: false,
        maxFileSize: "10MB",
      },
    ],
  },
  {
    id: "invoice",
    name: "Invoice Generator",
    description: "Create & send professional invoices — free to use",
    tools: [
      {
        id: "invoice-generator",
        name: "Invoice Generator",
        description: "Build professional invoices from scratch or upload & edit existing PDF invoices",
        icon: Receipt,
        color: "text-violet-600 dark:text-violet-400",
        bgColor: "bg-violet-50 dark:bg-violet-950/40",
        acceptTypes: ".pdf",
        multipleFiles: false,
        maxFileSize: "10MB",
      },
    ],
  },
  {
    id: "organize",
    name: "Organize PDF",
    description: "Rearrange, split, and manage your PDF pages",
    tools: [
      {
        id: "merge-pdf",
        name: "Merge PDF",
        description: "Combine multiple PDF files into a single document",
        icon: Layers,
        color: "text-rose-600 dark:text-rose-400",
        bgColor: "bg-rose-50 dark:bg-rose-950/40",
        acceptTypes: ".pdf",
        multipleFiles: true,
        maxFileSize: "100MB",
      },
      {
        id: "split-pdf",
        name: "Split PDF",
        description: "Separate PDF pages into individual files or custom ranges",
        icon: Scissors,
        color: "text-amber-600 dark:text-amber-400",
        bgColor: "bg-amber-50 dark:bg-amber-950/40",
        acceptTypes: ".pdf",
        multipleFiles: false,
        maxFileSize: "100MB",
      },
      {
        id: "rotate-pdf",
        name: "Rotate PDF",
        description: "Rotate PDF pages to the correct orientation",
        icon: RotateCw,
        color: "text-violet-600 dark:text-violet-400",
        bgColor: "bg-violet-50 dark:bg-violet-950/40",
        acceptTypes: ".pdf",
        multipleFiles: false,
        maxFileSize: "100MB",
      },
      {
        id: "page-numbers",
        name: "Page Numbers",
        description: "Add custom page numbers to your PDF document",
        icon: Hash,
        color: "text-cyan-600 dark:text-cyan-400",
        bgColor: "bg-cyan-50 dark:bg-cyan-950/40",
        acceptTypes: ".pdf",
        multipleFiles: false,
        maxFileSize: "100MB",
      },
      {
        id: "organize-pdf",
        name: "Organize PDF",
        description: "Reorder, delete, or extract pages from your PDF",
        icon: Wrench,
        color: "text-teal-600 dark:text-teal-400",
        bgColor: "bg-teal-50 dark:bg-teal-950/40",
        acceptTypes: ".pdf",
        multipleFiles: false,
        maxFileSize: "100MB",
      },
    ],
  },
  {
    id: "optimize",
    name: "Optimize PDF",
    description: "Reduce file size and repair damaged documents",
    tools: [
      {
        id: "compress-pdf",
        name: "Compress PDF",
        description: "Reduce PDF file size while maintaining quality",
        icon: Minimize2,
        color: "text-emerald-600 dark:text-emerald-400",
        bgColor: "bg-emerald-50 dark:bg-emerald-950/40",
        acceptTypes: ".pdf",
        multipleFiles: false,
        maxFileSize: "100MB",
      },
      {
        id: "bulk-compress-pdf",
        name: "Bulk Compress PDF",
        description: "Compress up to 100 PDFs at once with batch processing and ZIP download",
        icon: FolderArchive,
        color: "text-teal-600 dark:text-teal-400",
        bgColor: "bg-teal-50 dark:bg-teal-950/40",
        acceptTypes: ".pdf",
        multipleFiles: true,
        maxFileSize: "100MB",
      },
      {
        id: "repair-pdf",
        name: "Repair PDF",
        description: "Fix corrupted or damaged PDF files",
        icon: Wrench,
        color: "text-orange-600 dark:text-orange-400",
        bgColor: "bg-orange-50 dark:bg-orange-950/40",
        acceptTypes: ".pdf",
        multipleFiles: false,
        maxFileSize: "100MB",
      },
    ],
  },
  {
    id: "convert-from",
    name: "Convert from PDF",
    description: "Transform your PDFs into editable formats",
    tools: [
      {
        id: "pdf-to-word",
        name: "PDF to Word",
        description: "Convert PDF documents to editable DOCX files",
        icon: FileDown,
        color: "text-blue-600 dark:text-blue-400",
        bgColor: "bg-blue-50 dark:bg-blue-950/40",
        acceptTypes: ".pdf",
        multipleFiles: false,
        maxFileSize: "50MB",
      },
      {
        id: "pdf-to-excel",
        name: "PDF to Excel",
        description: "Convert PDF tables and data to XLSX spreadsheets",
        icon: FileSpreadsheet,
        color: "text-green-600 dark:text-green-400",
        bgColor: "bg-green-50 dark:bg-green-950/40",
        acceptTypes: ".pdf",
        multipleFiles: false,
        maxFileSize: "50MB",
      },
      {
        id: "pdf-to-jpg",
        name: "PDF to JPG",
        description: "Extract PDF pages as high-quality JPG images",
        icon: Image,
        color: "text-pink-600 dark:text-pink-400",
        bgColor: "bg-pink-50 dark:bg-pink-950/40",
        acceptTypes: ".pdf",
        multipleFiles: false,
        maxFileSize: "50MB",
      },
    ],
  },
  {
    id: "convert-to",
    name: "Convert to PDF",
    description: "Create PDF documents from various file formats",
    tools: [
      {
        id: "word-to-pdf",
        name: "Word to PDF",
        description: "Convert DOCX documents to professional PDF files",
        icon: FileUp,
        color: "text-blue-700 dark:text-blue-300",
        bgColor: "bg-blue-50 dark:bg-blue-950/40",
        acceptTypes: ".doc,.docx",
        multipleFiles: false,
        maxFileSize: "50MB",
      },
      {
        id: "excel-to-pdf",
        name: "Excel to PDF",
        description: "Convert spreadsheets to PDF format",
        icon: FileUp,
        color: "text-green-700 dark:text-green-300",
        bgColor: "bg-green-50 dark:bg-green-950/40",
        acceptTypes: ".xls,.xlsx",
        multipleFiles: false,
        maxFileSize: "50MB",
      },
      {
        id: "powerpoint-to-pdf",
        name: "PowerPoint to PDF",
        description: "Convert presentations to PDF format",
        icon: FileUp,
        color: "text-orange-700 dark:text-orange-300",
        bgColor: "bg-orange-50 dark:bg-orange-950/40",
        acceptTypes: ".ppt,.pptx",
        multipleFiles: false,
        maxFileSize: "50MB",
      },
      {
        id: "jpg-to-pdf",
        name: "JPG to PDF",
        description: "Convert JPG images into a PDF document",
        icon: FileUp,
        color: "text-pink-700 dark:text-pink-300",
        bgColor: "bg-pink-50 dark:bg-pink-950/40",
        acceptTypes: ".jpg,.jpeg",
        multipleFiles: true,
        maxFileSize: "50MB",
      },
    ],
  },
  {
    id: "security",
    name: "Security",
    description: "Protect and secure your PDF documents",
    tools: [
      {
        id: "protect-pdf",
        name: "Protect PDF",
        description: "Add password protection and encryption to your PDF",
        icon: Lock,
        color: "text-red-600 dark:text-red-400",
        bgColor: "bg-red-50 dark:bg-red-950/40",
        acceptTypes: ".pdf",
        multipleFiles: false,
        maxFileSize: "100MB",
      },
      {
        id: "unlock-pdf",
        name: "Unlock PDF",
        description: "Remove password protection from PDF files",
        icon: Unlock,
        color: "text-emerald-600 dark:text-emerald-400",
        bgColor: "bg-emerald-50 dark:bg-emerald-950/40",
        acceptTypes: ".pdf",
        multipleFiles: false,
        maxFileSize: "100MB",
      },
      {
        id: "sign-pdf",
        name: "Sign PDF",
        description: "Add digital signatures to your PDF documents",
        icon: PenTool,
        color: "text-indigo-600 dark:text-indigo-400",
        bgColor: "bg-indigo-50 dark:bg-indigo-950/40",
        acceptTypes: ".pdf",
        multipleFiles: false,
        maxFileSize: "50MB",
      },
      {
        id: "watermark-pdf",
        name: "Watermark PDF",
        description: "Add text or image watermarks to your PDF",
        icon: Droplets,
        color: "text-sky-600 dark:text-sky-400",
        bgColor: "bg-sky-50 dark:bg-sky-950/40",
        acceptTypes: ".pdf",
        multipleFiles: false,
        maxFileSize: "100MB",
      },
    ],
  },
];

export function getAllTools(): Tool[] {
  return toolCategories.flatMap((cat) => cat.tools);
}

export function getToolById(id: string): Tool | undefined {
  return getAllTools().find((t) => t.id === id);
}

export function getCategoryForTool(toolId: string): ToolCategory | undefined {
  return toolCategories.find((cat) => cat.tools.some((t) => t.id === toolId));
}
