"use client";

import { motion, useInView } from "framer-motion";
import { ArrowRight, ChevronRight, Sparkles, Zap } from "lucide-react";
import { toolCategories } from "@/lib/tools";
import { useAppStore } from "@/lib/store";
import { useState, useEffect, useRef } from "react";

// ========================
// AI Powered Badge with Continuous Shining Effect
// ========================
function AIPoweredBadge() {
  const badgeRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(badgeRef, { once: true, margin: "-80px" });

  return (
    <div className="mb-5 flex justify-center">
      <motion.div
        ref={badgeRef}
        initial={{ opacity: 0, scale: 0.7 }}
        animate={isInView ? { opacity: 1, scale: 1 } : {}}
        transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.05 }}
        className="relative inline-flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-red-600 to-primary text-white font-bold text-sm tracking-wide shadow-lg shadow-red-500/20 overflow-hidden"
      >
        {/* Continuous shine sweep — always runs via CSS keyframes */}
        {isInView && (
          <>
            <span className="ai-badge-shine" />
            <span className="ai-badge-shine-delayed" />
            <span className="ai-badge-glow" />
          </>
        )}

        {/* Badge content */}
        <span className="relative flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          <span>AI Powered</span>
        </span>

        {/* Inline keyframes for continuous shine */}
        {isInView && (
          <style>{`
            @keyframes ai-shine {
              0%   { transform: translateX(-100%) skewX(-15deg); }
              100% { transform: translateX(200%) skewX(-15deg); }
            }
            @keyframes ai-glow-pulse {
              0%   { box-shadow: 0 0 0 0 rgba(220,38,38,0.45); }
              70%  { box-shadow: 0 0 12px 4px rgba(220,38,38,0.15); }
              100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); }
            }
            .ai-badge-shine {
              position: absolute; inset: 0;
              background: linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent);
              animation: ai-shine 2.2s ease-in-out infinite;
              pointer-events: none;
            }
            .ai-badge-shine-delayed {
              position: absolute; inset: 0;
              background: linear-gradient(90deg, transparent, rgba(255,255,255,0.13), transparent);
              animation: ai-shine 2.2s ease-in-out 1.1s infinite;
              pointer-events: none;
            }
            .ai-badge-glow {
              position: absolute; inset: 0;
              border-radius: 9999px;
              animation: ai-glow-pulse 2s ease-out infinite;
              pointer-events: none;
            }
          `}</style>
        )}
      </motion.div>
    </div>
  );
}

// ========================
// Animated Counter Component
// ========================
function AnimatedCounter({ target, suffix = "+" }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    const duration = 1200;
    const steps = 30;
    const increment = target / steps;
    let current = 0;
    const interval = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(interval);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(interval);
  }, [isInView, target]);

  return (
    <span ref={ref} className="inline-block">
      {count}{suffix}
    </span>
  );
}

