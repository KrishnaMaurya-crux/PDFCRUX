"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  X,
  ArrowLeft,
  Sparkles,
  BookOpen,
  UserCheck,
  CheckCircle2,
  Copy,
  Check,
  AlertCircle,
  Zap,
  FileSearch,
  Target,
  BookMarked,
  Hash,
  Clock,
  RotateCcw,
  ShieldCheck,
  PenTool,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAppStore } from "@/lib/store";
import { saveHistory } from "@/lib/history";
import CloudStorageButtons from "@/components/tool/CloudStorageButtons";
// Enhanced PDF Summary module
import { summarizePDF } from "@/lib/pdf-summary-tool/index";
import type { SummaryResult as EnhancedSummaryResult } from "@/lib/pdf-summary-tool/index";

// Enhanced PDF Notes module
import { generatePDFNotes } from "@/lib/pdf-notes-tool/index";
import type { NotesResult as EnhancedNotesResult } from "@/lib/pdf-notes-tool/index";

// Enhanced Resume Checker module
import { analyzeResumeATS } from "@/lib/resume-checker-tool/index";
import type { ResumeAnalysisResult } from "@/lib/resume-checker-tool/index";

// Legacy types for result rendering (kept for UI compatibility)
import { extractTextFromPDF } from "@/lib/pdf-ai-tools";
import type {
  SummaryResult,
  NotesResult,
  ResumeResult,
} from "@/lib/pdf-ai-tools";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// ── Types ──────────────────────────────────────────────────────────────────

type ToolId = "pdf-summary" | "pdf-notes" | "resume-checker";

interface ToolMeta {
  title: string;
  titleAccent: string;
  description: string;
  badgeText: string;
  badgeClass: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  actionText: string;
  maxFileSize: number;
  steps: string[];
  howItWorks: { title: string; description: string; icon: React.ComponentType<{ className?: string }> }[];
  whyUse: { title: string; description: string; icon: React.ComponentType<{ className?: string }> }[];
  faq: { question: string; answer: string }[];
  freeActionLabel: string;
}

// ── Tool Configs ───────────────────────────────────────────────────────────

