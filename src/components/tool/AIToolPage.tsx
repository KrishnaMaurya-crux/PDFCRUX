"use client";

import { useState, useRef } from "react";
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
  BrainCircuit,
  Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useAppStore } from "@/lib/store";
import { saveHistory } from "@/lib/history";

// ── Result Types (matching API response shapes) ──────────────────────────────

interface SummaryResult {
  success: boolean;
  title: string;
  bulletPoints: string[];
  wordCount: number;
  readingTime: string;
}

interface NotesResult {
  success: boolean;
  title: string;
  sections: { heading: string; content: string[] }[];
  totalSections: number;
  wordCount: number;
}

interface ResumeResult {
  success: boolean;
  atsScore: number;
  grade: string;
  sections: { name: string; found: boolean }[];
  keywordsFound: string[];
  keywordsMissing: string[];
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  stats: { totalWords: number; pageCount: number };
  scoreBreakdown: {
    sectionScore: number;
    keywordScore: number;
    structureScore: number;
    lengthScore: number;
  };
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
  engineBadge: string;
  howItWorks: { title: string; description: string; icon: React.ComponentType<{ className?: string }> }[];
  whyUse: { title: string; description: string; icon: React.ComponentType<{ className?: string }> }[];
  faq: { question: string; answer: string }[];
  freeActionLabel: string;
  supportsDualUpload?: boolean;
  dualUploadLabel?: string;
  dualUploadPlaceholder?: string;
}

// ── Tool Configs ───────────────────────────────────────────────────────────

