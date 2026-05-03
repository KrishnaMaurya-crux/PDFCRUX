# PdfCrux — Project Log

> **"Chat history par bharosa mat karna, sirf in files mein jo likha hai wahi 'Sacch' (Truth) hai."**

---

## 📋 Project Overview

| Field | Value |
|---|---|
| **Project Name** | PdfCrux |
| **Type** | SaaS — PDF Tools Platform |
| **Framework** | Next.js 16 (App Router) + TypeScript 5 |
| **Styling** | Tailwind CSS 4 + shadcn/ui (New York) |
| **Database** | Prisma ORM (SQLite) — `db/custom.db` |
| **Auth** | NextAuth.js v4 + Supabase |
| **State** | Zustand (client) + TanStack Query (server) |
| **Payment Gateway** | Dodo Payments (Universal — India + Global) |
| **Cloud Storage** | Cloudflare R2 |
| **Cloud Import** | Google Drive + Dropbox |
| **AI** | Gemini API (PDF AI tools) |
| **Fonts** | Geist Sans/Mono + 5 Signature fonts (next/font/google) |
| **Routing** | Single-page app — all views via Zustand `currentView` in `page.tsx` |

---

## 🏗️ Architecture

### File Structure (Key Files)
```
src/
├── app/
│   ├── layout.tsx          # Root layout (fonts, providers)
│   ├── page.tsx            # MAIN SPA — all routing via Zustand
│   ├── globals.css         # Global styles
│   └── api/
│       ├── health/route.ts         # Health check endpoint
│       ├── r2/route.ts             # R2 upload/download/delete
│       ├── payments/
│       │   ├── checkout/route.ts   # Dodo checkout session
│       │   ├── webhook/route.ts    # Dodo webhook handler
│       │   └── status/route.ts     # Payment status check
│       └── ai/
│           └── route.ts            # Gemini AI endpoint
├── components/
│   ├── home/
│   │   ├── HeroSection.tsx    # Hero with 12 floating brand icons
│   │   ├── ToolsGrid.tsx      # Tool cards grid
│   │   ├── Features.tsx       # Feature showcase
│   │   └── PricingSection.tsx # Pricing plans
│   ├── tool/
│   │   ├── ToolPage.tsx       # Main tool renderer (1138 lines)
│   │   ├── ToolOptions.tsx    # Dynamic options + SignCanvas + SignatureUpload
│   │   ├── LivePreview.tsx    # Live PDF preview (948 lines)
│   │   └── BulkCompressPDF.tsx # Bulk compression (1278 lines)
│   ├── layout/
│   │   ├── Header.tsx         # Navbar with auth
│   │   └── Footer.tsx         # Sticky footer
│   ├── pricing/
│   │   └── PricingPage.tsx    # Full pricing page
│   └── StaticPages.tsx        # Privacy, Terms, Refund, Contact
├── lib/
│   ├── store.ts              # Zustand store (CRITICAL: spread order fixed)
│   ├── tool-configs.ts       # All tool definitions + options
│   ├── tools.ts              # Tool metadata + categories
│   ├── pdf-processor.ts      # Core PDF processing engine
│   ├── r2.ts                 # Cloudflare R2 client
│   ├── env.ts                # Centralized env config
│   ├── dodo-payments.ts      # Dodo Payments integration
│   ├── i18n.ts               # Multi-language support
│   └── tokens.ts             # Invoice token system
├── hooks/
│   └── use-toast.ts          # Toast notifications
prisma/
└── schema.prisma             # Database schema
.env                          # Env reference (committed, keys can be here for dev)
.env.local                    # ⚠️ MASTER CREDENTIALS (DO NOT COMMIT)
```

### Zustand Store Routing
The app uses `currentView` in Zustand to switch between views:
- `"home"` → Home page (Hero + ToolsGrid + Features + Pricing)
- `"pricing"` → Full pricing page
- `"privacy"` / `"terms"` / `"refund"` / `"contact"` → Legal pages
- `"tool"` → Tool page (uses `selectedToolId` to determine which tool)
- `"bulk-compress"` → Bulk compress PDF (separate view)