const toolMetaMap: Record<ToolId, ToolMeta> = {
  "pdf-summary": {
    title: "Summarize PDF in",
    titleAccent: "Seconds",
    description:
      "Upload any PDF and get an instant bullet-point summary. Perfect for research papers, reports, and long documents. No sign-up required, 100% free.",
    badgeText: "AI-Powered",
    badgeClass: "bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200",
    icon: Sparkles,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    actionText: "Generate Summary",
    maxFileSize: 50,
    steps: [
      "Reading PDF content...",
      "Analyzing key sections...",
      "Generating bullet points...",
    ],
    howItWorks: [
      {
        title: "Upload PDF",
        description:
          "Drag & drop or browse to select any PDF document.",
        icon: UploadCloud,
      },
      {
        title: "AI Summarizes",
        description:
          "Text is extracted, key paragraphs scored, and important points identified.",
        icon: Sparkles,
      },
      {
        title: "Get Summary",
        description:
          "Clean, concise bullet-point summary ready to read or copy.",
        icon: FileSearch,
      },
    ],
    whyUse: [
      { title: "Instant Summary", description: "Get key points in seconds, not hours.", icon: Zap },
      { title: "100% Private", description: "Your files never leave your browser.", icon: ShieldCheck },
      { title: "Smart Detection", description: "Automatically finds the most important content.", icon: Sparkles },
      { title: "Free to Use", description: "5 free summaries per day.", icon: Clock },
    ],
    faq: [
      {
        question: "Is my PDF uploaded to any server?",
        answer:
          "No. Your PDF is processed entirely in your browser. No files are uploaded to any server.",
      },
      {
        question: "What types of PDFs work best?",
        answer:
          "Text-based PDFs work best — research papers, reports, articles, and documents with clear paragraph structure.",
      },
      {
        question: "How is the summary generated?",
        answer:
          "Our algorithm scores paragraphs by sentence count, length, and key indicator words to identify the most important content.",
      },
      {
        question: "How many summaries can I generate?",
        answer:
          "You get 5 free summaries per day. Each summary processes up to 50MB files.",
      },
      {
        question: "Can I copy or print the summary?",
        answer:
          "Yes! You can copy the summary to clipboard with one click. You can also print the page.",
      },
      {
        question: "What languages are supported?",
        answer:
          "Currently, English PDFs are best supported. We're working on adding more languages soon.",
      },
    ],
    freeActionLabel: "free summaries",
  },
  "pdf-notes": {
    title: "Convert PDF to",
    titleAccent: "Study Notes",
    description:
      "Upload any PDF and get structured, easy-to-read study notes. Perfect for students, researchers, and anyone who needs organized content. No sign-up required, 100% free.",
    badgeText: "Study Tool",
    badgeClass: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200",
    icon: BookOpen,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    actionText: "Generate Notes",
    maxFileSize: 50,
    steps: [
      "Reading PDF content...",
      "Detecting headings and structure...",
      "Creating organized notes...",
    ],
    howItWorks: [
      {
        title: "Upload PDF",
        description:
          "Drag & drop or browse to select any PDF document.",
        icon: UploadCloud,
      },
      {
        title: "AI Structures",
        description:
          "Text is extracted, sections detected, and key points highlighted.",
        icon: BookOpen,
      },
      {
        title: "Get Study Notes",
        description:
          "Clean, organized notes with headings and bullet points.",
        icon: PenTool,
      },
    ],
    whyUse: [
      { title: "Instant Notes", description: "Structured study notes in seconds.", icon: Zap },
      { title: "100% Private", description: "Your files never leave your browser.", icon: ShieldCheck },
      { title: "Key Highlights", description: "Important points are auto-highlighted.", icon: PenTool },
      { title: "Free to Use", description: "5 free generations per day.", icon: Clock },
    ],
    faq: [
      {
        question: "Is my PDF uploaded to any server?",
        answer:
          "No. Your PDF is processed entirely in your browser. No files are uploaded to any server.",
      },
      {
        question: "What types of PDFs work best?",
        answer:
          "PDFs with clear headings and structure work best — textbooks, lecture notes, research papers, and manuals.",
      },
      {
        question: "How are notes structured?",
        answer:
          "Notes are organized into sections with headings (auto-detected or created), each with up to 5 bullet points summarizing key information.",
      },
      {
        question: "How many notes can I generate?",
        answer:
          "You get 5 free note generations per day. Each can process up to 50MB files.",
      },
      {
        question: "Can I copy or print the notes?",
        answer:
          "Yes! Use the copy button to copy all notes to clipboard, or print the page directly.",
      },
      {
        question: "Can I edit the generated notes?",
        answer:
          "Currently, notes are generated automatically. Copy them and edit in your preferred app. We're adding inline editing soon.",
      },
    ],
    freeActionLabel: "free generations",
  },
  "resume-checker": {
    title: "Check Your Resume",
    titleAccent: "ATS Score",
    description:
      "Upload your resume and get an instant ATS compatibility score. Detailed section analysis, keyword matching, and actionable suggestions. No sign-up required, 100% free.",
    badgeText: "ATS Tool",
    badgeClass: "bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200",
    icon: UserCheck,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    actionText: "Analyze Resume",
    maxFileSize: 10,
    steps: [
      "Extracting resume content...",
      "Checking sections...",
      "Analyzing keywords...",
      "Calculating ATS score...",
    ],
    howItWorks: [
      {
        title: "Upload Resume",
        description:
          "Drag & drop or browse to select your resume PDF.",
        icon: UploadCloud,
      },
      {
        title: "AI Analyzes",
        description:
          "Sections detected, keywords matched, and formatting checked against ATS standards.",
        icon: UserCheck,
      },
      {
        title: "Get ATS Score",
        description:
          "Detailed score breakdown with strengths, weaknesses, and improvement tips.",
        icon: FileSearch,
      },
    ],
    whyUse: [
      { title: "Instant Analysis", description: "Get your ATS score in seconds.", icon: Zap },
      { title: "100% Private", description: "Your resume never leaves your browser.", icon: ShieldCheck },
      { title: "Detailed Report", description: "Section analysis, keyword matching, and scoring.", icon: FileSearch },
      { title: "Free to Use", description: "5 free checks per day.", icon: Clock },
    ],
    faq: [
      {
        question: "Is my resume uploaded to any server?",
        answer:
          "No. Your resume is processed entirely in your browser. Your data stays completely private.",
      },
      {
        question: "What is ATS?",
        answer:
          "ATS stands for Applicant Tracking System. It's software used by employers to filter resumes. Having an ATS-friendly resume increases your chances of getting noticed.",
      },
      {
        question: "How is the ATS score calculated?",
        answer:
          "We check for standard sections (Summary, Skills, Experience, Education), match against 40+ ATS keywords, evaluate length, and assess formatting.",
      },
      {
        question: "What sections should my resume have?",
        answer:
          "Key sections: Professional Summary, Skills, Work Experience, and Education. Additional sections like Certifications, Projects, and Languages boost your score.",
      },
      {
        question: "Can I check multiple resumes?",
        answer:
          "You get 5 free ATS checks per day. Upload and analyze different versions of your resume.",
      },
      {
        question: "How can I improve my score?",
        answer:
          "Our analysis provides specific suggestions — add missing sections, incorporate relevant keywords, use bullet points, and keep your resume to 1-2 pages.",
      },
    ],
    freeActionLabel: "free checks",
  },
};

