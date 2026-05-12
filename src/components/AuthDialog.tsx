"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { motion, AnimatePresence } from "framer-motion";
import {
  LogIn,
  LogOut,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
} from "lucide-react";

// ========================
// Google Logo SVG Component (Official colors)
// ========================
function GoogleLogo({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

// ========================
// Auth Context
// ========================
interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

let authContext: AuthContextType = {
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
};

// Auth listeners
const listeners: Set<() => void> = new Set();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

export function subscribeToAuth(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Initialize auth - call once on app mount
export async function initAuth() {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    authContext = {
      user: session?.user ?? null,
      session: session ?? null,
      loading: false,
      signOut: handleSignOut,
    };
    notifyListeners();

    // Listen for auth changes
    supabase.auth.onAuthStateChange((_event, session) => {
      authContext = {
        ...authContext,
        user: session?.user ?? null,
        session: session ?? null,
      };
      notifyListeners();
    });
  } catch (err) {
    console.error("Auth init failed:", err);
    authContext = {
      user: null,
      session: null,
      loading: false,
      signOut: async () => {},
    };
    notifyListeners();
  }
}

async function handleSignOut() {
  await supabase.auth.signOut();
}

export function useAuth(): AuthContextType {
  // We need to use React's useSyncExternalStore or useState trick
  // For simplicity, we'll use a component-based approach
  return authContext;
}

// React hook for auth
export function useAuthState(): AuthContextType & { subscribe: () => void } {
  const [, forceUpdate] = useState(0);
  const ctx = authContext;

  useEffect(() => {
    const unsub = subscribeToAuth(() => forceUpdate((n) => n + 1));
    return unsub;
  }, []);

  return { ...ctx, subscribe: () => {} };
}

// ========================
// Auth Dialog Component
// ========================
interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const { user, session } = useAuthState();

  if (session?.user) {
    return <SignedInMenu open={open} onOpenChange={onOpenChange} />;
  }

  return <SignInForm open={open} onOpenChange={onOpenChange} />;
}

function SignedInMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuthState();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Account</DialogTitle>
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center overflow-hidden">
              {user?.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt={user.user_metadata.full_name || user.email || ""}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-7 h-7 text-primary" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold truncate">
                {user?.user_metadata?.full_name || user?.user_metadata?.name || "User"}
              </h2>
              <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-sm font-medium">Signed In</span>
            </div>
            <p className="text-xs text-muted-foreground">
              You&apos;re signed in and ready to use all features.
            </p>
          </div>

          <Button
            variant="outline"
            className="w-full gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleSignOut}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            Sign Out
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SignInForm({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);

    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
          },
        });

        if (signUpError) {
          setError(signUpError.message);
        } else {
          setSuccessMsg("Account created! Check your email to verify.");
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          setError(signInError.message);
        } else {
          onOpenChange(false);
          setEmail("");
          setPassword("");
          setName("");
        }
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError("");

    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: siteUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        console.error("Google sign-in error:", error);
        setError(error.message || "Google sign-in failed. Please try again.");
        return;
      }

      // Open OAuth URL in a new tab to avoid iframe/sandbox restrictions
      if (data?.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      console.error("Google sign-in exception:", err);
      setError("Google sign-in failed. Please check your network connection and try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === "signin" ? "signup" : "signin");
    setError("");
    setSuccessMsg("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">
          {mode === "signin" ? "Sign In" : "Create Account"}
        </DialogTitle>
        {/* Header */}
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              {mode === "signin" ? (
                <LogIn className="w-5 h-5 text-primary-foreground" />
              ) : (
                <User className="w-5 h-5 text-primary-foreground" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold">
                {mode === "signin" ? "Welcome Back" : "Create Account"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Sign in to access your account"
                  : "Sign up for a free account"}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 pt-2">
          {/* Google Button with Official Logo */}
          <Button
            variant="outline"
            className="w-full gap-3 h-11 mb-4 text-sm font-medium hover:bg-accent"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <GoogleLogo className="w-5 h-5" />
            )}
            Continue with Google
          </Button>

          {/* Divider */}
          <div className="relative my-4">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs text-muted-foreground">
              or continue with email
            </span>
          </div>

          {/* Success message */}
          <AnimatePresence>
            {successMsg && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-3"
              >
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-sm text-emerald-600">
                  {successMsg}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-3"
              >
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <AnimatePresence mode="wait">
              {mode === "signup" && (
                <motion.div
                  key="name-field"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Full Name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="pl-10 h-11"
                      required={mode === "signup"}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-11"
                required
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 pr-10 h-11"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            <Button
              type="submit"
              className="w-full h-11 gap-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {mode === "signin" ? "Signing In..." : "Creating Account..."}
                </>
              ) : (
                <>
                  {mode === "signin" ? "Sign In" : "Create Account"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          {/* Switch mode */}
          <p className="text-center text-sm text-muted-foreground mt-4">
            {mode === "signin" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  onClick={switchMode}
                  className="text-primary font-medium hover:underline"
                >
                  Sign Up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={switchMode}
                  className="text-primary font-medium hover:underline"
                >
                  Sign In
                </button>
              </>
            )}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ========================
// Header Sign-In Button (visible when not logged in / avatar when logged in)
// ========================
export function AuthButton() {
  const { session, user } = useAuthState();
  const [open, setOpen] = useState(false);

  if (session?.user) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-2 py-1.5 hover:bg-primary/10 transition-all group"
        >
          <div className="w-7 h-7 rounded-full bg-primary/10 overflow-hidden flex items-center justify-center group-hover:ring-2 ring-primary/20 transition-all">
            {user?.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt={user.user_metadata.full_name || ""}
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-4 h-4 text-primary" />
            )}
          </div>
          <span className="text-xs font-medium text-primary hidden sm:inline max-w-[80px] truncate">
            {user?.user_metadata?.full_name?.split(" ")[0] || user?.user_metadata?.name?.split(" ")[0] || user?.email?.split("@")[0]}
          </span>
        </button>
        <AuthDialog open={open} onOpenChange={setOpen} />
      </>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 h-9 px-3 border-primary/30 hover:border-primary/50 hover:bg-primary/5"
        onClick={() => setOpen(true)}
      >
        <LogIn className="w-4 h-4" />
        <span className="text-xs font-medium">Sign In</span>
      </Button>
      <AuthDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
