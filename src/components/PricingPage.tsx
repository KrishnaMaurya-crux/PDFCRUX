"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  X,
  Zap,
  Crown,
  Shield,
  Cloud,
  HardDrive,
  FileText,
  Sparkles,
  Globe,
  Trash2,
  Clock,
  Infinity,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Layers,
  QrCode,
  Building2,
  Users,
  Headphones,
  Send,
  Loader2,
  Briefcase,
  Mail,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { isDodoConfigured } from "@/lib/dodo-payments";

// ============================================================
// Pricing Config
// ============================================================
type BillingCycle = "monthly" | "annual";
type Region = "india" | "global";

const TEAM_SIZES = [
  { value: "1-10", label: "1 – 10 employees" },
  { value: "11-50", label: "11 – 50 employees" },
  { value: "51-200", label: "51 – 200 employees" },
  { value: "201-500", label: "201 – 500 employees" },
  { value: "500+", label: "500+ employees" },
];

interface PricingPlan {
  name: string;
  monthly: string;
  annual: string;
  annualMonthly: string;
  savePercent: string;
  cta: string;
  features: { text: string; included: boolean }[];
  highlight?: boolean;
  badge?: string;
  isEnterprise?: boolean;
}

const FREE_PLAN: PricingPlan = {
  name: "Free",
  monthly: "₹0",
  annual: "$0",
  annualMonthly: "$0",
  savePercent: "",
  cta: "Current Plan",
  features: [
    { text: "12 Non-AI Tokens / month", included: true },
    { text: "3 AI Tokens / month", included: true },
    { text: "All 23+ PDF Tools", included: true },
    { text: "Client-side Processing", included: true },
    { text: "PdfCrux Branding on Invoices", included: true },
    { text: "Bulk Compress (3 files max)", included: true },
    { text: "Cloud Storage", included: false },
    { text: "Priority Processing", included: false },
    { text: "Remove Branding", included: false },
    { text: "Unlimited Non-AI Tokens", included: false },
    { text: "100 AI Tokens / month", included: false },
  ],
};

const PREMIUM_PLAN: PricingPlan = {
  name: "Premium",
  monthly: "₹249",
  annual: "₹1,999",
  annualMonthly: "₹166",
  savePercent: "Save 33%",
  cta: "Upgrade to Premium",
  highlight: true,
  badge: "Most Popular",
  features: [
    { text: "Unlimited Non-AI Tokens", included: true },
    { text: "100 AI Tokens / month", included: true },
    { text: "All 23+ PDF Tools", included: true },
    { text: "Client-side Processing", included: true },
    { text: "Remove PdfCrux Branding", included: true },
    { text: "Bulk Compress (100 files at once)", included: true },
    { text: "1GB Cloud Storage", included: true },
    { text: "Priority Processing", included: true },
    { text: "30-Day File History", included: true },
    { text: "Auto-delete after 30 days", included: true },
    { text: "Team Dashboard", included: false },
    { text: "Dedicated Support", included: false },
  ],
};

const PREMIUM_GLOBAL: PricingPlan = {
  name: "Premium",
  monthly: "$5.99",
  annual: "$49",
  annualMonthly: "$4.08",
  savePercent: "Save 32%",
  cta: "Upgrade to Premium",
  highlight: true,
  badge: "Most Popular",
  features: PREMIUM_PLAN.features,
};

const ENTERPRISE_PLAN: PricingPlan = {
  name: "Enterprise",
  monthly: "Custom",
  annual: "Custom",
  annualMonthly: "",
  savePercent: "",
  cta: "Talk to Sales",
  features: [
    { text: "Unlimited AI & Non-AI Tokens", included: true },
    { text: "Custom Cloud Storage (10GB+)", included: true },
    { text: "All 23+ PDF Tools", included: true },
    { text: "Team Dashboard (Multi-user)", included: true },
    { text: "24/7 Dedicated Support", included: true },
    { text: "Bulk Compress (Unlimited)", included: true },
    { text: "Custom Branding (White-label)", included: true },
    { text: "API Access", included: true },
    { text: "Priority Processing", included: true },
    { text: "SLA Guarantee", included: true },
    { text: "Custom Integrations", included: true },
    { text: "Onboarding & Training", included: true },
  ],
  isEnterprise: true,
};

