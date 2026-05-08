"use client";

import { useEffect } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import HeroSection from "@/components/home/HeroSection";
import ToolsGrid from "@/components/home/ToolsGrid";
import FeaturesSection from "@/components/home/FeaturesSection";
import StatsSection from "@/components/home/StatsSection";
import CTASection from "@/components/home/CTASection";
import ToolPage from "@/components/tool/ToolPage";
import BulkCompressPDF from "@/components/tool/BulkCompressPDF";
import InvoiceGenerator from "@/components/tool/InvoiceGenerator";
import AIToolPage from "@/components/tool/AIToolPage";
import HistoryPanel from "@/components/HistoryPanel";
import PricingPage from "@/components/PricingPage";
import {
  PrivacyPolicyPage,
  TermsOfServicePage,
  RefundPolicyPage,
  ContactUsPage,
} from "@/components/StaticPages";
import { useAppStore } from "@/lib/store";
import { AnimatePresence, motion } from "framer-motion";

export default function Home() {
  const { currentView, selectedToolId, isComplete } = useAppStore();

  // Always scroll to top when view changes OR processing completes
  // — prevents result page from being scrolled to bottom
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [currentView, selectedToolId, isComplete]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <AnimatePresence mode="wait">
        {currentView === "history" ? (
          <motion.main
            key="history"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex-1"
          >
            <HistoryPanel />
          </motion.main>
        ) : currentView === "home" ? (
          <motion.main
            key="home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex-1"
          >
            <HeroSection />
            <ToolsGrid />
            <FeaturesSection />
            <StatsSection />
            <CTASection />
          </motion.main>
        ) : currentView === "pricing" ? (
          <motion.main
            key="pricing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex-1"
          >
            <PricingPage />
          </motion.main>
        ) : currentView === "privacy" ? (
          <motion.main
            key="privacy"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex-1"
          >
            <PrivacyPolicyPage />
          </motion.main>
        ) : currentView === "terms" ? (
          <motion.main
            key="terms"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex-1"
          >
            <TermsOfServicePage />
          </motion.main>
        ) : currentView === "refund" ? (
          <motion.main
            key="refund"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex-1"
          >
            <RefundPolicyPage />
          </motion.main>
        ) : currentView === "contact" ? (
          <motion.main
            key="contact"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex-1"
          >
            <ContactUsPage />
          </motion.main>
        ) : selectedToolId === "bulk-compress-pdf" ? (
          <motion.main
            key="bulk-compress"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex-1"
          >
            <BulkCompressPDF />
          </motion.main>
        ) : selectedToolId === "invoice-generator" ? (
          <motion.main
            key="invoice"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex-1"
          >
            <InvoiceGenerator />
          </motion.main>
        ) : selectedToolId && ["pdf-summary", "pdf-notes", "resume-checker"].includes(selectedToolId) ? (
          <motion.main
            key="ai-tool"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex-1"
          >
            <AIToolPage toolId={selectedToolId} />
          </motion.main>
        ) : (
          <motion.main
            key="tool"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex-1"
          >
            <ToolPage key={selectedToolId || "tool"} />
          </motion.main>
        )}
      </AnimatePresence>
      <Footer />
    </div>
  );
}
