"use client";

import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { useLanguage } from "@/lib/i18n";

export default function CTASection() {
  const { selectTool } = useAppStore();
  const { t } = useLanguage();

  return (
    <section className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative rounded-3xl overflow-hidden"
        >
          {/* Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/90 via-primary to-primary/80" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.08),transparent_50%)]" />

          {/* Pattern overlay */}
          <div className="absolute inset-0 opacity-5">
            <div
              className="w-full h-full"
              style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
                backgroundSize: "24px 24px",
              }}
            />
          </div>

          <div className="relative px-6 py-16 sm:px-12 sm:py-20 lg:px-20 lg:py-24 text-center">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white/90 text-sm font-medium mb-6">
                <Sparkles className="w-4 h-4" />
                {t("cta.badge")}
              </div>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 tracking-tight"
            >
              {t("cta.title1")}
              <br />
              {t("cta.title2")}
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="text-lg text-white/80 max-w-xl mx-auto mb-8 leading-relaxed"
            >
              {t("cta.subtitle")}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Button
                size="lg"
                variant="secondary"
                className="h-12 px-8 text-base gap-2 bg-white text-primary hover:bg-white/90 shadow-xl"
                onClick={() => selectTool("merge-pdf")}
              >
                {t("cta.cta1")}
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-8 text-base gap-2 border-white/30 text-white hover:bg-white/10 bg-transparent"
                onClick={() => selectTool("compress-pdf")}
              >
                {t("cta.cta2")}
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
