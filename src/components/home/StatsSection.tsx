"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FileText, Users, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

const stats = [
  { target: 25, suffix: "M+", labelKey: "stats.pdfs", icon: FileText },
  { target: 2, suffix: "M+", labelKey: "stats.users", icon: Users },
  { target: 99.9, suffix: "%", decimals: 1, labelKey: "stats.uptime", icon: CheckCircle2 },
  { target: 150, suffix: "+", labelKey: "stats.countries", icon: ArrowUpRight },
];

const reviews = [
  // 🇺🇸 American
  {
    name: "Sarah Johnson",
    role: "Marketing Director",
    company: "TechFlow Inc.",
    text: "Replaced our expensive PDF software overnight. The merge and compress features are incredibly fast. Our team saves hours every week processing client documents.",
    rating: 5,
    avatar: "https://randomuser.me/api/portraits/women/44.jpg",
  },
  // 🇷🇺 Russian
  {
    name: "Dmitri Volkov",
    role: "Software Engineer",
    company: "SberTech Moscow",
    text: "The compression algorithm is outstanding. I reduced a 50MB technical document to just 3MB without any noticeable quality loss. Truly impressive engineering.",
    rating: 4.5,
    avatar: "https://randomuser.me/api/portraits/men/52.jpg",
  },
  // 🇯🇵 Japanese
  {
    name: "Yuki Tanaka",
    role: "Architect",
    company: "Zen Designs Tokyo",
    text: "PDF to image conversion preserves every detail of my architectural drawings. Colors stay accurate and lines stay crisp even at high resolution exports.",
    rating: 5,
    avatar: "https://randomuser.me/api/portraits/men/55.jpg",
  },
  // 🇨🇦 Canadian
  {
    name: "Emily Tremblay",
    role: "Freelance Designer",
    company: "DesignHub Montréal",
    text: "I use the PDF to JPG converter daily for client work. The quality is perfect every single time. No other tool comes close to this level of reliability.",
    rating: 4.5,
    avatar: "https://randomuser.me/api/portraits/women/68.jpg",
  },
  // 🇳🇬 Nigerian (African)
  {
    name: "Chidi Okonkwo",
    role: "Business Owner",
    company: "Lagos Trade Co.",
    text: "Running my entire business documentation through PdfCrux. From invoices to contracts, it handles everything. Absolutely reliable and incredibly fast.",
    rating: 4,
    avatar: "https://randomuser.me/api/portraits/men/58.jpg",
  },
  // 🇩🇪 German
  {
    name: "Lisa Müller",
    role: "HR Manager",
    company: "Siemens Munich",
    text: "We process hundreds of employee documents daily across multiple departments. PdfCrux handles everything flawlessly without ever crashing or slowing down.",
    rating: 5,
    avatar: "https://randomuser.me/api/portraits/women/65.jpg",
  },
  // 🇧🇷 Brazilian
  {
    name: "Carlos Mendoza",
    role: "Civil Engineer",
    company: "BuildMax São Paulo",
    text: "I compress massive construction blueprints to email-friendly sizes in seconds. My clients receive detailed plans without any storage or delivery issues.",
    rating: 4,
    avatar: "https://randomuser.me/api/portraits/men/61.jpg",
  },
  // 🇰🇪 Kenyan (African)
  {
    name: "Amara Osei",
    role: "Project Manager",
    company: "Nairobi Digital",
    text: "Our entire team's go-to solution for all PDF tasks. Compress, merge, convert — it does absolutely everything we need and the speed is remarkable.",
    rating: 3.5,
    avatar: "https://randomuser.me/api/portraits/women/54.jpg",
  },
  // 🇫🇷 French
  {
    name: "Sophie Laurent",
    role: "Graphic Designer",
    company: "Paris Studio Créatif",
    text: "Split and merge PDF portfolios for my design clients with zero quality loss. The interface is clean, fast, and intuitive. A designer's dream tool.",
    rating: 5,
    avatar: "https://randomuser.me/api/portraits/women/62.jpg",
  },
  // 🇮🇳 Indian
  {
    name: "Raj Patel",
    role: "CA & Tax Consultant",
    company: "Patel Tax Solutions",
    text: "Convert my worksheets to PDF in bulk. The batch processing is a lifesaver during tax season when I handle hundreds of client documents.",
    rating: 4.5,
    avatar: "https://randomuser.me/api/portraits/men/67.jpg",
  },
  // 🇦🇺 Australian
  {
    name: "James Wilson",
    role: "Legal Assistant",
    company: "Hartman & Co., Sydney",
    text: "The protect and sign features give us the security we need for legal documents. Client confidentiality is never compromised with PdfCrux.",
    rating: 5,
    avatar: "https://randomuser.me/api/portraits/men/75.jpg",
  },
  // 🇰🇷 South Korean
  {
    name: "Ji-yeon Park",
    role: "Research Scholar",
    company: "Seoul National University",
    text: "Merge research papers into single documents for publication. The page numbering feature is brilliant for academic submissions and thesis formatting.",
    rating: 4,
    avatar: "https://randomuser.me/api/portraits/women/59.jpg",
  },
  // 🇲🇽 Mexican
  {
    name: "Elena Rivera",
    role: "Accountant",
    company: "Global Finance México",
    text: "Watermarking client financial reports was never this easy. Professional results every time with full customization options for our branding needs.",
    rating: 4.5,
    avatar: "https://randomuser.me/api/portraits/women/70.jpg",
  },
  // 🇬🇧 British
  {
    name: "Thomas Anderson",
    role: "Startup Founder",
    company: "NovaTech London",
    text: "Best free PDF toolkit I've ever found. The invoice generator alone saves me hours each month. I recommend it to every entrepreneur I know.",
    rating: 5,
    avatar: "https://randomuser.me/api/portraits/men/71.jpg",
  },
  // 🇿🇦 South African
  {
    name: "Thabo Mokoena",
    role: "Corporate Lawyer",
    company: "Mokoena Legal, Cape Town",
    text: "Client confidentiality is paramount in our practice. The password protection and encryption features meet our firm's strict compliance requirements perfectly.",
    rating: 4,
    avatar: "https://randomuser.me/api/portraits/men/60.jpg",
  },
  // 🇮🇹 Italian
  {
    name: "Marco Rossi",
    role: "Photographer",
    company: "Studio Roma",
    text: "Convert high-resolution photo portfolios to PDF seamlessly. Resolution stays pixel-perfect and the color accuracy is maintained throughout the conversion.",
    rating: 3.5,
    avatar: "https://randomuser.me/api/portraits/men/56.jpg",
  },
  // 🇨🇦 Canadian (French)
  {
    name: "Nadia Bouchard",
    role: "Management Consultant",
    company: "Deloitte Canada",
    text: "Professional invoices with 40+ currency support are exactly what international consulting needs. The multi-language feature makes it truly global ready.",
    rating: 5,
    avatar: "https://randomuser.me/api/portraits/women/76.jpg",
  },
  // 🇪🇸 Spanish
  {
    name: "Alejandro García",
    role: "Real Estate Agent",
    company: "PropCare Barcelona",
    text: "Organizing PDF contracts by rearranging pages is so simple yet so powerful. I prepare complete property document packages in minutes instead of hours.",
    rating: 4.5,
    avatar: "https://randomuser.me/api/portraits/men/69.jpg",
  },
  // 🇺🇸 American
  {
    name: "Michael O'Brien",
    role: "Content Writer & Translator",
    company: "WordBridge NYC",
    text: "Works perfectly with PDFs in every language I translate. The text extraction capabilities are genuinely impressive for multilingual documents.",
    rating: 4,
    avatar: "https://randomuser.me/api/portraits/women/63.jpg",
  },
  // 🇷🇺 Russian
  {
    name: "Anastasia Petrova",
    role: "Translator",
    company: "LinguaBridge Moscow",
    text: "Generous free plan with no credit card needed. I use it daily for my research papers and case study submissions. Premium is worth every penny for heavy usage.",
    rating: 5,
    avatar: "https://randomuser.me/api/portraits/women/64.jpg",
  },
];

