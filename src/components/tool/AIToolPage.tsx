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
  Loader2,
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
    maxFileSize: 20,
    engineBadge: "gemini-1.5-flash-8b",
    steps: [
      "Uploading PDF to Gemini AI...",
      "Gemini is reading your document...",
      "Analyzing key themes and arguments...",
      "Generating professional summary...",
    ],
    howItWorks: [
      {
        title: "Upload PDF",
        description: "Drag & drop or browse to select any PDF document.",
        icon: UploadCloud,
      },
      {
        title: "Gemini AI Analyzes",
        description: "Gemini natively reads your PDF and identifies key themes, arguments, and conclusions.",
        icon: BrainCircuit,
      },
      {
        title: "Get Executive Summary",
        description: "Professional bullet-point summary ready to read, copy, or present.",
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
      { question: "How does the AI summarizer work?", answer: "Your PDF is sent directly to Gemini AI which natively reads the full document and generates a professional executive summary with key points." },
      { question: "What types of PDFs work best?", answer: "All PDFs work — text-based, scanned, research papers, reports, articles, and documents with complex layouts or images." },
      { question: "Is my data secure?", answer: "Your PDF is processed by Gemini AI and is not stored on our servers. The analysis is generated in real-time." },
      { question: "How many summaries can I generate?", answer: "Free users get 3 AI summaries per day. Premium users get unlimited access." },
      { question: "Can I copy or print the summary?", answer: "Yes! You can copy the summary to clipboard with one click. You can also print the page." },
      { question: "What languages are supported?", answer: "Gemini AI supports 40+ languages including English, Hindi, Spanish, French, German, Japanese, and many more." },
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
    maxFileSize: 20,
    engineBadge: "gemini-1.5-flash-8b",
    steps: [
      "Uploading PDF to Gemini AI...",
      "Gemini is reading your document...",
      "Detecting structure and key concepts...",
      "Creating organized study notes...",
    ],
    howItWorks: [
      { title: "Upload PDF", description: "Drag & drop or browse to select any PDF document.", icon: UploadCloud },
      { title: "Gemini AI Structures", description: "Gemini natively reads your PDF, identifies sections, key concepts, and creates logical groupings.", icon: BrainCircuit },
      { title: "Get Study Notes", description: "Clean, organized notes with headings and bullet points ready for revision.", icon: PenTool },
    ],
    whyUse: [
      { title: "AI-Powered", description: "Gemini creates smarter notes than simple text extraction.", icon: Sparkles },
      { title: "Exam Ready", description: "Focused on key concepts, definitions, and important facts.", icon: PenTool },
      { title: "Smart Structure", description: "Automatically detects and organizes content into sections.", icon: BookOpen },
      { title: "Multi-Language", description: "Generate notes from documents in any language.", icon: Zap },
    ],
    faq: [
      { question: "How does the AI notes generator work?", answer: "Your PDF is sent directly to Gemini AI which natively reads the document, identifies structure, extracts key concepts, and creates well-organized study notes." },
      { question: "What types of PDFs work best?", answer: "All PDFs work — textbooks, lecture notes, research papers, manuals, scanned documents, and more." },
      { question: "How are notes structured?", answer: "Notes are organized into logical sections with clear headings. Each section contains 3-5 key bullet points focusing on the most important concepts." },
      { question: "How many notes can I generate?", answer: "Free users get 3 AI note generations per day. Premium users get unlimited access." },
      { question: "Can I copy or print the notes?", answer: "Yes! Use the copy button to copy all notes to clipboard, or print the page directly." },
      { question: "What languages are supported?", answer: "Gemini AI supports 40+ languages. Upload a document in any language and get notes in the same language." },
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
    maxFileSize: 20,
    engineBadge: "gemini-1.5-flash-8b",
    steps: [
      "Uploading resume to Gemini AI...",
      "Gemini is reading your resume...",
      "Analyzing sections and keywords...",
      "Generating ATS score report...",
    ],
    supportsDualUpload: true,
    dualUploadLabel: "Job Description (Optional)",
    dualUploadPlaceholder: "Paste the job description here for better keyword matching and scoring...",
    howItWorks: [
      { title: "Upload Resume", description: "Drag & drop or browse to select your resume PDF.", icon: UploadCloud },
      { title: "Gemini AI Analyzes", description: "Gemini natively reads your resume, checks sections, keywords, structure, and compares against the job description.", icon: BrainCircuit },
      { title: "Get ATS Score", description: "Detailed score (0-100) with breakdown, strengths, weaknesses, and improvement tips.", icon: Target },
    ],
    whyUse: [
      { title: "AI-Powered", description: "Gemini provides deeper analysis than keyword matching alone.", icon: Sparkles },
      { title: "Job Match", description: "Optionally paste a job description for targeted scoring.", icon: Briefcase },
      { title: "Detailed Report", description: "Section analysis, keyword matching, and actionable scoring.", icon: FileSearch },
      { title: "Actionable Tips", description: "Get specific suggestions to improve your ATS compatibility.", icon: Target },
    ],
    faq: [
      { question: "How does the AI resume checker work?", answer: "Your resume PDF is sent directly to Gemini AI which natively reads it, checks for standard sections, evaluates keywords, and compares against the job description." },
      { question: "What is ATS?", answer: "ATS stands for Applicant Tracking System. It's software used by employers to filter resumes." },
      { question: "Should I paste the job description?", answer: "Yes! Pasting the job description gives you a much more accurate and relevant score." },
      { question: "How is the ATS score calculated?", answer: "Gemini AI evaluates 4 categories: Section Detection (0-40), Keyword Matching (0-30), Structure Check (0-20), and Length Check (0-10)." },
      { question: "Can I check multiple resumes?", answer: "Free users get 3 AI checks per day. Premium users get unlimited access." },
      { question: "How can I improve my score?", answer: "The AI provides specific suggestions — add missing sections, incorporate relevant keywords, use bullet points, and tailor content to the job description." },
    ],
    freeActionLabel: "free AI checks",
  },
};

// ── Component ──────────────────────────────────────────────────────────────

export default function AIToolPage({ toolId }: { toolId: string }) {
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
  const [result, setResult] = useState<SummaryResult | NotesResult | ResumeResult | null>(null);
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
    if (e.target.files && e.target.files[0]) handleFileSelection(e.target.files[0]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setProgress(0);
    setCurrentStep(0);
  };

  // ── Processing: Send raw PDF file to backend → Gemini inlineData ──
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
      const steps = meta.steps;

      // Animated progress
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 92) return prev;
          return prev + Math.random() * 6 + 2;
        });
        setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
      }, 800);

      // ── Build FormData with raw PDF file ──
      const form = new FormData();

      if (toolId === "resume-checker") {
        form.append("resume", file);
        if (jobDescription.trim()) {
          form.append("jobDescription", jobDescription.trim());
        }
      } else {
        form.append("file", file);
      }

      // ── Call API ──
      const endpoint =
        toolId === "pdf-summary"
          ? "/api/gemini/summarize"
          : toolId === "pdf-notes"
          ? "/api/gemini/notes"
          : "/api/gemini/resume";

      const response = await fetch(endpoint, {
        method: "POST",
        body: form,
      });

      clearInterval(interval);

      // ── Parse response safely ──
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

      const res = data as SummaryResult | NotesResult | ResumeResult;

      setProgress(100);
      setCurrentStep(steps.length - 1);
      setResult(res);

      // Auto-save to history
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed. Please try again.");
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
      const sf = r.sections.filter((s) => s.found).map((s) => s.name);
      const sm = r.sections.filter((s) => !s.found).map((s) => s.name);
      textToCopy = `Resume ATS Score: ${r.atsScore}/100 (Grade ${r.grade})\n\nSections Found: ${sf.join(", ")}\n${sm.length > 0 ? `Missing: ${sm.join(", ")}\n` : ""}\nStrengths:\n${r.strengths.map((s) => `• ${s}`).join("\n")}\nSuggestions:\n${r.suggestions.map((s) => `• ${s}`).join("\n")}`;
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

  // ── Render: Processing Animation ──
  const renderProcessing = () => (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-card border border-border rounded-2xl p-8 shadow-sm">
      <div className="flex flex-col items-center text-center space-y-6">
        <div className="relative w-24 h-24">
          <div className="absolute inset-0 rounded-full border-[3px] border-muted animate-[spin_3s_linear_infinite]" />
          <div className="absolute inset-2 rounded-full border-[3px] border-primary/40 animate-[spin_2s_linear_infinite_reverse]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <BrainCircuit className="w-10 h-10 text-primary animate-pulse" />
          </div>
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">Gemini AI is Analyzing</p>
          <p className="text-sm text-muted-foreground mt-1">{meta.steps[currentStep] || "Processing..."}</p>
        </div>
        <div className="w-full max-w-xs">
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <motion.div className="h-full bg-gradient-to-r from-primary/80 to-primary rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.min(progress, 100)}%` }} transition={{ duration: 0.3 }} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">{Math.round(progress)}%</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <Badge variant="outline" className="text-xs gap-1"><Sparkles className="w-3 h-3 text-amber-500" />Gemini AI</Badge>
          <Badge variant="outline" className="text-xs font-mono">{meta.engineBadge}</Badge>
        </div>
      </div>
    </motion.div>
  );

  // ── Render: Error ──
  const renderError = () => (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl p-6 text-center space-y-3">
      <div className="flex justify-center">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-red-500" />
        </div>
      </div>
      <p className="text-sm font-bold text-red-800 dark:text-red-200">Processing Failed</p>
      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      <Button variant="outline" size="sm" className="gap-2 border-red-200 text-red-700 hover:bg-red-100" onClick={handleReset}>
        <RotateCcw className="w-3.5 h-3.5" />Try Again
      </Button>
    </motion.div>
  );

  // ── Render: File Upload ──
  const renderUpload = () => (
    <div className="space-y-4">
      <div
        className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all cursor-pointer ${
          isDragOver ? "border-primary bg-primary/5 scale-[1.01]" : file ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/20" : "border-border hover:border-primary/50 hover:bg-muted/50"
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !file && fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileInput} />
        {!file ? (
          <div className="space-y-4">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <UploadCloud className="w-8 h-8 text-primary" />
            </div>
            <p className="text-sm font-bold text-foreground">Drop your PDF here or click to browse</p>
            <p className="text-xs text-muted-foreground">Maximum {meta.maxFileSize} MB</p>
          </div>
        ) : (
          <div className="flex items-center gap-4 text-left">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); removeFile(); }}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {file && meta.supportsDualUpload && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          <label className="text-sm font-medium text-foreground flex items-center gap-2"><Briefcase className="w-4 h-4" />{meta.dualUploadLabel}</label>
          <Textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder={meta.dualUploadPlaceholder} className="min-h-[100px] resize-none text-sm" />
          <p className="text-xs text-muted-foreground">Paste a job description for more accurate keyword matching.</p>
        </motion.div>
      )}

      {file && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Button className="w-full gap-2 h-12 text-sm font-bold" onClick={handleProcess} disabled={isProcessing}>
            {meta.icon && <meta.icon className="w-4 h-4" />}{meta.actionText}
          </Button>
        </motion.div>
      )}
    </div>
  );

  // ── Render: Summary Result ──
  const renderSummaryResult = () => {
    const r = result as SummaryResult;
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1"><CheckCircle2 className="w-5 h-5 text-emerald-500" /><h3 className="text-lg font-bold">Summary Generated!</h3></div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><FileSearch className="w-3.5 h-3.5" />{r.wordCount.toLocaleString()} words</span>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{r.readingTime}</span>
            </div>
          </div>
          <Badge variant="outline" className="text-xs gap-1 self-start"><Sparkles className="w-3 h-3 text-amber-500" />Powered by Gemini AI</Badge>
        </div>
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2"><Target className="w-4 h-4" />Key Points</p>
          <ul className="space-y-2">
            {r.bulletPoints.map((point, i) => (
              <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-start gap-3 text-sm leading-relaxed">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" /><span>{point}</span>
              </motion.li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button variant="outline" className="gap-2" onClick={handleCopy}>{copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}{copied ? "Copied!" : "Copy Summary"}</Button>
          <Button variant="ghost" className="gap-2" onClick={handleReset}><RotateCcw className="w-4 h-4" />Process Another</Button>
        </div>
      </motion.div>
    );
  };

  // ── Render: Notes Result ──
  const renderNotesResult = () => {
    const r = result as NotesResult;
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5"><CheckCircle2 className="w-5 h-5 text-emerald-500" /></div>
              <div><h3 className="text-lg font-bold text-foreground">Notes Generated!</h3><p className="text-sm text-muted-foreground mt-0.5">{r.title}</p></div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/50 border border-border"><BookMarked className="w-3.5 h-3.5" />{r.totalSections} sections</span>
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/50 border border-border"><FileSearch className="w-3.5 h-3.5" />{r.wordCount.toLocaleString()} words</span>
              <Badge variant="outline" className="text-xs gap-1"><Sparkles className="w-3 h-3 text-emerald-500" />Gemini AI</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}>{copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}{copied ? "Copied!" : "Copy Notes"}</Button>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={handleReset}><RotateCcw className="w-3.5 h-3.5" />Process Another</Button>
          </div>
        </motion.div>
        <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-3 custom-scrollbar">
          {r.sections.map((section, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2.5 mb-3 pb-2.5 border-b border-border">
                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/10 text-primary text-xs font-bold flex-shrink-0">{i + 1}</span>
                <h4 className="text-sm font-bold text-foreground leading-snug">{section.heading}</h4>
              </div>
              <ul className="space-y-2 ml-1">
                {section.content.map((point, j) => (
                  <motion.li key={j} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 + j * 0.04 }} className="flex items-start gap-2.5 text-sm leading-relaxed text-foreground/80">
                    <span className="mt-[7px] h-[5px] w-[5px] rounded-full bg-primary/70 flex-shrink-0" /><span>{point}</span>
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
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-500" /><h3 className="text-lg font-bold">Resume Analyzed!</h3></div>
          <Badge variant="outline" className="text-xs gap-1"><Sparkles className="w-3 h-3 text-blue-500" />Gemini AI</Badge>
        </div>

        <div className="flex justify-center py-4">
          <div className={`relative w-32 h-32 sm:w-36 sm:h-36 rounded-full border-4 flex flex-col items-center justify-center ${getScoreColor(r.atsScore)}`}>
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="54" fill="none" strokeWidth="4" className="stroke-transparent" />
              <circle cx="60" cy="60" r="54" fill="none" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(r.atsScore / 100) * 339.3} 339.3`} className={getScoreRingColor(r.atsScore)} />
            </svg>
            <span className="text-3xl sm:text-4xl font-bold leading-none">{r.atsScore}</span>
            <span className="text-xs text-muted-foreground font-medium mt-0.5">/100</span>
            <Badge variant="outline" className="mt-1 text-xs font-bold">Grade {r.grade}</Badge>
          </div>
        </div>

        {breakdown && (
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2"><Target className="w-4 h-4" />Score Breakdown</p>
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
                        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: "easeOut" }} className={`h-full rounded-full ${pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-400"}`} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2"><FileSearch className="w-4 h-4" />Resume Stats</p>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />Sections Found</p>
            <div className="space-y-1.5">{sectionsFound.map((s, i) => <div key={i} className="flex items-center gap-2 text-sm"><span className="text-emerald-500">&#10003;</span><span>{s.name}</span></div>)}</div>
          </div>
          {sectionsMissing.length > 0 && (
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-red-500" />Missing Sections</p>
              <div className="space-y-1.5">{sectionsMissing.map((s, i) => <div key={i} className="flex items-center gap-2 text-sm"><span className="text-red-500">&#10007;</span><span className="text-muted-foreground">{s.name}</span></div>)}</div>
            </div>
          )}
        </div>

        {(r.keywordsFound.length > 0 || r.keywordsMissing.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2"><Zap className="w-4 h-4 text-emerald-500" />Keywords Found</p>
              <div className="flex flex-wrap gap-1.5">{r.keywordsFound.map((kw, i) => <Badge key={i} variant="secondary" className="rounded-full text-xs bg-emerald-50 text-emerald-700">{kw}</Badge>)}</div>
            </div>
            {r.keywordsMissing.length > 0 && (
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-red-500" />Keywords Missing</p>
                <div className="flex flex-wrap gap-1.5">
                  {r.keywordsMissing.slice(0, 15).map((kw, i) => <Badge key={i} variant="outline" className="rounded-full text-xs text-red-500 border-red-200">{kw}</Badge>)}
                  {r.keywordsMissing.length > 15 && <Badge variant="outline" className="rounded-full text-xs text-muted-foreground border-border">+{r.keywordsMissing.length - 15} more</Badge>}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Strengths</p>
            <ul className="space-y-1.5">{r.strengths.map((s, i) => <li key={i} className="flex items-start gap-2 text-sm"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" /><span>{s}</span></li>)}</ul>
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Weaknesses</p>
            <ul className="space-y-1.5">{r.weaknesses.map((w, i) => <li key={i} className="flex items-start gap-2 text-sm"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" /><span>{w}</span></li>)}</ul>
          </div>
        </div>

        {r.suggestions.length > 0 && (
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2"><ShieldCheck className="w-4 h-4" />Suggestions</p>
            <ul className="space-y-1.5">{r.suggestions.map((s, i) => <li key={i} className="flex items-start gap-2 text-sm"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" /><span>{s}</span></li>)}</ul>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button variant="outline" className="gap-2" onClick={handleCopy}>{copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}{copied ? "Copied!" : "Copy Report"}</Button>
          <Button variant="ghost" className="gap-2" onClick={handleReset}><RotateCcw className="w-4 h-4" />Analyze Another</Button>
        </div>
      </motion.div>
    );
  };

  // ── Main Render ──
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={navigateHome}><ArrowLeft className="w-4 h-4" /></Button>
          <div className="flex items-center gap-2"><ToolIcon className={`w-5 h-5 ${meta.color}`} /><span className="text-sm font-bold">{meta.title} <span className={meta.color}>{meta.titleAccent}</span></span></div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {!result && !isProcessing && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center"><ToolIcon className={`w-8 h-8 ${meta.color}`} /></div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{meta.title} <span className={meta.color}>{meta.titleAccent}</span></h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-lg mx-auto">{meta.description}</p>
            <Badge variant="outline" className={meta.badgeClass}>{meta.badgeText}</Badge>
          </motion.div>
        )}

        {isProcessing ? renderProcessing() : result ? (toolId === "pdf-summary" ? renderSummaryResult() : toolId === "pdf-notes" ? renderNotesResult() : renderResumeResult()) : error ? renderError() : renderUpload()}

        {!result && !isProcessing && !error && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {meta.howItWorks.map((item, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4 text-center space-y-2">
                  <div className="mx-auto w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><item.icon className="w-5 h-5 text-primary" /></div>
                  <p className="text-sm font-bold text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm font-bold text-foreground mb-3">Why Use This Tool?</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {meta.whyUse.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <item.icon className={`w-4 h-4 ${meta.color} flex-shrink-0 mt-0.5`} />
                    <div><p className="text-xs font-bold text-foreground">{item.title}</p><p className="text-xs text-muted-foreground">{item.description}</p></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card">
              <div className="p-5 border-b border-border"><p className="text-sm font-bold text-foreground">Frequently Asked Questions</p></div>
              <div className="divide-y divide-border">{meta.faq.map((item, i) => <div key={i} className="p-4"><p className="text-sm font-medium text-foreground">{item.question}</p><p className="text-xs text-muted-foreground mt-1">{item.answer}</p></div>)}</div>
            </div>
          </motion.div>
        )}
      </main>

      <footer className="border-t border-border bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 text-center">
          <p className="text-xs text-muted-foreground">Powered by <span className="font-medium text-foreground">Gemini AI</span> — {meta.freeActionLabel} per day for free users</p>
        </div>
      </footer>
    </div>
  );
}