---

## 🔧 Active Features (As of 2025-07-17)

### ✅ Working Features
1. **PDF Tools** — All tools render properly via `ToolPage.tsx`
   - Merge, Split, Compress, Rotate, Watermark, Protect/Unprotect
   - Sign PDF (type, draw, upload) — Live preview fixed
   - Page Numbers, Organize, Convert (PDF↔Image/Word/Excel/PPT)
   - Compare PDF, OCR, AI Chat with PDF
2. **Bulk Compress PDF** — Batch compression with ZIP download, session resume
3. **Live Preview** — Real-time preview for merge, split, rotate, watermark, sign, page-numbers, organize
4. **Invoice Token System** — 1 token = 1 invoice, tracked in Prisma DB
5. **Enterprise Plan** — Custom pricing with contact form
6. **Cloud Storage** — Cloudflare R2 (upload/download/delete)
7. **Cloud Import** — Google Drive Picker + Dropbox Chooser
8. **Authentication** — NextAuth.js v4 (Google Sign In, email)
9. **Multi-language** — English + Hindi support
10. **Dark Mode** — next-themes with system detection
11. **Static Pages** — Privacy Policy, Terms, Refund, Contact (isolated views)
12. **Dodo Payments** — Full integration built (checkout, webhook, status) — PENDING user API keys
13. **Floating Brand Icons** — 12 animated icons in hero section at 30% opacity

### ⚠️ Pending (Needs User Action)
1. **Dodo Payments API Keys** — User needs to provide `DODO_API_KEY`, `DODO_BUSINESS_ID`, `DODO_WEBHOOK_SECRET`
2. **Gemini API Keys** — For AI PDF tools (AI Chat, OCR, etc.)
3. **Vercel Deployment** — Need git remote + Vercel project setup
4. **Production DATABASE_URL** — Currently using local SQLite, needs PostgreSQL for Vercel

---

## 🐛 Bugs Fixed (2025-07-17)

### 1. Tool UI Invisible (CRITICAL)
- **Root Cause**: `selectTool()` in `store.ts` had spread order bug — `...resetToolState()` was overwriting `selectedToolId: toolId` to null
- **Fix**: Swapped order — `...resetToolState()` first, then `selectedToolId: toolId` wins
- **File**: `src/lib/store.ts` (line 63-68)

### 2. Cross-Origin Asset Blocking (403)
- **Root Cause**: `allowedDevOrigins` in `next.config.ts` had wrong format
- **Fix**: Added both hostname and `https://hostname` formats
- **File**: `next.config.ts` (line 17-20)

### 3. Auto-Scroll on View Change
- **Fix**: Added `useEffect` with `window.scrollTo(0, 0)` in `page.tsx`
- **File**: `src/app/page.tsx`

### 4. Floating Icons Not Visible
- **Root Cause**: Opacity was 18% × Tailwind 25% = ~4.5% effective — invisible
- **Fix**: Removed Tailwind opacity modifiers, increased style opacity to 30%, larger icons, thicker strokes
- **File**: `src/components/home/HeroSection.tsx`

### 5. Sign PDF Live Preview Not Rendering Fonts
- **Root Cause**: Signature font CSS variables from `next/font/google` not applied to `<body>` element
- **Fix**: Added all 5 signature font CSS variables to body className in layout.tsx
- **Fix**: Updated LivePreview font map to use `var(--font-dancing)` etc.
- **Files**: `src/app/layout.tsx`, `src/components/tool/LivePreview.tsx`

---

## 🚀 Pre-Deployment Changes (2025-07-17)

### 6. IP-Based Pricing (Auto INR/USD Detection)
- **Removed**: Manual 🇮🇳 INR / 🌍 USD toggle buttons from PricingPage
- **Added**: `/api/geo` API route using ipapi.co for IP-based country detection
- **Behavior**: India IP → INR prices, everywhere else → USD (default)
- **UI**: Subtle "Prices in USD/INR" badge with MapPin icon replaces toggle
- **Dodo**: Checkout automatically passes correct currency based on detected region
- **Files**: `src/app/api/geo/route.ts`, `src/components/PricingPage.tsx`