/* ------------------------------------------------------------------ */
/*  Star rating renderer (supports half stars)                          */
/* ------------------------------------------------------------------ */

function Stars({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.25;
  const empty = 5 - full - (hasHalf ? 1 : 0);

  return (
    <div className="flex gap-0.5">
      {Array.from({ length: full }).map((_, i) => (
        <svg key={`f${i}`} className="w-4 h-4 text-amber-400 fill-amber-400" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      {hasHalf && (
        <svg key="half" className="w-4 h-4" viewBox="0 0 20 20">
          <defs>
            <linearGradient id="halfStar">
              <stop offset="50%" stopColor="#fbbf24" />
              <stop offset="50%" stopColor="#e5e7eb" />
            </linearGradient>
          </defs>
          <path fill="url(#halfStar)" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      )}
      {Array.from({ length: Math.max(0, empty) }).map((_, i) => (
        <svg key={`e${i}`} className="w-4 h-4 text-gray-300 fill-gray-300" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Review card                                                         */
/* ------------------------------------------------------------------ */

function ReviewCard({ review }: { review: typeof reviews[number] }) {
  return (
    <div className="w-[320px] sm:w-[360px] flex-shrink-0 p-5 rounded-xl border bg-card hover:shadow-lg transition-shadow duration-300">
      <Stars rating={review.rating} />
      <p className="text-sm text-muted-foreground leading-relaxed mt-3 mb-4 line-clamp-3">
        &quot;{review.text}&quot;
      </p>
      <div className="flex items-center gap-3">
        <img
          src={review.avatar}
          alt={review.name}
          className="w-9 h-9 rounded-full object-cover shrink-0 ring-2 ring-background"
          loading="lazy"
        />
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{review.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {review.role}, {review.company}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Marquee row – uses animation-play-state for instant pause/resume   */
/* ------------------------------------------------------------------ */

function MarqueeRow({ direction = "left", speed = 80, paused }: {
  direction?: "left" | "right";
  speed?: number;
  paused: boolean;
}) {
  const items = direction === "left" ? reviews : [...reviews].reverse();
  const duplicated = [...items, ...items];
  const animName = direction === "left" ? "marquee-left" : "marquee-right";

  return (
    <div
      className="flex gap-5 w-max"
      style={{
        animation: `${animName} ${speed}s linear infinite`,
        animationPlayState: paused ? "paused" : "running",
      }}
    >
      {duplicated.map((review, i) => (
        <ReviewCard key={`${review.name}-${i}`} review={review} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Animated counter — counts up when scrolled into view                 */
/* ------------------------------------------------------------------ */

function AnimatedCounter({ target, suffix, decimals = 0 }: {
  target: number;
  suffix: string;
  decimals?: number;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;

          const duration = 2000; // 2 seconds
          const startTime = performance.now();

          function tick(now: number) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Number((eased * target).toFixed(decimals)));

            if (progress < 1) {
              requestAnimationFrame(tick);
            } else {
              setDisplay(target);
            }
          }

          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [target, decimals]);

  return (
    <span ref={ref}>
      {decimals > 0 ? display.toFixed(decimals) : display}{suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export default function StatsSection() {
  const { t } = useLanguage();
  const [paused, setPaused] = useState(false);

  return (
    <section className="py-16 sm:py-24 overflow-hidden">
      <style jsx global>{`
        @keyframes marquee-left {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes marquee-right {
          0%   { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
      `}</style>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-16"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={stat.labelKey}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="text-center p-6 rounded-xl border bg-card"
            >
              <stat.icon className="w-5 h-5 text-primary mx-auto mb-2" />
              <div className="text-3xl sm:text-4xl font-bold text-primary mb-1">
                <AnimatedCounter
                  target={stat.target}
                  suffix={stat.suffix}
                  decimals={stat.decimals || 0}
                />
              </div>
              <div className="text-sm text-muted-foreground font-medium">
                {t(stat.labelKey)}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Testimonials */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">
            {t("stats.heading")}
          </h2>

          <div
            className="relative space-y-5"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onTouchStart={() => setPaused(true)}
            onTouchEnd={() => setPaused(false)}
          >
            {/* Row 1 – scrolls left, slow */}
            <div className="overflow-hidden">
              <MarqueeRow direction="left" speed={75} paused={paused} />
            </div>

            {/* Row 2 – scrolls right, slightly different speed */}
            <div className="overflow-hidden">
              <MarqueeRow direction="right" speed={85} paused={paused} />
            </div>
          </div>

          {/* Pause hint */}
          <p className="text-center text-xs text-muted-foreground/50 mt-6 transition-opacity">
            {paused ? "▶ Resumes on mouse out…" : "❚❚ Hover or tap to pause"}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