// ============================================================
// FAQ Data
// ============================================================
const FAQ_ITEMS = [
  {
    q: "How do tokens work?",
    a: "Every time you use a Non-AI tool (Compress, Merge, Split, etc.), 1 token is deducted. AI tools (Summary, Notes, Resume Checker) use 1 AI token each. Bulk Compress uses 1 token per file processed. Free tokens refresh every month.",
  },
  {
    q: "What happens when my free tokens run out?",
    a: "You can continue using PdfCrux the next month when tokens refresh, or upgrade to Premium for unlimited Non-AI tokens and 100 AI tokens per month.",
  },
  {
    q: "Do unused tokens carry over?",
    a: "No, tokens reset every month on your billing date. This keeps our server costs manageable so we can keep the free tier generous.",
  },
  {
    q: "Can I cancel Premium anytime?",
    a: "Yes! You can cancel anytime from your Profile page. You'll keep Premium benefits until the end of your current billing period.",
  },
  {
    q: "How does Cloud Storage work?",
    a: "Premium users get 1GB of cloud storage. Enterprise gets 10GB+. Your processed files are stored for 30 days with optimized metadata — meaning we store smart links, not heavy files, so storage lasts much longer.",
  },
  {
    q: "What is Enterprise and who is it for?",
    a: "Enterprise is designed for teams and businesses that need unlimited tokens, multi-user dashboards, dedicated support, and custom integrations. Pricing is based on team size and requirements — contact our sales team for a custom quote.",
  },
  {
    q: "Is my data safe?",
    a: "Absolutely. All files are encrypted with 256-bit SSL. Premium cloud files are auto-deleted after 30 days. Enterprise gets additional SLA guarantees. We never read, share, or analyze your content.",
  },
  {
    q: "Which payment methods do you accept?",
    a: "We accept UPI, Credit/Debit Cards, Net Banking, and international cards — all through Dodo Payments. Enterprise: Invoice-based billing, wire transfer. All payments are secure.",
  },
  {
    q: "Is there a student discount?",
    a: "Not yet, but it's coming! Contact us at support@pdfcrux.com with your student ID for a special discount code.",
  },
  {
    q: "Can I switch from Premium to Enterprise?",
    a: "Yes! Contact our sales team and we'll help you migrate. Any remaining Premium billing will be adjusted in your Enterprise plan.",
  },
];

// ============================================================
// Region Detection
// ============================================================
function detectRegion(): Region {
  try {
    return "global";
  } catch {
    return "global";
  }
}