// ── Component ──────────────────────────────────────────────────────────────

export default function AIToolPage({
  toolId,
}: {
  toolId: string;
}) {
  const { navigateHome } = useAppStore();
  const meta = toolMetaMap[toolId as ToolId] ?? toolMetaMap["pdf-summary"];
  const ToolIcon = meta.icon;

  // ── State ──
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] =
    useState<SummaryResult | NotesResult | ResumeResult | null>(null);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File handling ──
  const handleFileSelection = (selected: File) => {
    if (selected.type !== "application/pdf" && !selected.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a PDF file.");
      return;
    }
    const maxSizeBytes = meta.maxFileSize * 1024 * 1024;
    if (selected.size > maxSizeBytes) {
      setError(`File is too large. Maximum size is ${meta.maxFileSize} MB.`);
      return;
    }
    setError(null);
    setResult(null);
    setFile(selected);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files[0]) handleFileSelection(e.dataTransfer.files[0]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setProgress(0);
    setCurrentStep(0);
  };

  // ── Processing ──
  const handleProcess = async () => {
    if (!file) {
      setError("Please upload a PDF first.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setProgress(0);
    setCurrentStep(0);
    setCopied(false);

    try {
      // For summary/notes, pre-extract text for validation (legacy modules handle their own extraction)
      // For resume-checker, the enhanced module handles everything internally
      if (toolId !== "resume-checker") {
        const text = await extractTextFromPDF(file);
        if (!text || text.trim().length < 50) {
          setError(
            "Could not extract enough text from this PDF. Please try a text-based PDF."
          );
          setIsProcessing(false);
          return;
        }
      }

      // Simulated progress
      const steps = meta.steps;
      const stepSize = 100 / steps.length;
      let p = 0;

      const interval = setInterval(() => {
        p += Math.random() * 15 + 5;
        if (p > 90) p = 90;
        const stepIdx = Math.min(
          Math.floor(p / stepSize),
          steps.length - 1
        );
        setCurrentStep(stepIdx);
        setProgress(p);
      }, 300);

      let res: SummaryResult | NotesResult | ResumeResult;

      if (toolId === "pdf-summary") {
        // Use the enhanced modular summary engine
        const summaryResult = await summarizePDF(file);
        res = summaryResult as unknown as SummaryResult;
      } else if (toolId === "pdf-notes") {
        // Use the enhanced modular notes engine
        const notesResult = await generatePDFNotes(file);
        res = notesResult as unknown as NotesResult;
      } else {
        // Use the enhanced modular resume checker engine (handles extraction internally)
        const resumeResult = await analyzeResumeATS(file);
        res = resumeResult as unknown as ResumeResult;
      }

      clearInterval(interval);
      setCurrentStep(steps.length - 1);
      setProgress(100);
      setResult(res);

      // Auto-save to history (fire-and-forget, non-critical)
      if (file) {
        const toolNames: Record<string, string> = {
          "pdf-summary": "PDF Summary",
          "pdf-notes": "PDF Notes",
          "resume-checker": "Resume ATS Checker",
        };
        let summary = "";
        if (toolId === "pdf-summary") {
          const sr = res as SummaryResult;
          summary = sr.bulletPoints.slice(0, 2).join(" | ");
        } else if (toolId === "pdf-notes") {
          const nr = res as NotesResult;
          summary = `${nr.totalSections} sections generated`;
        } else if (toolId === "resume-checker") {
          const rr = res as ResumeResult;
          summary = `ATS Score: ${rr.atsScore}/100 (${rr.grade})`;
        }
        saveHistory({
          toolId,
          toolName: toolNames[toolId] || toolId,
          fileName: file.name,
          fileSize: file.size,
          resultSummary: summary,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Processing failed. Please try again."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Copy ──
  const handleCopy = () => {
    let textToCopy = "";

    if (result && toolId === "pdf-summary") {
      const r = result as SummaryResult;
      textToCopy = `${r.title}\n\nKey Points:\n${r.bulletPoints.map((b) => `• ${b}`).join("\n")}`;
    } else if (result && toolId === "pdf-notes") {
      const r = result as NotesResult;
      textToCopy = `${r.title}\n\n${r.sections.map((s) => `📌 ${s.heading}\n${s.content.map((p) => `  • ${p}`).join("\n")}`).join("\n\n")}`;
    } else if (result && toolId === "resume-checker") {
      const r = result as ResumeResult;
      const sectionsFound = r.sections.filter((s) => s.found).map((s) => s.name);
      const sectionsMissing = r.sections.filter((s) => !s.found).map((s) => s.name);
      textToCopy = `Resume ATS Score: ${r.atsScore}/100 (Grade ${r.grade})\n\n` +
        `Stats: ${r.stats.pageCount} pages, ${r.stats.totalWords} words, ${sectionsFound.length}/${r.sections.length} sections, ${r.keywordsFound.length}/${r.keywordsFound.length + r.keywordsMissing.length} keywords\n\n` +
        `Sections Found: ${sectionsFound.join(", ")}\n` +
        (sectionsMissing.length > 0 ? `Missing Sections: ${sectionsMissing.join(", ")}\n` : "") +
        `\nStrengths:\n${r.strengths.map((s) => `• ${s}`).join("\n")}\n\n` +
        `Weaknesses:\n${r.weaknesses.map((w) => `• ${w}`).join("\n")}\n\n` +
        `Suggestions:\n${r.suggestions.map((s) => `• ${s}`).join("\n")}`;
    }

    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      });
    }
  };

  // ── Reset ──
  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setProgress(0);
    setCurrentStep(0);
    setCopied(false);
  };

  // ── Score helpers ──
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-600 bg-emerald-50 border-emerald-200";
    if (score >= 60) return "text-amber-600 bg-amber-50 border-amber-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  const getScoreRingColor = (score: number) => {
    if (score >= 80) return "stroke-emerald-500";
    if (score >= 60) return "stroke-amber-500";
    return "stroke-red-500";
  };

  // ── Render helpers ──

  const renderSummaryResult = () => {
    const r = result as SummaryResult;
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <h3 className="text-lg font-bold">Summary Generated!</h3>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <FileSearch className="w-3.5 h-3.5" />
                {r.wordCount.toLocaleString()} words
              </span>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {r.readingTime}
              </span>
            </div>
          </div>
        </div>

        {/* Key Points */}
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Target className="w-4 h-4" />
            Key Points
          </p>
          <ul className="space-y-2">
            {r.bulletPoints.map((point, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-start gap-3 text-sm leading-relaxed"
              >
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                <span>{point}</span>
              </motion.li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="w-4 h-4 text-emerald-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            {copied ? "Copied!" : "Copy Summary"}
          </Button>
          <Button variant="ghost" className="gap-2" onClick={handleReset}>
            <RotateCcw className="w-4 h-4" />
            Process Another
          </Button>
        </div>
      </motion.div>
    );
  };

  const renderNotesResult = () => {
    const r = result as NotesResult;
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        {/* Header Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm"
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Notes Generated!</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{r.title}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/50 border border-border">
                <BookMarked className="w-3.5 h-3.5" />
                {r.totalSections} sections
              </span>
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/50 border border-border">
                <FileSearch className="w-3.5 h-3.5" />
                {r.wordCount.toLocaleString()} words
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}>
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copied ? "Copied!" : "Copy Notes"}
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={handleReset}>
              <RotateCcw className="w-3.5 h-3.5" />
              Process Another
            </Button>
          </div>
        </motion.div>

        {/* Notes Sections — Scrollable */}
        <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-3 custom-scrollbar">
          {r.sections.map((section, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Section heading */}
              <div className="flex items-center gap-2.5 mb-3 pb-2.5 border-b border-border">
                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/10 text-primary text-xs font-bold flex-shrink-0">
                  {i + 1}
                </span>
                <h4 className="text-sm font-bold text-foreground leading-snug">
                  {section.heading}
                </h4>
              </div>

              {/* Bullet points */}
              <ul className="space-y-2 ml-1">
                {section.content.map((point, j) => (
                  <motion.li
                    key={j}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 + j * 0.04 }}
                    className="flex items-start gap-2.5 text-sm leading-relaxed text-foreground/80"
                  >
                    <span className="mt-[7px] h-[5px] w-[5px] rounded-full bg-primary/70 flex-shrink-0" />
                    <span>{point}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </motion.div>
    );
  };

  const renderResumeResult = () => {
    const r = result as ResumeResult;
    const resumeData = result as unknown as ResumeResult & { scoreBreakdown?: { sectionScore: number; keywordScore: number; structureScore: number; lengthScore: number } };
    const breakdown = resumeData.scoreBreakdown;
    const sectionsFound = r.sections.filter((s) => s.found);
    const sectionsMissing = r.sections.filter((s) => !s.found);

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6"
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          <h3 className="text-lg font-bold">Resume Analyzed!</h3>
        </div>

        {/* Score circle */}
        <div className="flex justify-center py-4">
          <div
            className={`relative w-32 h-32 sm:w-36 sm:h-36 rounded-full border-4 flex flex-col items-center justify-center ${getScoreColor(r.atsScore)}`}
          >
            <svg
              className="absolute inset-0 w-full h-full -rotate-90"
              viewBox="0 0 120 120"
            >
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                strokeWidth="4"
                className="stroke-transparent"
              />
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${(r.atsScore / 100) * 339.3} 339.3`}
                className={getScoreRingColor(r.atsScore)}
              />
            </svg>
            <span className="text-3xl sm:text-4xl font-bold leading-none">
              {r.atsScore}
            </span>
            <span className="text-xs text-muted-foreground font-medium mt-0.5">
              /100
            </span>
            <Badge
              variant="outline"
              className="mt-1 text-xs font-bold"
            >
              Grade {r.grade}
            </Badge>
          </div>
        </div>

        {/* Score Breakdown */}
        {breakdown && (
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Target className="w-4 h-4" />
              Score Breakdown
            </p>
            <div className="space-y-2.5">
              {[
                { label: "Section Detection", score: breakdown.sectionScore, max: 40 },
                { label: "Keyword Matching", score: breakdown.keywordScore, max: 30 },
                { label: "Structure Check", score: breakdown.structureScore, max: 20 },
                { label: "Length Check", score: breakdown.lengthScore, max: 10 },
              ].map((item) => {
                const pct = (item.score / item.max) * 100;
                return (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground/80">{item.label}</span>
                        <span className="text-sm font-bold text-foreground">{item.score}/{item.max}</span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                          className={`h-full rounded-full ${
                            pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-400"
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <FileSearch className="w-4 h-4" />
            Resume Stats
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: "Pages",
                value: r.stats.pageCount,
                icon: FileText,
              },
              {
                label: "Words",
                value: r.stats.totalWords.toLocaleString(),
                icon: Hash,
              },
              {
                label: "Sections",
                value: `${sectionsFound.length}/${r.sections.length}`,
                icon: BookMarked,
              },
              {
                label: "Keywords",
                value: `${r.keywordsFound.length}/${r.keywordsFound.length + r.keywordsMissing.length}`,
                icon: Target,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-border bg-muted/50 p-3 text-center"
              >
                <stat.icon className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                <p className="text-lg font-bold leading-none">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Sections found / missing */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Sections Found
            </p>
            <div className="space-y-1.5">
              {sectionsFound.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className="text-emerald-500">&#10003;</span>
                  <span>{s.name}</span>
                </div>
              ))}
            </div>
          </div>
          {sectionsMissing.length > 0 && (
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                Missing Sections
              </p>
              <div className="space-y-1.5">
                {sectionsMissing.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="text-red-500">&#10007;</span>
                    <span className="text-muted-foreground">{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Keywords found / missing */}
        {(r.keywordsFound.length > 0 || r.keywordsMissing.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-500" />
                Keywords Found
              </p>
              <div className="flex flex-wrap gap-1.5">
                {r.keywordsFound.map((kw, i) => (
                  <Badge
                    key={i}
                    variant="secondary"
                    className="rounded-full text-xs bg-emerald-50 text-emerald-700"
                  >
                    {kw}
                  </Badge>
                ))}
              </div>
            </div>
            {r.keywordsMissing.length > 0 && (
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  Keywords Missing
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {r.keywordsMissing.slice(0, 15).map((kw, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="rounded-full text-xs text-red-500 border-red-200"
                    >
                      {kw}
                    </Badge>
                  ))}
                  {r.keywordsMissing.length > 15 && (
                    <Badge
                      variant="outline"
                      className="rounded-full text-xs text-muted-foreground border-border"
                    >
                      +{r.keywordsMissing.length - 15} more
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Strengths / Weaknesses */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Strengths
            </p>
            <ul className="space-y-1.5">
              {r.strengths.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Weaknesses
            </p>
            <ul className="space-y-1.5">
              {r.weaknesses.map((w, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Suggestions */}
        {r.suggestions.length > 0 && (
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Suggestions
            </p>
            <ul className="space-y-1.5">
              {r.suggestions.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button variant="outline" className="gap-2" onClick={handleCopy}>
            {copied ? (
              <Check className="w-4 h-4 text-emerald-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            {copied ? "Copied!" : "Copy Report"}
          </Button>
          <Button variant="ghost" className="gap-2" onClick={handleReset}>
            <RotateCcw className="w-4 h-4" />
            Analyze Another
          </Button>
        </div>
      </motion.div>
    );
  };

  // ── Main render ──
  return (
    <div className="min-h-screen pt-20 bg-background">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileInput}
        accept=".pdf,application/pdf"
        className="hidden"
      />

      {/* ── Hero Section ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-muted/30 to-background pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-10 sm:pb-14">
          {/* Breadcrumb */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <button
              onClick={navigateHome}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              All Tools
            </button>
          </motion.div>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-center mb-6"
          >
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 tracking-tight">
              {meta.title}{" "}
              <span className="text-primary">{meta.titleAccent}</span>
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto text-base sm:text-lg leading-relaxed">
              {meta.description}
            </p>

            {/* Badges */}
            <div className="flex items-center justify-center gap-3 mt-5 flex-wrap">
              <Badge className={`text-xs font-semibold border rounded-full px-3.5 py-1 ${meta.badgeClass}`}>
                <Sparkles className="w-3 h-3 mr-1" />
                {meta.badgeText}
              </Badge>
              <Badge variant="secondary" className="text-xs font-medium rounded-full px-3.5 py-1 bg-muted text-muted-foreground hover:bg-muted border border-border">
                5 {meta.freeActionLabel} left today
              </Badge>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Upload / Process / Results Section ── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <AnimatePresence mode="wait">
          {/* ── Upload + Process (not processing, no result) ── */}
          {!isProcessing && !result && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: 0.2 }}
              className="space-y-4"
            >
              {/* Drop zone (no file) */}
              {!file && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative rounded-xl border-2 border-dashed p-10 sm:p-14 text-center cursor-pointer transition-all bg-card ${
                    isDragOver
                      ? "border-primary/50 bg-primary/5"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className="flex flex-col items-center gap-4">
                    <div
                      className={`w-14 h-14 rounded-xl flex items-center justify-center transition-colors ${
                        isDragOver ? "bg-primary/10" : "bg-muted/50"
                      }`}
                    >
                      <Upload
                        className={`w-7 h-7 transition-colors ${
                          isDragOver ? "text-primary" : "text-primary/70"
                        }`}
                      />
                    </div>
                    <div>
                      <p className="text-base font-semibold mb-1 text-foreground">
                        {isDragOver
                          ? "Drop your PDF here"
                          : "Drop your PDF here or "}
                        {!isDragOver && (
                          <button
                            type="button"
                            className="text-primary hover:text-primary/80 font-semibold underline underline-offset-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              fileInputRef.current?.click();
                            }}
                          >
                            browse
                          </button>
                        )}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      PDF files up to {meta.maxFileSize}MB supported.
                    </p>
                  </div>
                </div>
              )}

              {/* Cloud Storage Import Buttons — ALWAYS visible */}
              <div className="flex items-center gap-3 justify-center">
                <span className="text-xs text-muted-foreground whitespace-nowrap">or import from</span>
                <CloudStorageButtons
                  mode="upload"
                  onFilesSelected={(files) => {
                    if (files.length > 0) handleFileSelection(files[0]);
                  }}
                />
              </div>

              {/* File card (after upload) */}
              {file && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-xl border border-border bg-card shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-foreground">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={removeFile}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-lg bg-red-50 text-red-600 text-sm flex items-center gap-2 border border-red-100"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </motion.div>
              )}

              {/* Action button - always visible, disabled when no file */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="pt-3 space-y-2"
              >
                <Button
                  size="lg"
                  className={`w-full h-12 text-base font-semibold gap-2 rounded-xl ${file ? "shadow-lg shadow-primary/20 hover:shadow-primary/30" : "opacity-50 cursor-not-allowed"}`}
                  disabled={!file || isProcessing}
                  onClick={handleProcess}
                >
                  <Sparkles className="w-5 h-5" />
                  {meta.actionText}
                </Button>
                {file && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground"
                    onClick={removeFile}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" />
                    Reset &amp; Upload Different File
                  </Button>
                )}
              </motion.div>
            </motion.div>
          )}

          {/* ── Processing State ── */}
          {isProcessing && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center py-16"
            >
              {/* Spinner */}
              <div className="relative w-24 h-24 mx-auto mb-8">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                  className="absolute inset-0 rounded-full border-4 border-border border-t-primary"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <ToolIcon className={`w-8 h-8 ${meta.color}`} />
                </div>
              </div>

              <h2 className="text-xl font-semibold mb-2 text-foreground">
                {meta.actionText}&hellip;
              </h2>

              {/* Steps */}
              <div className="max-w-md mx-auto mb-6">
                {meta.steps.map((step, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0.3 }}
                    animate={{ opacity: i <= currentStep ? 1 : 0.3 }}
                    className="flex items-center gap-3 py-1.5"
                  >
                    {i < currentStep ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : i === currentStep ? (
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      >
                        <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent flex-shrink-0" />
                      </motion.div>
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-border flex-shrink-0" />
                    )}
                    <span
                      className={`text-sm ${
                        i <= currentStep
                          ? "font-medium text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {step}
                    </span>
                  </motion.div>
                ))}
              </div>

              {/* Progress bar */}
              <div className="max-w-md mx-auto">
                <Progress value={progress} className="h-2 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {Math.round(progress)}% complete
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Results ── */}
          {result && !isProcessing && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-3xl mx-auto"
            >
              {toolId === "pdf-summary" && renderSummaryResult()}
              {toolId === "pdf-notes" && renderNotesResult()}
              {toolId === "resume-checker" && renderResumeResult()}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ── How It Works Section ── */}
      <section className="bg-muted/50 border-y border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
              How It Works
            </h2>
            <p className="text-muted-foreground">
              Three simple steps to get your results
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            {meta.howItWorks.map((item, i) => {
              const StepIcon = item.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="text-center"
                >
                  <div className="w-14 h-14 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-center mx-auto mb-4">
                    <StepIcon className="w-6 h-6 text-primary" />
                  </div>
                  <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold mb-3">
                    {i + 1}
                  </div>
                  <h3 className="font-bold text-foreground mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Why Use Section ── */}
      <section className="bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
              Why Use {meta.badgeText}?
            </h2>
            <p className="text-muted-foreground">
              Built for speed, privacy, and quality
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {meta.whyUse.map((item, i) => {
              const FeatureIcon = item.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center mb-4">
                    <FeatureIcon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-bold text-foreground mb-1.5">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FAQ Section ── */}
      <section className="bg-muted/50 border-t border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
              Frequently Asked Questions
            </h2>
            <p className="text-muted-foreground">
              Everything you need to know about {meta.badgeText}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Accordion type="single" collapsible className="w-full">
              {meta.faq.map((item, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="bg-card border border-border rounded-xl px-5 mb-3 last:mb-0 shadow-sm"
                >
                  <AccordionTrigger className="text-sm sm:text-base font-semibold text-foreground hover:no-underline py-4">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-foreground/60 leading-relaxed">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