### 7. Marketing Text Sync with Pricing Plans
- **Changed**: "100% Free" → "Free Plan Available" (5 locations)
- **Changed**: "100% Free — No Sign Up Required" → "Free Plan Available — No Credit Card Required"
- **Changed**: "No sign-up required, 100% free" → "No sign-up required for your first 3 uses per day"
- **Changed**: "5 free summaries/generations/checks" → "3 free per day" (matches actual free plan)
- **Changed**: "Free forever and no account needed?" testimonial → mentions free plan + Premium
- **Changed**: FAQ answer about "Is PdfCrux really free?" → mentions free plan + Premium upsell
- **Files**: `src/lib/i18n.tsx`, `src/components/tool/AIToolPage.tsx`, `src/components/tool/InvoiceGenerator.tsx`, `src/components/home/StatsSection.tsx`, `src/components/StaticPages.tsx`

### 8. Lazy Authentication (Sign-in Flow)
- **Removed**: `openAuthDialog` call from Hero CTA button
- **Changed**: Hero CTA now scrolls to tools grid instead of showing sign-in popup
- **Behavior**: Users can explore tools, upload files without sign-in. Auth only needed for premium/checkout.
- **File**: `src/components/home/HeroSection.tsx`

---

## 🔑 Credentials Status

| Service | Status | Location |
|---|---|---|
| Supabase | ✅ Configured | `.env.local` + `.env` |
| Cloudflare R2 | ✅ Configured | `.env.local` + `.env` |
| Google Drive | ✅ Configured | `.env.local` + `.env` |
| Dropbox | ✅ Configured | `.env.local` + `.env` |
| Dodo Payments | ⚠️ PENDING KEYS | Structure built, needs user keys |
| Gemini AI | ⚠️ PENDING KEYS | Needs user keys |
| NextAuth Secret | ⚠️ DEV ONLY | Needs production secret |

---

## 💰 Payment System

- **Gateway**: Dodo Payments (Universal — supports India + Global cards, UPI, net banking)
- **Integration Files**: `src/lib/dodo-payments.ts`, `src/app/api/payments/*/route.ts`
- **Flow**: Pricing page → Dodo checkout dialog → Payment page → Webhook auto-activates premium
- **Plans**: Free (3 tools/day), Premium (unlimited), Enterprise (custom)
- **Invoice Tokens**: 1 token = 1 invoice, tracked in Prisma DB

---

## 🚀 Deployment Checklist

- [x] All code compiles with zero errors
- [x] Credentials saved in `.env.local` (gitignored)
- [x] `.env.local` added to `.gitignore`
- [ ] Dodo Payments API keys injected
- [ ] Gemini API keys injected
- [ ] Production `DATABASE_URL` (PostgreSQL) configured
- [ ] `NEXTAUTH_SECRET` changed for production
- [ ] `NEXTAUTH_URL` updated to production domain
- [ ] Git remote configured
- [ ] Vercel project connected
- [ ] Vercel env vars set from `.env.local`
- [ ] Final deploy & test

---

## 📝 Notes for Next Session

1. Start with "Memory Sync" prompt — read `.env.local` + `PROJECT_LOG.md`
2. Dodo Payments keys are the #1 priority for monetization
3. Gemini AI keys needed for AI-powered tools
4. Bulk Compress PDF is fully functional — no issues
5. `store.ts` spread order fix is CRITICAL — do not revert
6. Sign PDF preview now uses `next/font` CSS variables — do not use raw Google Font names
7. All routing is client-side via Zustand — no Next.js dynamic routes
8. Gateway/Caddy setup: API requests use `XTransformPort` query param for cross-service routing
9. Legal pages are isolated via separate Zustand `currentView` values — no interference with tools

---

*Last updated: 2025-07-17*
*Total sessions worked on: 3+*
*Project status: Feature-complete, pending deployment keys*
