"use client";

import { useEffect, useState } from "react";
import { ReactNode } from "react";
import { initAuth } from "@/components/AuthDialog";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ExternalLink, X } from "lucide-react";

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  useEffect(() => {
    initAuth();

    // Check for auth errors in URL (Supabase redirects back with ?auth=error on failure)
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth");
    if (authError === "error") {
      setShowSetupGuide(true);
      // Clean the URL without reloading
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, []);

  const closeGuide = () => setShowSetupGuide(false);

  return (
    <>
      {children}
      <AuthSetupGuide open={showSetupGuide} onClose={closeGuide} />
    </>
  );
}

// ==========================================
// Setup Guide Dialog - shown when auth fails
// ==========================================
function AuthSetupGuide({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Auth Setup Required</DialogTitle>
        <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-red-950/30 p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-amber-900 dark:text-amber-100">
                Setup Required
              </h2>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Google Sign In needs a quick one-time setup
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <DialogHeader className="sr-only">
            <DialogDescription>
              Follow these steps to enable Google Sign In in your Supabase project.
            </DialogDescription>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Supabase mein Google OAuth configure karna padega. Neeche 3 simple steps follow karo:
          </p>

          {/* Step 1 */}
          <SetupStep
            number={1}
            title="Supabase Dashboard → Google Provider"
            description="Authentication → Providers → Google mein Client ID aur Secret daalo"
          >
            <div className="mt-2 space-y-1.5 text-xs">
              <p className="font-medium text-muted-foreground">Open karo:</p>
              <a
                href="https://supabase.com/dashboard/project/lbmiztwymaujnaxvfwuf/auth/providers"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium"
              >
                Supabase Auth Providers
                <ExternalLink className="w-3 h-3" />
              </a>
              <div className="rounded-lg bg-muted/60 p-3 space-y-1.5 font-mono text-[11px] break-all">
                <div>
                  <span className="text-muted-foreground">Client ID:</span>{" "}
                  <span className="text-foreground">
                    {process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID || "(set in .env.local)"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Client Secret:</span>{" "}
                  <span className="text-foreground">(set directly in Supabase Dashboard)</span>
                </div>
              </div>
              <p className="text-muted-foreground">→ Save click karo</p>
            </div>
          </SetupStep>

          {/* Step 2 */}
          <SetupStep
            number={2}
            title="Supabase → URL Configuration"
            description="Site URL aur Redirect URLs set karo"
          >
            <div className="mt-2 space-y-1.5 text-xs">
              <a
                href="https://supabase.com/dashboard/project/lbmiztwymaujnaxvfwuf/auth/url-configuration"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium"
              >
                Supabase URL Configuration
                <ExternalLink className="w-3 h-3" />
              </a>
              <div className="rounded-lg bg-muted/60 p-3 space-y-1 font-mono text-[11px] break-all">
                <div>
                  <span className="text-muted-foreground">Site URL:</span>{" "}
                  <span className="text-foreground">https://allin1pdf.space.z.ai</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Redirect URLs:</span>{" "}
                  <span className="text-foreground">https://allin1pdf.space.z.ai/**</span>
                </div>
              </div>
              <p className="text-muted-foreground">→ Save click karo</p>
            </div>
          </SetupStep>

          {/* Step 3 */}
          <SetupStep
            number={3}
            title="Google Cloud Console → Redirect URI"
            description="Google ko batana padega ki Supabase callback allow hai"
          >
            <div className="mt-2 space-y-1.5 text-xs">
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium"
              >
                Google Cloud Console Credentials
                <ExternalLink className="w-3 h-3" />
              </a>
              <div className="rounded-lg bg-muted/60 p-3 space-y-1 font-mono text-[11px] break-all">
                <div>
                  <span className="text-muted-foreground">Authorized redirect URI:</span>{" "}
                  <span className="text-foreground">
                    https://lbmiztwymaujnaxvfwuf.supabase.co/auth/v1/callback
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">JavaScript origin:</span>{" "}
                  <span className="text-foreground">
                    https://lbmiztwymaujnaxvfwuf.supabase.co
                  </span>
                </div>
              </div>
              <p className="text-muted-foreground">→ Edit → add karo → Save click karo</p>
            </div>
          </SetupStep>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 p-3">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              ✅ Ye teen steps karne ke baad Google Sign In 100% kaam karega!
            </p>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
              Ek baar setup ho gaya toh baar baar nahi karna padega.
            </p>
          </div>

          <Button onClick={onClose} className="w-full">
            Got It, I&apos;ll Do It Now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SetupStep({
  number,
  title,
  description,
  children,
}: {
  number: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-xs font-bold text-primary">{number}</span>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        {children}
      </div>
    </div>
  );
}