const toolMetaMap: Record<ToolId, ToolMeta> = {
  "pdf-summary": {
    title: "AI-Powered PDF",
    titleAccent: "Summarizer",
    description:
      "Upload any PDF and get a professional executive summary powered by Gemini AI. Perfect for research papers, reports, and long documents.",
    badgeText: "Gemini AI",
    badgeClass: "bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200",
    icon: Sparkles,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    actionText: "Generate Summary",
    maxFileSize: 50,
    engineBadge: "gemini-3-flash-preview",
    steps: [
      "Uploading PDF to AI engine...",
      "Gemini is analyzing content...",
      "Generating professional summary...",
    ],
    howItWorks: [
      {
        title: "Upload PDF",
        description:
          "Drag & drop or browse to select any PDF document.",
        icon: UploadCloud,
      },
      {
        title: "Gemini AI Analyzes",
        description:
          "Gemini reads the full document and identifies key themes, arguments, and conclusions.",
        icon: BrainCircuit,
      },
      {
        title: "Get Executive Summary",
        description:
          "Professional bullet-point summary ready to read, copy, or present.",
        icon: FileSearch,
      },
    ],
    whyUse: [
      { title: "AI-Powered", description: "Powered by Google Gemini for deep document understanding.", icon: Sparkles },
      { title: "Professional Quality", description: "Executive-level summaries suitable for business and academia.", icon: ShieldCheck },
      { title: "Multi-Language", description: "Summarizes documents in any language.", icon: Zap },
      { title: "Instant Results", description: "Get your summary in seconds.", icon: Clock },
    ],
    faq: [
      {
        question: "How does the AI summarizer work?",
        answer:
          "Your PDF is sent to our secure AI engine (Gemini) which reads the full content and generates a professional executive summary with key points.",
      },
      {
        question: "What types of PDFs work best?",
        answer:
          "Text-based PDFs work best — research papers, reports, articles, and documents with clear paragraph structure. Scanned PDFs may have limited accuracy.",
      },
      {
        question: "Is my data secure?",
        answer:
          "Your PDF is processed by Gemini AI and is not stored on our servers. The analysis is generated in real-time.",
      },
      {
        question: "How many summaries can I generate?",
        answer:
          "Free users get 3 AI summaries per day. Premium users get unlimited access.",
      },
      {
        question: "Can I copy or print the summary?",
        answer:
          "Yes! You can copy the summary to clipboard with one click. You can also print the page.",
      },
      {
        question: "What languages are supported?",
        answer:
          "Gemini AI supports 40+ languages including English, Hindi, Spanish, French, German, Japanese, and many more.",
      },
    ],
    freeActionLabel: "free AI summaries",
  },
  "pdf-notes": {
    title: "Convert PDF to",
    titleAccent: "AI Study Notes",
    description:
      "Upload any PDF and get structured, exam-ready study notes powered by Gemini AI. Perfect for students, researchers, and professionals.",
    badgeText: "Gemini AI",
    badgeClass: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200",
    icon: BookOpen,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    actionText: "Generate Notes",
    maxFileSize: 50,
    engineBadge: "gemini-3-flash-preview",
    steps: [
      "Uploading PDF to AI engine...",
      "Gemini is detecting structure...",
      "Creating organized study notes...",
    ],
    howItWorks: [
      {
        title: "Upload PDF",
        description:
          "Drag & drop or browse to select any PDF document.",
        icon: UploadCloud,
      },
      {
        title: "Gemini AI Structures",
        description:
          "Gemini identifies sections, key concepts, definitions, and creates logical groupings.",
        icon: BrainCircuit,
      },
      {
        title: "Get Study Notes",
        description:
          "Clean, organized notes with headings and bullet points ready for revision.",
        icon: PenTool,
      },
    ],
    whyUse: [
      { title: "AI-Powered", description: "Gemini creates smarter notes than simple text extraction.", icon: Sparkles },
      { title: "Exam Ready", description: "Focused on key concepts, definitions, and important facts.", icon: PenTool },
      { title: "Smart Structure", description: "Automatically detects and organizes content into sections.", icon: BookOpen },
      { title: "Multi-Language", description: "Generate notes from documents in any language.", icon: Zap },
    ],
    faq: [
      {
        question: "How does the AI notes generator work?",
        answer:
          "Your PDF is analyzed by Gemini AI which identifies the document structure, extracts key concepts, and creates well-organized study notes with headings and bullet points.",
      },
      {
        question: "What types of PDFs work best?",
        answer:
          "PDFs with clear structure work best — textbooks, lecture notes, research papers, and manuals. Gemini can also organize unstructured content.",
      },
      {
        question: "How are notes structured?",
        answer:
          "Notes are organized into logical sections with clear headings. Each section contains 3-5 key bullet points focusing on the most important concepts.",
      },
      {
        question: "How many notes can I generate?",
        answer:
          "Free users get 3 AI note generations per day. Premium users get unlimited access.",
      },
      {
        question: "Can I copy or print the notes?",
        answer:
          "Yes! Use the copy button to copy all notes to clipboard, or print the page directly.",
      },
      {
        question: "What languages are supported?",
        answer:
          "Gemini AI supports 40+ languages. Upload a document in any language and get notes in the same language.",
      },
    ],
    freeActionLabel: "free AI generations",
  },
  "resume-checker": {
    title: "AI Resume",
    titleAccent: "ATS Scorer",
    description:
      "Upload your resume (and job description) and get a detailed ATS compatibility score powered by Gemini AI. Includes keyword matching and improvement suggestions.",
    badgeText: "Gemini AI",
    badgeClass: "bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200",
    icon: UserCheck,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    actionText: "Analyze Resume",
    maxFileSize: 10,
    engineBadge: "gemini-3-flash-preview",
    steps: [
      "Uploading resume to AI engine...",
      "Gemini is analyzing sections...",
      "Matching keywords and scoring...",
      "Generating improvement report...",
    ],
    supportsDualUpload: true,
    dualUploadLabel: "Job Description (Optional)",
    dualUploadPlaceholder:
      "Paste the job description here for better keyword matching and scoring...",
    howItWorks: [
      {
        title: "Upload Resume",
        description:
          "Drag & drop or browse to select your resume PDF.",
        icon: UploadCloud,
      },
      {
        title: "Gemini AI Analyzes",
        description:
          "Gemini checks sections, keywords, structure, and compares against the job description.",
        icon: BrainCircuit,
      },
      {
        title: "Get ATS Score",
        description:
          "Detailed score (0-100) with breakdown, strengths, weaknesses, and improvement tips.",
        icon: Target,
      },
    ],
    whyUse: [
      { title: "AI-Powered", description: "Gemini provides deeper analysis than keyword matching alone.", icon: Sparkles },
      { title: "Job Match", description: "Optionally paste a job description for targeted scoring.", icon: Briefcase },
      { title: "Detailed Report", description: "Section analysis, keyword matching, and actionable scoring.", icon: FileSearch },
      { title: "Actionable Tips", description: "Get specific suggestions to improve your ATS compatibility.", icon: Target },
    ],
    faq: [
      {
        question: "How does the AI resume checker work?",
        answer:
          "Your resume is analyzed by Gemini AI which checks for standard sections, evaluates keyword relevance, assesses formatting, and compares your resume against the job description (if provided).",
      },
      {
        question: "What is ATS?",
        answer:
          "ATS stands for Applicant Tracking System. It's software used by employers to filter resumes. Having an ATS-friendly resume increases your chances of getting noticed.",
      },
      {
        question: "Should I paste the job description?",
        answer:
          "Yes! Pasting the job description gives you a much more accurate and relevant score. Without it, the tool checks general ATS compatibility.",
      },
      {
        question: "How is the ATS score calculated?",
        answer:
          "Gemini AI evaluates 4 categories: Section Detection (0-40), Keyword Matching (0-30), Structure Check (0-20), and Length Check (0-10).",
      },
      {
        question: "Can I check multiple resumes?",
        answer:
          "Free users get 3 AI checks per day. Premium users get unlimited access.",
      },
      {
        question: "How can I improve my score?",
        answer:
          "The AI provides specific suggestions based on your resume — add missing sections, incorporate relevant keywords, use bullet points, and tailor content to the job description.",
      },
    ],
    freeActionLabel: "free AI checks",
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
  const [jobDescription, setJobDescription] = useState("");

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
      // Animated progress
      const steps = meta.steps;
      const stepSize = 100 / steps.length;
      let p = 0;

      const interval = setInterval(() => {
        p += Math.random() * 8 + 2;
        if (p > 92) p = 92;
        const stepIdx = Math.min(
          Math.floor(p / stepSize),
          steps.length - 1
        );
        setCurrentStep(stepIdx);
        setProgress(Math.round(p));
      }, 400);

      let res: SummaryResult | NotesResult | ResumeResult;

      // ── Call the appropriate Gemini API ──
      const endpoint =
        toolId === "pdf-summary"
          ? "/api/gemini/summarize"
          : toolId === "pdf-notes"
          ? "/api/gemini/notes"
          : "/api/gemini/resume";

      const form = new FormData();
      if (toolId === "resume-checker") {
        form.append("resume", file);
        if (jobDescription.trim()) {
          form.append("jobDescription", jobDescription.trim());
        }
      } else {
        form.append("file", file);
      }

      const response = await fetch(endpoint, {
        method: "POST",
        body: form,
      });

      // Check for non-JSON responses (prevents crash on HTML error pages)
      if (!response.ok) {
        let errorMsg = `Server error (${response.status}). Please try again.`;
        try {
          const errBody = await response.json();
          if (errBody?.error) errorMsg = errBody.error;
        } catch {
          // Response wasn't JSON
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "AI analysis failed.");
      }
      res = data as SummaryResult | NotesResult | ResumeResult;

      clearInterval(interval);
      setCurrentStep(steps.length - 1);
      setProgress(100);
      setResult(res);

      // Auto-save to history
      if (file) {
        const toolNames: Record<string, string> = {
          "pdf-summary": "PDF Summary (Gemini AI)",
          "pdf-notes": "PDF Notes (Gemini AI)",
          "resume-checker": "Resume ATS Checker (Gemini AI)",
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
        `Stats: ${r.stats.pageCount} pages, ${r.stats.totalWords} words, ${sectionsFound.length}/${r.sections.length} sections\n\n` +
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
    setJobDescription("");
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

  // ── Render: Gemini AI Processing Animation ──
  const renderProcessing = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-card border border-border rounded-2xl p-8 shadow-sm"
    >
      <div className="flex flex-col items-center text-center space-y-6">
        {/* Dual rotating rings */}
        <div className="relative w-24 h-24">
          <div className="absolute inset-0 rounded-full border-[3px] border-muted animate-[spin_3s_linear_infinite]" />
          <div className="absolute inset-2 rounded-full border-[3px] border-primary/40 animate-[spin_2s_linear_infinite_reverse]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <BrainCircuit className="w-10 h-10 text-primary animate-pulse" />
          </div>
        </div>

        {/* Step text */}
        <div>
          <p className="text-lg font-bold text-foreground">Gemini AI is Analyzing</p>
          <p className="text-sm text-muted-foreground mt-1">
            {meta.steps[currentStep] || "Processing..."}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-xs">
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary/80 to-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">{progress}%</p>
        </div>

        {/* Engine badges */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <Badge variant="outline" className="text-xs gap-1">
            <Sparkles className="w-3 h-3 text-amber-500" />
            Gemini AI
          </Badge>
          <Badge variant="outline" className="text-xs font-mono">
            {meta.engineBadge}
          </Badge>
        </div>
      </div>
    </motion.div>
  );

  // ── Render: Summary Result ──
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
          <Badge variant="outline" className="text-xs gap-1 self-start">
            <Sparkles className="w-3 h-3 text-amber-500" />
            Powered by Gemini AI
          </Badge>
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
          <Button variant="outline" className="gap-2" onClick={handleCopy}>
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

  // ── Render: Notes Result ──
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
              <Badge variant="outline" className="text-xs gap-1">
                <Sparkles className="w-3 h-3 text-emerald-500" />
                Gemini AI
              </Badge>
            </div>
          </div>

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
              <div className="flex items-center gap-2.5 mb-3 pb-2.5 border-b border-border">
                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/10 text-primary text-xs font-bold flex-shrink-0">
                  {i + 1}
                </span>
                <h4 className="text-sm font-bold text-foreground leading-snug">
                  {section.heading}
                </h4>
              </div>

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

  // ── Render: Resume Result ──
  const renderResumeResult = () => {
    const r = result as ResumeResult;
    const breakdown = r.scoreBreakdown;
    const sectionsFound = r.sections.filter((s) => s.found);
    const sectionsMissing = r.sections.filter((s) => !s.found);

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <h3 className="text-lg font-bold">Resume Analyzed!</h3>
          </div>
          <Badge variant="outline" className="text-xs gap-1">
            <Sparkles className="w-3 h-3 text-blue-500" />
            Gemini AI
          </Badge>
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
              { label: "Pages", value: r.stats.pageCount, icon: FileText },
              { label: "Words", value: r.stats.totalWords.toLocaleString(), icon: Hash },
              { label: "Sections", value: `${sectionsFound.length}/${r.sections.length}`, icon: BookMarked },
              { label: "Keywords", value: `${r.keywordsFound.length}/${r.keywordsFound.length + r.keywordsMissing.length}`, icon: Target },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border bg-muted/50 p-3 text-center">
                <stat.icon className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                <p className="text-lg font-bold leading-none">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
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
                <div key={i} className="flex items-center gap-2 text-sm">
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
                  <div key={i} className="flex items-center gap-2 text-sm">
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
                  <Badge key={i} variant="secondary" className="rounded-full text-xs bg-emerald-50 text-emerald-700">
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
                    <Badge key={i} variant="outline" className="rounded-full text-xs text-red-500 border-red-200">
                      {kw}
                    </Badge>
                  ))}
                  {r.keywordsMissing.length > 15 && (
                    <Badge variant="outline" className="rounded-full text-xs text-muted-foreground border-border">
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
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Strengths</p>
            <ul className="space-y-1.5">
              {r.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Weaknesses</p>
            <ul className="space-y-1.5">
              {r.weaknesses.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
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
                <li key={i} className="flex items-start gap-2 text-sm">
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
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
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
              <Badge variant="outline" className="text-xs font-mono rounded-full px-3.5 py-1">
                {meta.engineBadge}
              </Badge>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Upload / Result Section ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <AnimatePresence mode="wait">
          {/* ── Processing State ── */}
          {isProcessing && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {renderProcessing()}
            </motion.div>
          )}

          {/* ── Result State ── */}
          {!isProcessing && result && (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {toolId === "pdf-summary" && renderSummaryResult()}
              {toolId === "pdf-notes" && renderNotesResult()}
              {toolId === "resume-checker" && renderResumeResult()}
            </motion.div>
          )}

          {/* ── Upload State ── */}
          {!isProcessing && !result && (
            <motion.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* Error message */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                  <button onClick={() => setError(null)} className="ml-auto">
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}

              {/* File upload area */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  relative cursor-pointer rounded-2xl border-2 border-dashed p-10 sm:p-12
                  text-center transition-all duration-200
                  ${isDragOver
                    ? "border-primary bg-primary/5 scale-[1.01]"
                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                  }
                  ${file ? "border-primary/30 bg-primary/5" : ""}
                `}
              >
                {file ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{file.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile();
                      }}
                    >
                      <X className="w-3.5 h-3.5" />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className={`w-14 h-14 rounded-2xl ${meta.bgColor} flex items-center justify-center`}>
                      <Upload className={`w-7 h-7 ${meta.color}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        Drag & drop your PDF here
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        or click to browse — max {meta.maxFileSize} MB
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Dual upload: Job Description (Resume Checker only) */}
              {toolId === "resume-checker" && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="space-y-2"
                >
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Briefcase className="w-4 h-4 text-muted-foreground" />
                    {meta.dualUploadLabel}
                  </label>
                  <Textarea
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder={meta.dualUploadPlaceholder}
                    className="min-h-[120px] resize-y"
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste a job description for more accurate keyword matching and scoring.
                  </p>
                </motion.div>
              )}

              {/* Action button */}
              <div className="flex justify-center">
                <Button
                  size="lg"
                  className="gap-2 px-8"
                  disabled={!file}
                  onClick={handleProcess}
                >
                  <ToolIcon className="w-5 h-5" />
                  {meta.actionText}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── How It Works ── */}
        <div className="mt-16">
          <h2 className="text-xl sm:text-2xl font-bold text-center mb-8">How It Works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {meta.howItWorks.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.1 }}
                className="text-center p-5 rounded-xl border border-border bg-card"
              >
                <div className={`w-12 h-12 rounded-xl ${meta.bgColor} flex items-center justify-center mx-auto mb-3`}>
                  <item.icon className={`w-6 h-6 ${meta.color}`} />
                </div>
                <h3 className="font-semibold mb-1">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── Why Use ── */}
        <div className="mt-12">
          <h2 className="text-xl sm:text-2xl font-bold text-center mb-8">Why Use This Tool?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {meta.whyUse.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card"
              >
                <item.icon className={`w-5 h-5 ${meta.color} flex-shrink-0 mt-0.5`} />
                <div>
                  <p className="font-semibold text-sm">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── FAQ ── */}
        <div className="mt-12">
          <h2 className="text-xl sm:text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-3 max-w-2xl mx-auto">
            {meta.faq.map((item, i) => (
              <details key={i} className="group rounded-xl border border-border bg-card">
                <summary className="flex items-center justify-between cursor-pointer p-4 text-sm font-medium hover:text-primary transition-colors">
                  {item.question}
                  <span className="text-muted-foreground group-open:rotate-180 transition-transform">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </summary>
                <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
                  {item.answer}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
