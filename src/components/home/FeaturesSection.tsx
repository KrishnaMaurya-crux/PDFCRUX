"use client";

import { motion } from "framer-motion";
import {
  Zap,
  Shield,
  Globe,
  Cloud,
  Smartphone,
  Lock,
  Clock,
  Infinity,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";

const featureKeys = [
  { icon: Zap, titleKey: "features.f1.title", descKey: "features.f1.desc", color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30" },
  { icon: Shield, titleKey: "features.f2.title", descKey: "features.f2.desc", color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  { icon: Globe, titleKey: "features.f3.title", descKey: "features.f3.desc", color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30" },
  { icon: Cloud, titleKey: "features.f4.title", descKey: "features.f4.desc", color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-950/30" },
  { icon: Smartphone, titleKey: "features.f5.title", descKey: "features.f5.desc", color: "text-pink-500", bg: "bg-pink-50 dark:bg-pink-950/30" },
  { icon: Lock, titleKey: "features.f6.title", descKey: "features.f6.desc", color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30" },
  { icon: Clock, titleKey: "features.f7.title", descKey: "features.f7.desc", color: "text-cyan-500", bg: "bg-cyan-50 dark:bg-cyan-950/30" },
  { icon: Infinity, titleKey: "features.f8.title", descKey: "features.f8.desc", color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950/30" },
];

export default function FeaturesSection() {
  const { t } = useLanguage();
  return (
    <section className="py-16 sm:py-24 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12 sm:mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            {t("features.heading")}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t("features.subtitle")}
          </p>
        </motion.div>

        {/* Features grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {featureKeys.map((feature, index) => (
            <motion.div
              key={feature.titleKey}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
              className="group p-6 rounded-xl border bg-card hover:shadow-lg hover:border-primary/10 transition-all"
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${feature.bg} group-hover:scale-105 transition-transform`}
              >
                <feature.icon className={`w-6 h-6 ${feature.color}`} />
              </div>
              <h3 className="text-base font-semibold mb-2">{t(feature.titleKey)}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t(feature.descKey)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
