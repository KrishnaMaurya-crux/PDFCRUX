"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Zap,
  Shield,
  Globe,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/lib/store";
import { useLanguage } from "@/lib/i18n";
import { useTheme } from "next-themes";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/* ─── Constants ─── */
const VIDEO_DURATION = 4; // seconds
const HERO_SCROLL_HEIGHT = "200vh"; // total scrollable area for animation

export default function CinematicHero() {
  const { selectTool, openAuthDialog } = useAppStore();
  const { t } = useLanguage();
  const { theme } = useTheme();

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false);
  const scrollTriggerRef = useRef<ScrollTrigger | null>(null);
  const isDark = theme === "dark";

  /* ─── Initial video playback (0s → 3s then stop) ─── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoaded = () => {
      setVideoReady(true);
      video.currentTime = 0;
      video.play().catch(() => {
        // autoplay blocked — try muted
        video.muted = true;
        video.play().catch(() => {});
      });
    };

    const handleTimeUpdate = () => {
      // Stop at ~3s mark (75% of 4s video = last frame area)
      if (video.currentTime >= VIDEO_DURATION * 0.75 && !hasPlayedOnce) {
        video.pause();
        setHasPlayedOnce(true);
      }
    };

    video.addEventListener("loadeddata", handleLoaded);
    video.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      video.removeEventListener("loadeddata", handleLoaded);
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [hasPlayedOnce]);

  /* ─── GSAP ScrollTrigger — scroll-linked video scrubbing ─── */
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    // Wait until video has initial play complete
    if (!hasPlayedOnce) return;

    const ctx = gsap.context(() => {
      scrollTriggerRef.current = ScrollTrigger.create({
        trigger: container,
        start: "top top",
        end: `bottom top`,
        scrub: 0.8, // smooth 0.8s lag for butter-smooth scrolling
        pin: false,
        onUpdate: (self) => {
          const progress = self.progress; // 0 at top, 1 at bottom
          // Map scroll: top (0) = video at 3s, bottom (1) = video at 0s
          const targetTime = (1 - progress) * VIDEO_DURATION * 0.75;
          video.currentTime = targetTime;
        },
      });
    }, container);

    return () => {
      ctx.revert();
      scrollTriggerRef.current?.kill();
    };
  }, [hasPlayedOnce]);

  return (
    <section
      ref={containerRef}
      className="relative overflow-hidden"
      style={{ height: HERO_SCROLL_HEIGHT }}
    >
      {/* ── Sticky Viewport ── */}
      <div className="sticky top-0 h-screen w-full overflow-hidden flex items-center justify-center">
        {/* ── Video Background ── */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          src="/hero-animation.mp4"
          muted
          playsInline
          preload="auto"
          style={{
            // Dark mode blend + filter
            mixBlendMode: isDark ? "screen" : "normal",
            filter: isDark ? "brightness(0.7) contrast(1.1)" : "brightness(1) contrast(1)",
            transition: "filter 0.5s ease, mix-blend-mode 0.5s ease",
          }}
        />

        {/* ── Radial Gradient Overlay (focus center) ── */}
        <div
          className="absolute inset-0 pointer-events-none z-[1]"
          style={{
            background: isDark
              ? "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.4) 100%)"
              : "radial-gradient(ellipse at center, transparent 40%, rgba(255,255,255,0.15) 100%)",
            transition: "background 0.5s ease",
          }}
        />

        {/* ── Bottom Fade (smooth transition to next section) ── */}
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background to-transparent z-[2] pointer-events-none" />

        {/* ── Glassmorphism Content Container ── */}
        <div
          ref={contentRef}
          className="relative z-10 flex flex-col items-center justify-center text-center px-4 sm:px-6 w-full max-w-4xl mx-auto"
        >
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: videoReady ? 1 : 0, y: videoReady ? 0 : 30 }}
            transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="relative rounded-2xl sm:rounded-3xl p-6 sm:p-10 lg:p-14"
            style={{
              backdropFilter: "blur(12px) saturate(1.2)",
              WebkitBackdropFilter: "blur(12px) saturate(1.2)",
              backgroundColor: isDark
                ? "rgba(0, 0, 0, 0.35)"
                : "rgba(255, 255, 255, 0.25)",
              border: isDark
                ? "1px solid rgba(255, 255, 255, 0.08)"
                : "1px solid rgba(255, 255, 255, 0.3)",
              boxShadow: isDark
                ? "0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255,255,255,0.05)"
                : "0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.5)",
              transition: "background-color 0.5s ease, border-color 0.5s ease, box-shadow 0.5s ease",
            }}
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: videoReady ? 1 : 0, scale: videoReady ? 1 : 0.9 }}
              transition={{ delay: 0.15, duration: 0.5 }}
            >
              <Badge
                variant="secondary"
                className="mb-5 px-4 py-1.5 text-xs font-medium gap-1.5 border shadow-sm"
                style={{
                  backgroundColor: isDark ? "rgba(255,255,255,0.1)" : undefined,
                }}
              >
                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                {t("hero.badge")}
              </Badge>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: videoReady ? 1 : 0, y: videoReady ? 0 : 20 }}
              transition={{ delay: 0.25, duration: 0.6 }}
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] max-w-3xl [font-weight:800]"
              style={{
                color: isDark ? "#ffffff" : undefined,
                textShadow: isDark
                  ? "0 2px 20px rgba(0,0,0,0.5), 0 0 40px rgba(0,0,0,0.3)"
                  : "0 2px 20px rgba(255,255,255,0.8), 0 0 40px rgba(255,255,255,0.4)",
                transition: "color 0.5s ease, text-shadow 0.5s ease",
              }}
            >
              {t("hero.title1")}
              <br />
              <span
                className="text-primary relative"
                style={{
                  textShadow: isDark
                    ? "0 2px 30px rgba(239, 68, 68, 0.3)"
                    : "0 2px 20px rgba(239, 68, 68, 0.15)",
                }}
              >
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
              animate={{ opacity: videoReady ? 1 : 0, y: videoReady ? 0 : 20 }}
              transition={{ delay: 0.35, duration: 0.6 }}
              className="mt-5 text-sm sm:text-base md:text-lg lg:text-xl max-w-2xl leading-relaxed font-medium"
              style={{
                color: isDark ? "rgba(255,255,255,0.75)" : undefined,
                textShadow: isDark
                  ? "0 1px 10px rgba(0,0,0,0.5)"
                  : "0 1px 10px rgba(255,255,255,0.6)",
                transition: "color 0.5s ease, text-shadow 0.5s ease",
              }}
            >
              {t("hero.subtitle")}
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: videoReady ? 1 : 0, y: videoReady ? 0 : 20 }}
              transition={{ delay: 0.45, duration: 0.6 }}
              className="mt-8 flex flex-col sm:flex-row items-center gap-3 sm:gap-4"
            >
              <Button
                size="lg"
                className="h-12 px-8 text-base gap-2 shadow-xl shadow-primary/25 hover:shadow-primary/35 transition-shadow"
                onClick={openAuthDialog}
              >
                {t("hero.cta")}
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-12 px-8 text-base"
                style={{
                  borderColor: isDark ? "rgba(255,255,255,0.15)" : undefined,
                  backgroundColor: isDark ? "rgba(255,255,255,0.05)" : undefined,
                  color: isDark ? "rgba(255,255,255,0.9)" : undefined,
                }}
                onClick={() => {
                  const el = document.getElementById("tools-grid");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {t("hero.explore")}
              </Button>
            </motion.div>

            {/* Trust Signals */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: videoReady ? 1 : 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
              className="mt-10 flex flex-wrap items-center justify-center gap-4 sm:gap-8"
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
                <div key={item.text} className="flex items-center gap-2.5">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(0,0,0,0.04)",
                    }}
                  >
                    <item.icon className={`w-4 h-4 ${item.color}`} />
                  </div>
                  <div className="text-left">
                    <div
                      className="text-xs font-semibold"
                      style={{
                        color: isDark ? "rgba(255,255,255,0.9)" : undefined,
                      }}
                    >
                      {item.text}
                    </div>
                    <div
                      className="text-[10px] sm:text-xs"
                      style={{
                        color: isDark
                          ? "rgba(255,255,255,0.5)"
                          : undefined,
                      }}
                    >
                      {item.sub}
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* ── Scroll Indicator ── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: videoReady ? 1 : 0 }}
            transition={{ delay: 1, duration: 0.5 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-10"
          >
            <span
              className="text-[10px] uppercase tracking-widest font-medium"
              style={{
                color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)",
              }}
            >
              Scroll
            </span>
            <motion.div
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              className="w-5 h-8 rounded-full border-2 flex items-start justify-center pt-1.5"
              style={{
                borderColor: isDark
                  ? "rgba(255,255,255,0.2)"
                  : "rgba(0,0,0,0.15)",
              }}
            >
              <motion.div
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="w-1 h-1.5 rounded-full"
                style={{
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.6)"
                    : "rgba(0,0,0,0.4)",
                }}
              />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