export default function ToolsGrid() {
  const { selectTool } = useAppStore();
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const aiCategory = toolCategories.find((c) => c.isAICategory);
  const otherCategories = toolCategories.filter((c) => !c.isAICategory);
  const totalToolCount = toolCategories.reduce((sum, c) => sum + c.tools.length, 0);

  return (
    <section id="tools-grid" className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ======================== */}
        {/* MAIN SECTION HEADER (top) */}
        {/* ======================== */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12 sm:mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            <span className="text-red-600 dark:text-red-500 font-extrabold">
              <AnimatedCounter target={totalToolCount} suffix="+" />
            </span>{" "}
            Professional PDF Tools
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything you need to work with PDFs, organized into intuitive
            categories. Click any tool to get started.
          </p>
        </motion.div>

        {/* ======================== */}
        {/* AI TOOLS PREMIUM SECTION */}
        {/* ======================== */}
        {aiCategory && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-16 sm:mb-20"
          >
            {/* Gradient wrapper */}
            <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden">
              {/* Background gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/[0.08] to-transparent dark:from-primary/10 dark:via-primary/[0.12] dark:to-transparent" />
              <div className="absolute top-0 right-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/3 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />

              {/* Content */}
              <div className="relative px-6 sm:px-10 pt-8 sm:pt-10 pb-8 sm:pb-10">
                {/* Section Header */}
                <div className="text-center mb-8 sm:mb-10">
                  {/* AI Powered Badge with Shining Effect */}
                  <AIPoweredBadge />

                  {/* Title */}
                  <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-3">
                    AI Tools powered by{" "}
                    <span className="relative inline-block">
                      <span className="bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent font-extrabold">
                        Gemini
                      </span>
                      <motion.span
                        className="absolute -bottom-1 left-0 w-full h-0.5 bg-gradient-to-r from-primary to-primary/30 rounded-full"
                        initial={{ scaleX: 0 }}
                        whileInView={{ scaleX: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.4, duration: 0.6 }}
                        style={{ transformOrigin: "left" }}
                      />
                    </span>
                  </h2>

                  {/* Subtitle */}
                  <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto leading-relaxed">
                    Smart AI-powered tools for students and job seekers
                  </p>
                </div>

                {/* AI Tool Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 max-w-4xl mx-auto">
                  {aiCategory.tools.map((tool, toolIndex) => (
                    <motion.button
                      key={tool.id}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.15 + toolIndex * 0.1 }}
                      whileHover={{ y: -4, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => selectTool(tool.id)}
                      className="group relative flex flex-col text-left rounded-2xl border bg-card/80 backdrop-blur-sm p-5 sm:p-6 shadow-sm hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30 transition-all duration-300 overflow-hidden"
                    >
                      {/* Subtle glow on hover */}
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/[0.04] group-hover:to-transparent transition-all duration-300" />

                      <div className="relative">
                        {/* Icon */}
                        <div className="mb-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${tool.bgColor} group-hover:scale-110 transition-transform duration-300 shadow-sm`}>
                            <tool.icon className={`w-6 h-6 ${tool.color}`} />
                          </div>
                        </div>

                        {/* Title + Badge */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-sm sm:text-base font-bold group-hover:text-primary transition-colors leading-tight">
                            {tool.name}
                          </span>
                          <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/8 text-[10px] font-semibold text-primary/80 border border-primary/10 uppercase tracking-wider">
                            <Zap className="w-2.5 h-2.5" />
                            AI
                          </span>
                        </div>

                        {/* Description */}
                        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-2">
                          {tool.description}
                        </p>

                        {/* CTA */}
                        <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200">
                          Try now
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ======================== */}
        {/* ALL OTHER TOOLS SECTION */}
        {/* ======================== */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          {/* Tool categories */}
          <div className="space-y-12">
            {otherCategories.map((category, catIndex) => (
              <motion.div
                key={category.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: catIndex * 0.05 }}
              >
                {/* Category header */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl sm:text-2xl font-semibold">
                      {category.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {category.description}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setExpandedCategory(
                        expandedCategory === category.id ? null : category.id
                      )
                    }
                    className="text-sm text-primary font-medium hover:underline flex items-center gap-1 sm:hidden"
                  >
                    {expandedCategory === category.id ? "Less" : "All"}
                    <ChevronRight
                      className={`w-4 h-4 transition-transform ${
                        expandedCategory === category.id ? "rotate-90" : ""
                      }`}
                    />
                  </button>
                </div>

                {/* Tools grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                  {category.tools.map((tool, toolIndex) => (
                    <motion.button
                      key={tool.id}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: catIndex * 0.03 + toolIndex * 0.03 }}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => selectTool(tool.id)}
                      className="group relative flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-accent/50 hover:border-primary/20 hover:shadow-md transition-all text-left tool-card-gradient"
                    >
                      {/* Icon */}
                      <div
                        className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${tool.bgColor} group-hover:scale-105 transition-transform`}
                      >
                        <tool.icon className={`w-5 h-5 ${tool.color}`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold group-hover:text-primary transition-colors">
                            {tool.name}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                          {tool.description}
                        </p>
                      </div>

                      {/* Arrow */}
                      <ArrowRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
