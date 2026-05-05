"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Shield,
  FileText,
  Scale,
  RotateCcw,
  MessageSquare,
  Mail,
  Building2,
  Lock,
  Clock,
  CreditCard,
  Globe,
  Headphones,
  BookOpen,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAppStore } from "@/lib/store";

// ============================================================
// Shared Layout
// ============================================================

function RefundLink() {
  return (
    <Link href="/refund" className="text-primary hover:underline font-medium">
      Refund Policy
    </Link>
  );
}

function StaticPageLayout({
  title,
  subtitle,
  icon: Icon,
  lastUpdated,
  children,
}: {
  title: string;
  subtitle: string;
  icon: typeof FileText;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen pt-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Breadcrumb */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to Home
          </Link>
        </motion.div>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Icon className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold mb-2">{title}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
          <p className="text-xs text-muted-foreground/60 mt-2">{lastUpdated}</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          {children}
        </motion.div>
      </div>
    </div>
  );
}

// ============================================================
// Section renderer
// ============================================================
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-bold mb-3">{title}</h2>
      {children}
    </div>
  );
}

// ============================================================
// PRIVACY POLICY
// ============================================================
export function PrivacyPolicyPage() {
  return (
    <StaticPageLayout
      title="Privacy Policy"
      subtitle="How we collect, use, and protect your data"
      icon={Shield}
      lastUpdated="Last updated: June 2025"
    >
      <Card><CardContent className="p-6 sm:p-8 space-y-8">
        <Section title="1. Information We Collect">
          <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed list-disc list-inside">
            <li><strong>Account Data:</strong> Name and email when you sign up (optional).</li>
            <li><strong>Usage Data:</strong> Tools used, files processed (we store metadata, not file content).</li>
            <li><strong>Payment Data:</strong> Processed securely through Dodo Payments. We never store card details.</li>
            <li><strong>Device Data:</strong> Browser type, IP address for security and analytics.</li>
          </ul>
        </Section>

        <Separator />

        <Section title="2. How We Use Your Data">
          <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed list-disc list-inside">
            <li>To provide and improve our PDF tools and services.</li>
            <li>To process payments and manage your subscription.</li>
            <li>To send service-related notifications (account updates, security alerts).</li>
            <li>To detect and prevent fraud and abuse.</li>
          </ul>
        </Section>

        <Separator />

        <Section title="3. Document Processing">
          <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
            <p>All files are processed using <strong>client-side technology</strong> whenever possible. Your documents never leave your browser.</p>
            <p>For server-side processing (AI tools), files are encrypted with <strong>256-bit SSL</strong> during transfer.</p>
            <p>Processed files are automatically <strong>deleted within 2 hours</strong> from our servers.</p>
            <p>We <strong>never read, analyze, or share</strong> your document content.</p>
          </div>
        </Section>

        <Separator />

        <Section title="4. Cloud Storage">
          <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
            <p>Premium users get cloud storage for file history. Files are stored on <strong>Cloudflare R2</strong> with encryption.</p>
            <p>Cloud files are <strong>auto-deleted after 30 days</strong> for privacy compliance.</p>
            <p>Enterprise users get custom retention policies with SLA guarantees.</p>
          </div>
        </Section>

        <Separator />

        <Section title="5. Cookies">
          <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed list-disc list-inside">
            <li><strong>Essential:</strong> Authentication, session management.</li>
            <li><strong>Preferences:</strong> Theme, language settings.</li>
            <li>No third-party tracking cookies or advertising pixels.</li>
          </ul>
        </Section>

        <Separator />

        <Section title="6. Your Rights">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: Lock, title: "Right to Access", desc: "Request a copy of your data." },
              { icon: RotateCcw, title: "Right to Delete", desc: "Request full data deletion." },
              { icon: BookOpen, title: "Right to Portability", desc: "Export your data in standard format." },
              { icon: Shield, title: "Right to Object", desc: "Opt out of data processing." },
            ].map((r) => (
              <div key={r.title} className="flex items-start gap-3 p-3 rounded-lg border">
                <r.icon className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold">{r.title}</div>
                  <div className="text-xs text-muted-foreground">{r.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Separator />

        <Section title="7. Third-Party Services">
          <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed list-disc list-inside">
            <li><strong>Supabase:</strong> Authentication and database (SOC-2 compliant).</li>
            <li><strong>Cloudflare R2:</strong> Encrypted cloud storage.</li>
            <li><strong>Dodo Payments:</strong> Payment processing (PCI DSS compliant).</li>
          </ul>
        </Section>

        <div className="pt-4">
          <p className="text-xs text-muted-foreground">Questions? Contact us at <a href="mailto:privacy@pdfcrux.com" className="text-primary hover:underline">privacy@pdfcrux.com</a></p>
        </div>
      </CardContent></Card>
    </StaticPageLayout>
  );
}

// ============================================================
// TERMS OF SERVICE
// ============================================================
export function TermsOfServicePage() {
  return (
    <StaticPageLayout
      title="Terms of Service"
      subtitle="Rules and guidelines for using PdfCrux"
      icon={Scale}
      lastUpdated="Last updated: June 2025"
    >
      <Card><CardContent className="p-6 sm:p-8 space-y-8">
        <Section title="1. Acceptance of Terms">
          <p className="text-sm text-muted-foreground leading-relaxed">
            By accessing or using PdfCrux, you agree to be bound by these Terms of Service. If you do not agree, please do not use our services. These terms apply to all visitors, users, and subscribers.
          </p>
        </Section>

        <Separator />

        <Section title="2. Description of Service">
          <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed list-disc list-inside">
            <li>Online PDF tools: Merge, Split, Compress, Convert, Sign, Watermark, Protect, and more.</li>
            <li>AI-powered tools: PDF Summary, Notes Generator, Resume ATS Checker.</li>
            <li>Invoice Generator with customizable templates.</li>
            <li>Bulk PDF processing (Premium and Enterprise plans).</li>
          </ul>
        </Section>

        <Separator />

        <Section title="3. User Accounts">
          <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed list-disc list-inside">
            <li>You must provide accurate information when creating an account.</li>
            <li>You are responsible for maintaining the security of your credentials.</li>
            <li>You must be at least 13 years old to use this service.</li>
            <li>One account per person. Duplicate accounts may be suspended.</li>
          </ul>
        </Section>

        <Separator />

        <Section title="4. Acceptable Use">
          <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
            <p><strong>You may NOT:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Use the service for any illegal or unauthorized purpose.</li>
              <li>Process documents you do not have rights to.</li>
              <li>Attempt to overload, hack, or disrupt our servers.</li>
              <li>Resell, redistribute, or reverse-engineer our tools.</li>
              <li>Use automated scripts to bulk-process without authorization.</li>
            </ul>
          </div>
        </Section>

        <Separator />

        <Section title="5. Subscription & Payments">
          <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed list-disc list-inside">
            <li>Premium and Enterprise plans are billed through <strong>Dodo Payments</strong>.</li>
            <li>Prices are displayed in INR (₹) for India and USD ($) for international users.</li>
            <li>Monthly plans auto-renew. You can cancel anytime from your account.</li>
            <li>Unused tokens do not carry over to the next billing period.</li>
            <li>Refunds are handled per our <RefundLink />.</li>
          </ul>
        </Section>

        <Separator />

        <Section title="6. Token System">
          <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed list-disc list-inside">
            <li><strong>Free Plan:</strong> 12 Non-AI tokens + 3 AI tokens per month.</li>
            <li><strong>Premium Plan:</strong> Unlimited Non-AI + 100 AI tokens per month.</li>
            <li><strong>Enterprise Plan:</strong> Unlimited all tokens.</li>
            <li>1 Non-AI tool use = 1 token. 1 AI tool use = 1 AI token. 1 Bulk file = 1 token.</li>
            <li>Tokens refresh on your monthly billing date.</li>
          </ul>
        </Section>

        <Separator />

        <Section title="7. Intellectual Property">
          <p className="text-sm text-muted-foreground leading-relaxed">
            PdfCrux&apos;s website design, code, logos, and branding are protected by intellectual property laws. You may not copy, modify, or redistribute any part of our platform without written permission. Files you process remain your property.
          </p>
        </Section>

        <Separator />

        <Section title="8. Limitation of Liability">
          <p className="text-sm text-muted-foreground leading-relaxed">
            The service is provided &quot;as is&quot; and &quot;as available&quot;. We are not liable for any data loss, file corruption, or service interruptions. Always keep backups of important documents. Our maximum liability shall not exceed the amount you paid in the past 12 months.
          </p>
        </Section>

        <Separator />

        <Section title="9. Changes to Terms">
          <p className="text-sm text-muted-foreground leading-relaxed">
            We may update these terms at any time. We will notify users via email for significant changes. Continued use of the service after changes constitutes acceptance.
          </p>
        </Section>

        <div className="pt-4">
          <p className="text-xs text-muted-foreground">Legal questions? Contact us at <a href="mailto:legal@pdfcrux.com" className="text-primary hover:underline">legal@pdfcrux.com</a></p>
        </div>
      </CardContent></Card>
    </StaticPageLayout>
  );
}

// ============================================================
// REFUND POLICY
// ============================================================
export function RefundPolicyPage() {
  return (
    <StaticPageLayout
      title="Refund Policy"
      subtitle="Our commitment to fair and transparent refunds"
      icon={RotateCcw}
      lastUpdated="Last updated: June 2025"
    >
      <Card><CardContent className="p-6 sm:p-8 space-y-8">
        <Section title="Our Promise">
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
            <p className="text-sm text-foreground leading-relaxed">
              We stand behind our service. If you&apos;re not satisfied with your Premium or Enterprise plan, we offer a fair refund policy to ensure your peace of mind.
            </p>
          </div>
        </Section>

        <Separator />

        <Section title="Eligibility">
          <div className="space-y-3">
            {[
              { icon: CheckCircle2, title: "7-Day Money-Back Guarantee", desc: "New subscribers can request a full refund within 7 days of purchase.", highlight: true },
              { icon: Clock, title: "Annual Plans", desc: "Full refund within 7 days. Pro-rated refund after 7 days and before 30 days.", highlight: false },
              { icon: CreditCard, title: "Monthly Plans", desc: "No refund after 7 days. You can cancel anytime to prevent next billing.", highlight: false },
            ].map((item) => (
              <div key={item.title} className={`flex items-start gap-3 p-3 rounded-lg ${item.highlight ? "border border-primary/20 bg-primary/5" : "border"}`}>
                <item.icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${item.highlight ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <div className="text-sm font-semibold">{item.title}</div>
                  <div className="text-xs text-muted-foreground">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Separator />

        <Section title="Non-Refundable Items">
          <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed list-disc list-inside">
            <li>Tokens that have already been used (Non-AI or AI).</li>
            <li>Enterprise plans after 30 days of activation.</li>
            <li>Services interrupted due to user violation of Terms of Service.</li>
            <li>Plans purchased through third-party resellers.</li>
          </ul>
        </Section>

        <Separator />

        <Section title="How to Request a Refund">
          <div className="space-y-3">
            {[
              { step: "1", text: "Email us at refunds@pdfcrux.com with your account email and order ID." },
              { step: "2", text: "Our team reviews the request within 48 hours." },
              { step: "3", text: "Approved refunds are processed within 5-7 business days." },
              { step: "4", text: "Refunds are credited to the original payment method." },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold">{item.step}</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </Section>

        <Separator />

        <Section title="Cancellation (No Refund Needed)">
          <p className="text-sm text-muted-foreground leading-relaxed">
            You can cancel your Premium plan anytime from your account settings. You&apos;ll continue to have access until the end of your current billing period. No refund is needed for cancellation.
          </p>
        </Section>

        <div className="pt-4">
          <p className="text-xs text-muted-foreground">Refund requests: <a href="mailto:refunds@pdfcrux.com" className="text-primary hover:underline">refunds@pdfcrux.com</a></p>
        </div>
      </CardContent></Card>
    </StaticPageLayout>
  );
}

// ============================================================
// CONTACT US
// ============================================================
export function ContactUsPage() {
  const { navigatePricing } = useAppStore();

  return (
    <StaticPageLayout
      title="Contact Us"
      subtitle="We're here to help — reach out anytime"
      icon={MessageSquare}
      lastUpdated="Response within 24 hours"
    >
      {/* Contact Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {[
          { icon: Mail, label: "General Support", value: "support@pdfcrux.com", color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30" },
          { icon: Shield, label: "Security Issues", value: "security@pdfcrux.com", color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30" },
          { icon: Building2, label: "Enterprise Sales", value: "business@pdfcrux.com", color: "text-slate-600 dark:text-slate-300", bg: "bg-slate-50 dark:bg-slate-800/50" },
          { icon: Headphones, label: "Premium Support", value: "premium@pdfcrux.com", color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30" },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center flex-shrink-0`}>
                <item.icon className={`w-5 h-5 ${item.color}`} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{item.label}</div>
                <div className="text-xs text-primary truncate">{item.value}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick FAQ */}
      <Card>
        <CardContent className="p-6 sm:p-8">
          <h2 className="text-lg font-bold mb-4">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {[
              { q: "Is PdfCrux really free?", a: "Yes! All core PDF tools are completely free with generous daily limits. Premium unlocks unlimited usage and extra features." },
              { q: "How secure are my files?", a: "Files are processed client-side when possible. Server processing uses 256-bit SSL encryption. Files are auto-deleted within 2 hours." },
              { q: "What's the maximum file size?", a: "Up to 100MB for most tools, 50MB for AI-powered tools. Bulk compression supports up to 100 files at once (Premium)." },
              { q: "Can I cancel Premium anytime?", a: "Absolutely. Cancel from your account settings. You keep Premium until your current period ends. No questions asked." },
              { q: "Do you offer enterprise plans?", a: "Yes! For teams and businesses with unlimited tokens, team dashboard, dedicated support, and custom integrations.", btn: "View Enterprise Plan" },
              { q: "Which payment methods do you accept?", a: "We accept UPI, Credit/Debit Cards, Net Banking, and international cards — all through Dodo Payments." },
            ].map((f) => (
              <div key={f.q} className="p-4 rounded-lg border">
                <div className="text-sm font-semibold mb-1">{f.q}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">{f.a}</div>
                {f.btn && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 text-xs gap-1"
                    onClick={navigatePricing}
                  >
                    <Globe className="w-3 h-3" />
                    {f.btn}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </StaticPageLayout>
  );
}
