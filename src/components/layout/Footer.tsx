"use client";

import {
  FileText,
  Shield,
  Zap,
  Globe,
  Heart,
  ChevronDown,
} from "lucide-react";
import Image from "next/image";
import { Separator } from "@/components/ui/separator";
import { toolCategories } from "@/lib/tools";
import { useAppStore } from "@/lib/store";
import { useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { LANGUAGES } from "@/lib/invoice-pdf";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Lock,
  Users,
  Mail,
  MessageSquare,
  Building2,
  BookOpen,
  Scale,
} from "lucide-react";

type ModalType = "about" | null;

export default function Footer() {
  const { selectTool, navigatePricing, navigatePrivacy, navigateTerms, navigateRefund, navigateContact } = useAppStore();
  const [openModal, setOpenModal] = useState<ModalType>(null);
  const { t, language, setLanguage } = useLanguage();

  const popularTools = [
    "merge-pdf",
    "split-pdf",
    "compress-pdf",
    "pdf-to-word",
    "pdf-to-jpg",
    "protect-pdf",
    "watermark-pdf",
    "rotate-pdf",
  ];

  const companyLinks: { label: string; action: string }[] = [
    { label: "About Us", action: "about" },
    { label: "Pricing", action: "pricing" },
    { label: "Privacy Policy", action: "privacy" },
    { label: "Terms of Service", action: "terms" },
    { label: "Refund Policy", action: "refund" },
    { label: "Contact Us", action: "contact" },
  ];

  return (
    <footer className="mt-auto border-t bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <Image src="/logo.png" alt="PdfCrux" width={32} height={32} className="w-8 h-8 rounded-lg" />
              <span className="text-lg font-bold">
                Pdf<span className="text-primary">Crux</span>
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4 max-w-xs">
              {t("footer.description")}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="w-3.5 h-3.5 text-emerald-500" />
              <span>256-bit SSL encryption</span>
            </div>
          </div>

          {/* Popular Tools */}
          <div>
            <h3 className="text-sm font-semibold mb-4">{t("footer.popularTools")}</h3>
            <ul className="space-y-2">
              {popularTools.map((toolId) => {
                const tool = toolCategories
                  .flatMap((c) => c.tools)
                  .find((t) => t.id === toolId);
                if (!tool) return null;
                return (
                  <li key={tool.id}>
                    <button
                      onClick={() => selectTool(tool.id)}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      {tool.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* All Categories */}
          <div>
            <h3 className="text-sm font-semibold mb-4">{t("footer.allCategories")}</h3>
            <ul className="space-y-2">
              {toolCategories.map((cat) => (
                <li key={cat.id}>
                  <span className="text-sm text-muted-foreground">
                    {cat.name}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Language Selector */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Language</h3>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="text-sm bg-background border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>{lang.native} ({lang.name})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-sm font-semibold mb-4">{t("footer.company")}</h3>
            <ul className="space-y-2">
              {companyLinks.map((link) => (
                <li key={link.label}>
                  <button
                    onClick={() => {
                      switch (link.action) {
                        case "about": setOpenModal("about"); break;
                        case "pricing": navigatePricing(); break;
                        case "privacy": navigatePrivacy(); break;
                        case "terms": navigateTerms(); break;
                        case "refund": navigateRefund(); break;
                        case "contact": navigateContact(); break;
                      }
                    }}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* App Store Buttons */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            {t("footer.getTheApp") || "Get the App"}
          </p>
          <div className="flex items-center gap-3">
            {/* Google Play */}
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="relative inline-flex items-center gap-2.5 bg-black text-white rounded-lg px-4 py-2.5 hover:bg-neutral-800 transition-colors group"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.807 1.626a1 1 0 010 1.732l-2.807 1.626L15.206 12l2.492-2.492zM5.864 2.658L16.802 8.99l-2.303 2.303-8.635-8.635z"/>
              </svg>
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] opacity-80">GET IT ON</span>
                <span className="text-sm font-semibold">Google Play</span>
              </div>
              <span className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                SOON
              </span>
            </a>

            {/* Apple App Store */}
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="relative inline-flex items-center gap-2.5 bg-black text-white rounded-lg px-4 py-2.5 hover:bg-neutral-800 transition-colors group"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] opacity-80">Download on the</span>
                <span className="text-sm font-semibold">App Store</span>
              </div>
              <span className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                SOON
              </span>
            </a>
          </div>
        </div>

        <Separator className="my-8" />

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} PdfCrux. {t("footer.rights")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Zap className="w-3 h-3 text-amber-500" />
              <span>{t("footer.fast")}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Globe className="w-3 h-3 text-blue-500" />
              <span>{t("footer.noInstall")}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Heart className="w-3 h-3 text-rose-500" />
              <span>{t("footer.madeWithLove")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <FooterModals openModal={openModal} onClose={() => setOpenModal(null)} />
    </footer>
  );
}

// All modal content in one place
function FooterModals({
  openModal,
  onClose,
}: {
  openModal: ModalType;
  onClose: () => void;
}) {
  const modals: Record<string, {
    title: string;
    desc: string;
    icon: typeof FileText;
    content: React.ReactNode;
  }> = {
    about: {
      title: "About PdfCrux",
      desc: "Learn about our mission",
      icon: Building2,
      content: (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground leading-relaxed">
            PdfCrux was born from a simple idea: everyone deserves access to professional-grade
            PDF tools without paying a fortune. We make document management simple, fast, and accessible.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Users, label: "Community", value: "2M+" },
              { icon: FileText, label: "PDFs Processed", value: "25M+" },
              { icon: Globe, label: "Countries", value: "150+" },
              { icon: Zap, label: "Uptime", value: "99.9%" },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <s.icon className="w-5 h-5 text-primary" />
                <div>
                  <div className="text-lg font-bold">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {[
              { icon: Shield, title: "Privacy First", desc: "Documents are never stored or shared." },
              { icon: Zap, title: "Speed Matters", desc: "Optimized for fastest processing." },
              { icon: Heart, title: "For Everyone", desc: "Free and easy to use." },
              { icon: BookOpen, title: "Always Improving", desc: "New tools added regularly." },
            ].map((v) => (
              <div key={v.title} className="flex items-start gap-3">
                <v.icon className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold">{v.title}</div>
                  <div className="text-xs text-muted-foreground">{v.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
  };

  const active = openModal ? modals[openModal] : null;

  return (
    <Dialog open={!!openModal} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] p-0">
        <ScrollArea className="max-h-[85vh]">
          <div className="p-6 sm:p-8">
            {active && (
              <>
                <DialogHeader className="mb-6">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <active.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <DialogTitle className="text-xl">{active.title}</DialogTitle>
                      <DialogDescription>{active.desc}</DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                {active.content}
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
