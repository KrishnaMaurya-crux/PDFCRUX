"use client";

import { motion } from "framer-motion";
import {
  FileText,
  ArrowRight,
  Zap,
  Shield,
  Globe,
  Star,
  Lock,
  Scissors,
  Layers,
  Image,
  PenTool,
  FileSpreadsheet,
  FileDown,
  RotateCw,
  Minimize2,
  Droplets,
  Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/lib/store";
import { useLanguage } from "@/lib/i18n";
import { type LucideIcon } from "lucide-react";

// ========================
// Floating background icons with gentle animation
// ========================
const floatingIcons: { icon: LucideIcon; color: string; size: number; top: string; left: string; delay: number; duration: number }[] = [
  { icon: FileText, color: "text-red-400 dark:text-red-300", size: 36, top: "8%", left: "5%", delay: 0, duration: 18 },
  { icon: Lock, color: "text-rose-400 dark:text-rose-300", size: 32, top: "12%", left: "85%", delay: 2, duration: 22 },
  { icon: Scissors, color: "text-amber-400 dark:text-amber-300", size: 30, top: "68%", left: "7%", delay: 4, duration: 20 },
  { icon: Layers, color: "text-orange-400 dark:text-orange-300", size: 34, top: "72%", left: "88%", delay: 1, duration: 19 },
  { icon: Image, color: "text-pink-400 dark:text-pink-300", size: 32, top: "22%", left: "14%", delay: 3, duration: 21 },
  { icon: FileSpreadsheet, color: "text-green-400 dark:text-green-300", size: 34, top: "58%", left: "80%", delay: 5, duration: 23 },
  { icon: PenTool, color: "text-violet-400 dark:text-violet-300", size: 30, top: "42%", left: "3%", delay: 2.5, duration: 17 },
  { icon: FileDown, color: "text-teal-400 dark:text-teal-300", size: 32, top: "82%", left: "18%", delay: 1.5, duration: 20 },
  { icon: RotateCw, color: "text-purple-400 dark:text-purple-300", size: 28, top: "32%", left: "90%", delay: 3.5, duration: 18 },
  { icon: Minimize2, color: "text-emerald-400 dark:text-emerald-300", size: 30, top: "88%", left: "68%", delay: 0.5, duration: 22 },
  { icon: Droplets, color: "text-sky-400 dark:text-sky-300", size: 28, top: "48%", left: "48%", delay: 4.5, duration: 19 },
  { icon: Hash, color: "text-cyan-400 dark:text-cyan-300", size: 26, top: "18%", left: "70%", delay: 2, duration: 21 },
];

function FloatingIcon({ icon: Icon, color, size, top, left, delay, duration }: typeof floatingIcons[0]) {
  return (
    <motion.div
      className="absolute pointer-events-none select-none"
      style={{ top, left, opacity: 0.3 }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 0.3, scale: 1 }}
      transition={{ delay: 0.3 + delay * 0.15, duration: 1.5 }}
    >
      <motion.div
        animate={{
          y: [0, -12, 0, 12, 0],
          rotate: [0, 6, -6, 4, 0],
        }}
        transition={{
          duration,
          repeat: Infinity,
          ease: "easeInOut",
          delay: delay * 0.1,
        }}
      >
        <Icon size={size} strokeWidth={1.5} className={color} />
      </motion.div>
    </motion.div>
  );
}

export default function HeroSection() {
  const { selectTool, openAuthDialog } = useAppStore();
  const { t } = useLanguage();

  return (
    <section className="relative pt-24 pb-16 sm:pt-32 sm:pb-20 lg:pt-40 lg:pb-28 hero-gradient overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-primary/3 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/2 blur-3xl" />
      </div>

      {/* Floating colored icons (low opacity, gentle float) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {floatingIcons.map((props, i) => (
          <FloatingIcon key={i} {...props} />
        ))}
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
          >
            <Badge
              variant="secondary"
              className="mb-6 px-4 py-1.5 text-xs font-medium gap-1.5 border shadow-sm"
            >
              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
              {t("hero.badge")}
            </Badge>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight leading-[1.1] max-w-4xl [font-weight:800]"
          >
            {t("hero.title1")}
            <br />
            <span className="text-primary relative">
              {t("hero.title2")}
              <svg
                className="absolute -bottom-2 left-0 w-full h-3 text-primary/20"
                viewBox="0 0 200 12"
                fill="none"
              >
                <path
                  d="M1 8C50 2 150 2 199 8"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-6 text-base sm:text-lg lg:text-xl text-muted-foreground max-w-2xl leading-relaxed font-medium"
          >
            {t("hero.subtitle")}
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="mt-10 flex flex-col sm:flex-row items-center gap-4"
          >
            <Button
              size="lg"
              className="h-12 px-8 text-base gap-2 shadow-xl shadow-primary/20 hover:shadow-primary/30 transition-shadow"
              onClick={openAuthDialog}
            >
              {t("hero.cta")}
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="lg" className="h-12 px-8 text-base" onClick={() => {
              const el = document.getElementById("tools-grid");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}>
              {t("hero.explore")}
            </Button>
          </motion.div>

          {/* Trust signals */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="mt-14 flex flex-wrap items-center justify-center gap-6 sm:gap-10"
          >
            {[
              {
                icon: Zap,
                text: t("hero.fast"),
                sub: t("hero.fastSub"),
                color: "text-amber-500",
              },
              {
                icon: Shield,
                text: t("hero.secure"),
                sub: t("hero.secureSub"),
                color: "text-emerald-500",
              },
              {
                icon: Globe,
                text: t("hero.cloud"),
                sub: t("hero.cloudSub"),
                color: "text-blue-500",
              },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold">{item.text}</div>
                  <div className="text-xs text-muted-foreground">{item.sub}</div>
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