// ============================================================
// Pricing Card Component
// ============================================================
function PricingCard({
  plan,
  region,
  billing,
  isGlobal,
  onContactSales,
  onUpgradePremium,
}: {
  plan: PricingPlan;
  region: Region;
  billing: BillingCycle;
  isGlobal: boolean;
  onContactSales?: () => void;
  onUpgradePremium?: () => void;
}) {
  const { openAuthDialog } = useAppStore();
  const { toast } = useToast();
  const isFree = plan.name === "Free";
  const isEnterprise = plan.isEnterprise;

  let price = "$0";
  let period = "";
  let monthlyEquiv = "";

  if (isEnterprise) {
    price = "Custom";
    period = "";
  } else if (!isFree) {
    price =
      billing === "monthly"
        ? isGlobal
          ? "$5.99"
          : "₹249"
        : isGlobal
          ? "$49"
          : "₹1,999";
    period = billing === "monthly" ? "/mo" : "/yr";
    monthlyEquiv =
      billing === "annual"
        ? isGlobal
          ? "$4.08/mo"
          : "₹166/mo"
        : "";
  }

  return (
    <Card
      className={`relative overflow-hidden transition-all duration-300 ${
        isEnterprise
          ? "border-2 border-slate-700 dark:border-slate-500 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 shadow-xl"
          : plan.highlight
            ? "border-2 border-primary shadow-xl shadow-primary/10 lg:scale-105"
            : "border"
      }`}
    >
      {/* Glow effect for premium */}
      {plan.highlight && (
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      )}

      {/* Enterprise subtle pattern */}
      {isEnterprise && (
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-slate-200/40 dark:bg-slate-700/20 rounded-full blur-3xl pointer-events-none" />
      )}

      <CardContent className="p-6 sm:p-8 flex flex-col h-full relative">
        {/* Badge */}
        {plan.badge && (
          <div className="absolute top-0 right-0">
            <div className="bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-bl-xl rounded-tr-lg">
              {plan.badge}
            </div>
          </div>
        )}

        {/* Enterprise badge */}
        {isEnterprise && (
          <div className="absolute top-0 right-0">
            <div className="bg-slate-800 dark:bg-slate-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl rounded-tr-lg">
              For Teams
            </div>
          </div>
        )}

        {/* Plan icon + name */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            {isFree ? (
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <Zap className="w-5 h-5 text-muted-foreground" />
              </div>
            ) : isEnterprise ? (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 dark:from-slate-500 dark:to-slate-700 flex items-center justify-center shadow-lg">
                <Building2 className="w-5 h-5 text-white" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
                <Crown className="w-5 h-5 text-white" />
              </div>
            )}
            <h3 className="text-xl font-bold">{plan.name}</h3>
          </div>
          {isEnterprise && (
            <p className="text-xs text-muted-foreground -mt-1 ml-12">
              Built for businesses &amp; teams
            </p>
          )}
        </div>

        {/* Price */}
        <div className="mb-6">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-extrabold">{price}</span>
            <span className="text-sm text-muted-foreground font-medium">
              {period}
            </span>
          </div>
          {monthlyEquiv && (
            <p className="text-xs text-muted-foreground mt-1">
              {monthlyEquiv} when billed annually
            </p>
          )}
          {!isFree && !isEnterprise && plan.savePercent && billing === "annual" && (
            <Badge className="mt-2 bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
              {plan.savePercent}
            </Badge>
          )}
          {isEnterprise && (
            <Badge className="mt-2 bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 text-[10px]">
              Tailored to your needs
            </Badge>
          )}
        </div>

        <Separator className="mb-6" />

        {/* Features */}
        <div className="space-y-3 flex-1 mb-6">
          {plan.features.map((feature, i) => (
            <div key={i} className="flex items-start gap-2.5">
              {feature.included ? (
                <CheckCircle2
                  className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                    isEnterprise
                      ? "text-slate-600 dark:text-slate-300"
                      : "text-emerald-500"
                  }`}
                />
              ) : (
                <X className="w-4 h-4 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
              )}
              <span
                className={`text-sm ${
                  feature.included
                    ? "text-foreground"
                    : "text-muted-foreground/50 line-through"
                }`}
              >
                {feature.text}
              </span>
            </div>
          ))}
        </div>

        {/* CTA Button */}
        <Button
          className={`w-full h-12 text-sm font-bold gap-2 ${
            isEnterprise
              ? "bg-slate-800 hover:bg-slate-700 dark:bg-slate-600 dark:hover:bg-slate-500 text-white shadow-lg"
              : plan.highlight
                ? "shadow-lg shadow-primary/20"
                : "bg-muted text-foreground hover:bg-muted/80"
          }`}
          variant={
            isEnterprise ? "default" : plan.highlight ? "default" : "outline"
          }
          onClick={() => {
            if (isFree) return;
            if (isEnterprise) {
              onContactSales?.();
              return;
            }
            // Trigger Dodo checkout or show coming soon
            onUpgradePremium?.();
          }}
        >
          {isFree ? (
            <>
              <BadgeCheck className="w-4 h-4" />
              {plan.cta}
            </>
          ) : isEnterprise ? (
            <>
              <Briefcase className="w-4 h-4" />
              {plan.cta}
            </>
          ) : (
            <>
              <Crown className="w-4 h-4" />
              {plan.cta}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Contact Sales Modal
// ============================================================
function ContactSalesModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast({
        title: "Missing fields",
        description: "Please enter your name and work email.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/contact-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          teamSize,
          message: message.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({
          title: "Error",
          description: data.error || "Something went wrong.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Inquiry Submitted! 🎉",
        description: data.message || "Our sales team will reach out within 24 hours.",
      });

      // Reset form
      setName("");
      setEmail("");
      setTeamSize("");
      setMessage("");
      onOpenChange(false);
    } catch {
      toast({
        title: "Network Error",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 dark:from-slate-500 dark:to-slate-700 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg">
                Contact Sales
              </DialogTitle>
              <DialogDescription className="text-xs">
                Tell us about your team and we&apos;ll craft a custom plan.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="cs-name" className="text-sm font-medium">
              Full Name <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="cs-name"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pl-9"
                required
              />
            </div>
          </div>

          {/* Work Email */}
          <div className="space-y-1.5">
            <Label htmlFor="cs-email" className="text-sm font-medium">
              Work Email <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="cs-email"
                type="email"
                placeholder="john@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9"
                required
              />
            </div>
          </div>

          {/* Team Size */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Team Size</Label>
            <Select value={teamSize} onValueChange={setTeamSize}>
              <SelectTrigger>
                <SelectValue placeholder="Select team size" />
              </SelectTrigger>
              <SelectContent>
                {TEAM_SIZES.map((ts) => (
                  <SelectItem key={ts.value} value={ts.value}>
                    {ts.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <Label htmlFor="cs-message" className="text-sm font-medium">
              Message
            </Label>
            <div className="relative">
              <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Textarea
                id="cs-message"
                placeholder="Tell us about your requirements..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="pl-9 min-h-[80px] resize-none"
              />
            </div>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            className="w-full h-11 gap-2 font-bold bg-slate-800 hover:bg-slate-700 dark:bg-slate-600 dark:hover:bg-slate-500 text-white"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Inquiry
              </>
            )}
          </Button>

          <p className="text-[10px] text-center text-muted-foreground">
            We typically respond within 24 hours on business days.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// FAQ Item
// ============================================================
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full p-4 text-left hover:bg-accent/30 transition-colors"
      >
        <span className="text-sm font-semibold pr-4">{q}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
              {a}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Main Pricing Page
// ============================================================
export default function PricingPage() {
  const { navigateHome, openAuthDialog } = useAppStore();
  const { toast } = useToast();
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const [region, setRegion] = useState<Region>(() => detectRegion());
  const [contactSalesOpen, setContactSalesOpen] = useState(false);
  const [premiumCheckoutOpen, setPremiumCheckoutOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutName, setCheckoutName] = useState("");
  const [checkoutEmail, setCheckoutEmail] = useState("");

  const isGlobal = region === "global";
  const premiumPlan = isGlobal ? PREMIUM_GLOBAL : PREMIUM_PLAN;

  // Handle Premium upgrade click
  const handleUpgradePremium = () => {
    if (!isDodoConfigured) {
      openAuthDialog();
      toast({
        title: "Premium — Coming Soon!",
        description:
          "Dodo Payments integration is being configured. You'll be the first to know when it launches!",
      });
      return;
    }
    setPremiumCheckoutOpen(true);
  };

  // Create Dodo checkout session
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutName.trim() || !checkoutEmail.trim()) {
      toast({
        title: "Missing fields",
        description: "Please enter your name and email.",
        variant: "destructive",
      });
      return;
    }

    setCheckoutLoading(true);
    try {
      const planType = billing === "monthly" ? "premium_monthly" : "premium_annual";
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planType,
          customerName: checkoutName.trim(),
          customerEmail: checkoutEmail.trim(),
          region: isGlobal ? "global" : "india",
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        toast({
          title: "Payment Error",
          description: data.error || "Something went wrong. Please try again.",
          variant: "destructive",
        });
        return;
      }

      // Redirect to Dodo payment page
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      toast({
        title: "Network Error",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
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
            Back to Home
          </button>
        </motion.div>

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            <Crown className="w-3.5 h-3.5" />
            Simple, Transparent Pricing
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-4 leading-tight">
            Choose Your{" "}
            <span className="bg-gradient-to-r from-primary via-red-500 to-primary bg-clip-text text-transparent">
              PdfCrux Plan
            </span>
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-base sm:text-lg">
            Start free with 12 Non-AI + 3 AI tokens per month. Upgrade for
            unlimited power. Go Enterprise for your entire team.
          </p>
        </motion.div>

        {/* Billing Toggle + Region Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10"
        >
          {/* Monthly/Annual Toggle */}
          <div className="flex items-center gap-2 p-1 rounded-xl bg-muted">
            <button
              onClick={() => setBilling("monthly")}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                billing === "monthly"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling("annual")}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                billing === "annual"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Annual
            </button>
          </div>

          {/* Region Toggle */}
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <div className="flex items-center gap-1 p-1 rounded-lg bg-muted">
              <button
                onClick={() => setRegion("india")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  region === "india"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                🇮🇳 INR
              </button>
              <button
                onClick={() => setRegion("global")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  region === "global"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                🌍 USD
              </button>
            </div>
          </div>
        </motion.div>

        {/* Pricing Cards — 3 columns */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-6 max-w-6xl mx-auto mb-16"
        >
          <PricingCard
            plan={FREE_PLAN}
            region={region}
            billing={billing}
            isGlobal={isGlobal}
          />
          <PricingCard
            plan={premiumPlan}
            region={region}
            billing={billing}
            isGlobal={isGlobal}
            onUpgradePremium={handleUpgradePremium}
          />
          <PricingCard
            plan={ENTERPRISE_PLAN}
            region={region}
            billing={billing}
            isGlobal={isGlobal}
            onContactSales={() => setContactSalesOpen(true)}
          />
        </motion.div>

        {/* Contact Sales Modal */}
        <ContactSalesModal
          open={contactSalesOpen}
          onOpenChange={setContactSalesOpen}
        />

        {/* Premium Checkout Modal — Dodo Payments */}
        <Dialog open={premiumCheckoutOpen} onOpenChange={setPremiumCheckoutOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-lg">Upgrade to Premium</DialogTitle>
                  <DialogDescription className="text-xs">
                    Complete your payment via Dodo Payments — secure &amp; fast.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* Plan summary */}
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {billing === "monthly" ? "Monthly" : "Annual"} Plan
                </span>
                <span className="text-sm font-bold">
                  {isGlobal
                    ? billing === "monthly" ? "$5.99" : "$49"
                    : billing === "monthly" ? "₹249" : "₹1,999"
                  }
                </span>
              </div>
              {billing === "annual" && (
                <p className="text-[10px] text-emerald-600 mt-1">
                  {isGlobal ? "$4.08/mo" : "₹166/mo"} — Save {isGlobal ? "32%" : "33%"}
                </p>
              )}
            </div>

            <form onSubmit={handleCheckout} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="co-name" className="text-sm font-medium">
                  Full Name <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="co-name"
                    placeholder="John Doe"
                    value={checkoutName}
                    onChange={(e) => setCheckoutName(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="co-email" className="text-sm font-medium">
                  Email <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="co-email"
                    type="email"
                    placeholder="john@example.com"
                    value={checkoutEmail}
                    onChange={(e) => setCheckoutEmail(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 gap-2 font-bold shadow-lg shadow-primary/20"
                disabled={checkoutLoading}
              >
                {checkoutLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Redirecting to Dodo...
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    Pay Securely via Dodo
                  </>
                )}
              </Button>

              <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
                <Shield className="w-3 h-3 text-emerald-500" />
                <span>256-bit SSL · PCI DSS Compliant · UPI, Cards, Net Banking</span>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* =========================================
            TOKEN ECONOMY SECTION
        ========================================= */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mb-16"
        >
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">
              How Tokens Work
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto text-sm">
              Simple, fair, and transparent. Every task costs exactly one token.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                icon: FileText,
                title: "Non-AI Tools",
                desc: "Compress, Merge, Split, Rotate, Sign, Watermark, Protect, etc.",
                tokens: "1 token",
                color: "text-emerald-600 dark:text-emerald-400",
                bg: "bg-emerald-50 dark:bg-emerald-950/30",
              },
              {
                icon: Sparkles,
                title: "AI Tools",
                desc: "PDF Summary, PDF Notes, Resume ATS Checker",
                tokens: "1 AI token",
                color: "text-amber-600 dark:text-amber-400",
                bg: "bg-amber-50 dark:bg-amber-950/30",
              },
              {
                icon: Layers,
                title: "Bulk Operations",
                desc: "Bulk Compress uses 1 token per PDF file processed",
                tokens: "1/file",
                color: "text-blue-600 dark:text-blue-400",
                bg: "bg-blue-50 dark:bg-blue-950/30",
              },
              {
                icon: QrCode,
                title: "Invoice Generator",
                desc: "Create professional invoices with customizable templates",
                tokens: "1 token",
                color: "text-violet-600 dark:text-violet-400",
                bg: "bg-violet-50 dark:bg-violet-950/30",
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.05 }}
                className="p-5 rounded-xl border bg-card hover:border-primary/20 transition-colors"
              >
                <div
                  className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center mb-3`}
                >
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <h3 className="text-sm font-bold mb-1">{item.title}</h3>
                <p className="text-xs text-muted-foreground mb-3">{item.desc}</p>
                <Badge
                  variant="secondary"
                  className={`text-[10px] font-bold`}
                >
                  {item.tokens}
                </Badge>
              </motion.div>
            ))}
          </div>

          {/* Token comparison table — 4 columns */}
          <div className="mt-8 max-w-3xl mx-auto">
            <Card>
              <CardContent className="p-0">
                <div className="grid grid-cols-4 text-center">
                  {/* Header */}
                  <div className="p-4 border-b border-r">
                    <p className="text-xs text-muted-foreground mb-1">
                      Token Type
                    </p>
                  </div>
                  <div className="p-4 border-b border-r">
                    <p className="text-xs font-bold text-muted-foreground">
                      Free
                    </p>
                  </div>
                  <div className="p-4 border-b border-r bg-primary/5">
                    <p className="text-xs font-bold text-primary flex items-center justify-center gap-1">
                      <Crown className="w-3 h-3" /> Premium
                    </p>
                  </div>
                  <div className="p-4 border-b bg-slate-50 dark:bg-slate-800/50">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1">
                      <Building2 className="w-3 h-3" /> Enterprise
                    </p>
                  </div>

                  {/* Non-AI Tokens */}
                  <div className="p-3 border-b border-r bg-muted/30">
                    <p className="text-sm font-semibold">Non-AI Tokens</p>
                  </div>
                  <div className="p-3 border-b border-r">
                    <p className="text-sm font-bold">12/mo</p>
                  </div>
                  <div className="p-3 border-b border-r bg-primary/5">
                    <div className="flex items-center justify-center gap-1">
                      <Infinity className="w-4 h-4 text-primary" />
                      <p className="text-sm font-bold text-primary">Unlimited</p>
                    </div>
                  </div>
                  <div className="p-3 border-b bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center justify-center gap-1">
                      <Infinity className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                      <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                        Unlimited
                      </p>
                    </div>
                  </div>

                  {/* AI Tokens */}
                  <div className="p-3 border-b border-r bg-muted/30">
                    <p className="text-sm font-semibold">AI Tokens</p>
                  </div>
                  <div className="p-3 border-b border-r">
                    <p className="text-sm font-bold">3/mo</p>
                  </div>
                  <div className="p-3 border-b border-r bg-primary/5">
                    <p className="text-sm font-bold text-primary">100/mo</p>
                  </div>
                  <div className="p-3 border-b bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center justify-center gap-1">
                      <Infinity className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                      <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                        Unlimited
                      </p>
                    </div>
                  </div>

                  {/* Bulk Compress */}
                  <div className="p-3 border-b border-r bg-muted/30">
                    <p className="text-sm font-semibold">Bulk Compress</p>
                  </div>
                  <div className="p-3 border-b border-r">
                    <p className="text-sm font-bold">3 files</p>
                  </div>
                  <div className="p-3 border-b border-r bg-primary/5">
                    <p className="text-sm font-bold text-primary">100 files at once</p>
                  </div>
                  <div className="p-3 border-b bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center justify-center gap-1">
                      <Infinity className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                      <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                        Unlimited
                      </p>
                    </div>
                  </div>

                  {/* Refresh */}
                  <div className="p-3 border-r bg-muted/30">
                    <p className="text-sm font-semibold">Token Refresh</p>
                  </div>
                  <div className="p-3 border-r">
                    <p className="text-sm font-bold">Monthly</p>
                  </div>
                  <div className="p-3 border-r bg-primary/5">
                    <p className="text-sm font-bold text-primary">Monthly</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50">
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                      N/A
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        {/* =========================================
            CLOUD STORAGE SECTION
        ========================================= */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-16"
        >
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">
              Smart Cloud Storage
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto text-sm">
              Premium &amp; Enterprise only. Efficient, secure, and auto-cleaning.
            </p>
          </div>

          <Card className="max-w-4xl mx-auto overflow-hidden">
            <CardContent className="p-0">
              {/* Cloud storage hero */}
              <div className="bg-gradient-to-br from-sky-50 to-violet-50 dark:from-sky-950/30 dark:to-violet-950/30 p-6 sm:p-8">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-violet-500 flex items-center justify-center shadow-lg flex-shrink-0">
                    <Cloud className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-1">
                      Premium: 1GB &nbsp;|&nbsp; Enterprise: 10GB+
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Optimized history management means we store smart metadata
                      links, not heavy files — so storage lasts much longer than
                      you think.
                    </p>
                  </div>
                </div>
              </div>

              {/* Storage features — 4 items */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x">
                {[
                  {
                    icon: HardDrive,
                    title: "Smart Storage",
                    desc: "1GB (Premium) or 10GB+ (Enterprise) with optimized metadata",
                    color: "text-sky-600 dark:text-sky-400",
                  },
                  {
                    icon: Clock,
                    title: "30-Day Retention",
                    desc: "Files auto-delete after 30 days for data privacy compliance",
                    color: "text-amber-600 dark:text-amber-400",
                  },
                  {
                    icon: Trash2,
                    title: "Auto-Cleanup",
                    desc: "Expired files are automatically removed to free up storage",
                    color: "text-emerald-600 dark:text-emerald-400",
                  },
                  {
                    icon: Headphones,
                    title: "Enterprise SLA",
                    desc: "Enterprise gets guaranteed uptime and priority data recovery",
                    color: "text-slate-600 dark:text-slate-400",
                  },
                ].map((item, i) => (
                  <div key={i} className="p-5 text-center">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                      <item.icon className={`w-5 h-5 ${item.color}`} />
                    </div>
                    <h4 className="text-sm font-bold mb-1">{item.title}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>

              {/* Privacy note */}
              <div className="px-6 py-4 bg-muted/30 border-t flex items-center gap-3">
                <Shield className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    Privacy First:
                  </span>{" "}
                  All cloud files are encrypted with 256-bit AES. We never read,
                  share, or analyze your content. Auto-delete ensures compliance
                  with GDPR and data protection laws.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* =========================================
            FEATURE COMPARISON — 3 Plans Side-by-Side
        ========================================= */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="mb-16"
        >
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">
              Feature Comparison
            </h2>
          </div>

          <Card className="max-w-4xl mx-auto overflow-hidden">
            <CardContent className="p-0">
              {/* Header row */}
              <div className="grid grid-cols-4 text-center border-b">
                <div className="p-3 sm:p-4 text-left border-r">
                  <p className="text-xs text-muted-foreground">Feature</p>
                </div>
                <div className="p-3 sm:p-4 border-r bg-muted/20">
                  <p className="text-xs font-bold text-muted-foreground">Free</p>
                </div>
                <div className="p-3 sm:p-4 border-r bg-primary/5">
                  <p className="text-xs font-bold text-primary">Premium</p>
                </div>
                <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Enterprise
                  </p>
                </div>
              </div>

              {[
                { feature: "PDF Merge", free: true, premium: true, enterprise: true },
                { feature: "PDF Split", free: true, premium: true, enterprise: true },
                { feature: "PDF Compress", free: true, premium: true, enterprise: true },
                { feature: "PDF to Word/Excel/JPG", free: true, premium: true, enterprise: true },
                { feature: "Word/Excel/PPT to PDF", free: true, premium: true, enterprise: true },
                { feature: "Sign & Watermark", free: true, premium: true, enterprise: true },
                { feature: "Protect & Unlock PDF", free: true, premium: true, enterprise: true },
                { feature: "Invoice Generator", free: "12/mo", premium: "Unlimited", enterprise: "Unlimited" },
                { feature: "Bulk Compress", free: "3 files", premium: "100 files at once", enterprise: "Unlimited" },
                { feature: "PDF Summary (AI)", free: "3/mo", premium: "100/mo", enterprise: "Unlimited" },
                { feature: "PDF Notes (AI)", free: "3/mo", premium: "100/mo", enterprise: "Unlimited" },
                { feature: "Resume ATS (AI)", free: "3/mo", premium: "100/mo", enterprise: "Unlimited" },
                { feature: "Remove Branding", free: false, premium: true, enterprise: true },
                { feature: "Cloud Storage", free: false, premium: "1GB", enterprise: "10GB+" },
                { feature: "File History", free: false, premium: "30 days", enterprise: "Custom" },
                { feature: "Priority Processing", free: false, premium: true, enterprise: true },
                { feature: "Team Dashboard", free: false, premium: false, enterprise: true },
                { feature: "API Access", free: false, premium: false, enterprise: true },
                { feature: "Dedicated Support", free: false, premium: false, enterprise: "24/7" },
                { feature: "Custom Integrations", free: false, premium: false, enterprise: true },
                { feature: "SLA Guarantee", free: false, premium: false, enterprise: true },
              ].map((item, i) => (
                <div
                  key={i}
                  className={`grid grid-cols-4 text-center border-b last:border-b-0 ${
                    i % 2 === 0 ? "bg-muted/5" : ""
                  }`}
                >
                  <div className="p-2.5 sm:p-3 text-left border-r">
                    <p className="text-xs sm:text-sm text-foreground">
                      {item.feature}
                    </p>
                  </div>
                  {/* Free */}
                  <div className="p-2.5 sm:p-3 border-r">
                    {item.free === true ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                    ) : item.free === false ? (
                      <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />
                    ) : (
                      <span className="text-xs text-muted-foreground font-medium">
                        {String(item.free)}
                      </span>
                    )}
                  </div>
                  {/* Premium */}
                  <div className="p-2.5 sm:p-3 border-r bg-primary/[0.02]">
                    {item.premium === true ? (
                      <CheckCircle2 className="w-4 h-4 text-primary mx-auto" />
                    ) : item.premium === false ? (
                      <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />
                    ) : (
                      <span className="text-xs text-primary font-bold">
                        {String(item.premium)}
                      </span>
                    )}
                  </div>
                  {/* Enterprise */}
                  <div className="p-2.5 sm:p-3 bg-slate-50/50 dark:bg-slate-800/20">
                    {item.enterprise === true ? (
                      <CheckCircle2 className="w-4 h-4 text-slate-600 dark:text-slate-300 mx-auto" />
                    ) : item.enterprise === false ? (
                      <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />
                    ) : (
                      <span className="text-xs text-slate-600 dark:text-slate-300 font-bold">
                        {String(item.enterprise)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* =========================================
            FAQ SECTION
        ========================================= */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-16"
        >
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">
              Frequently Asked Questions
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto text-sm">
              Everything you need to know about PdfCrux pricing.
            </p>
          </div>

          <div className="max-w-2xl mx-auto space-y-3">
            {FAQ_ITEMS.map((item, i) => (
              <FAQItem key={i} q={item.q} a={item.a} />
            ))}
          </div>
        </motion.div>

        {/* =========================================
            BOTTOM CTA
        ========================================= */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="text-center py-8"
        >
          <Card className="max-w-3xl mx-auto overflow-hidden">
            <CardContent className="p-8 sm:p-12 bg-gradient-to-br from-primary/5 via-background to-slate-500/5">
              <h3 className="text-xl sm:text-2xl font-bold mb-2">
                Ready to Level Up?
              </h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto text-sm">
                Choose Premium for unlimited tokens and 1GB cloud. Or go
                Enterprise for your entire team with dedicated support.
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Button
                  size="lg"
                  className="shadow-lg shadow-primary/20 gap-2"
                  onClick={() => {
                    toast({
                      title: "Coming Soon!",
                      description:
                        "Payment integration is being set up. Stay tuned!",
                    });
                  }}
                >
                  <Crown className="w-4 h-4" />
                  Get Premium — {isGlobal ? "$5.99" : "₹249"}/mo
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="gap-2 border-slate-300 dark:border-slate-600"
                  onClick={() => setContactSalesOpen(true)}
                >
                  <Building2 className="w-4 h-4" />
                  Contact Sales
                </Button>
                <Button variant="ghost" size="lg" onClick={navigateHome}>
                  Back to Tools
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
