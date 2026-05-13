"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  ArrowRight,
  Shield,
  Zap,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/lib/auth-store";
import { useToast } from "@/hooks/use-toast";

export function AuthDialog() {
  const {
    isAuthDialogOpen,
    authDialogMode,
    setAuthDialogOpen,
    signUpWithEmail,
    loginWithEmail,
    loginWithGoogle,
    isLoading: authLoading,
  } = useAuthStore();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });
  const { toast } = useToast();

  // Sync mode with store
  const currentMode = authDialogMode || mode;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      let result;
      if (currentMode === "signup") {
        if (!formData.name.trim()) {
          setError("Please enter your name");
          setIsSubmitting(false);
          return;
        }
        if (formData.password.length < 6) {
          setError("Password must be at least 6 characters");
          setIsSubmitting(false);
          return;
        }
        result = await signUpWithEmail(formData.email, formData.password, formData.name);
      } else {
        result = await loginWithEmail(formData.email, formData.password);
      }

      if (result.error) {
        setError(result.error);
      } else if (currentMode === "signup") {
        toast({
          title: "Account created!",
          description: "Welcome to PdfCrux! Start using tools now.",
        });
      } else {
        toast({
          title: "Welcome back!",
          description: "You are now logged in.",
        });
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    await loginWithGoogle();
  };

  const handleClose = (open: boolean) => {
    setAuthDialogOpen(open);
    setError(null);
    setFormData({ name: "", email: "", password: "" });
  };

  return (
    <Dialog open={isAuthDialogOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden border-0 shadow-2xl">
        <DialogTitle className="sr-only">
          {currentMode === "login" ? "Sign In" : "Create Account"}
        </DialogTitle>
        {/* Header gradient */}
        <div className="relative bg-gradient-to-br from-primary via-primary/90 to-primary/80 px-6 pt-8 pb-6 text-primary-foreground overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-white/5 translate-y-1/2 -translate-x-1/2" />

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <span className="font-bold text-lg">PdfCrux</span>
              </div>
              <button
                onClick={() => handleClose(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={currentMode}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="text-2xl font-bold mb-1">
                  {currentMode === "login" ? "Welcome back!" : "Create account"}
                </h2>
                <p className="text-sm text-primary-foreground/80">
                  {currentMode === "login"
                    ? "Sign in to download your files"
                    : "Join PdfCrux — it's free"}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {/* Google OAuth Button */}
          <Button
            variant="outline"
            className="w-full h-12 text-sm font-medium gap-3 border-2 hover:border-primary/50 hover:bg-primary/5 transition-all"
            onClick={handleGoogleLogin}
            disabled={isSubmitting}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </Button>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-3 text-muted-foreground">
                or continue with email
              </span>
            </div>
          </div>

          {/* Error message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -5, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -5, height: 0 }}
                className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {currentMode === "signup" && (
                <motion.div
                  key="name"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="auth-name" className="text-sm font-medium">
                      Full Name
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="auth-name"
                        type="text"
                        placeholder="John Doe"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        className="pl-10 h-11"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <Label htmlFor="auth-email" className="text-sm font-medium">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="auth-email"
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="pl-10 h-11"
                  required
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="auth-password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  placeholder={
                    currentMode === "signup"
                      ? "Min 6 characters"
                      : "Enter password"
                  }
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  className="pl-10 pr-10 h-11"
                  required
                  disabled={isSubmitting}
                  minLength={currentMode === "signup" ? 6 : 1}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-sm font-semibold gap-2 shadow-lg shadow-primary/20"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {currentMode === "login"
                    ? "Signing in..."
                    : "Creating account..."}
                </>
              ) : (
                <>
                  {currentMode === "login" ? "Sign In" : "Create Account"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          {/* Switch mode */}
          <div className="mt-5 text-center text-sm text-muted-foreground">
            {currentMode === "login" ? (
              <>
                {"Don\u0027t have an account? "}&nbsp;
                <button
                  onClick={() => {
                    setMode("signup");
                    useAuthStore.getState().authDialogMode = "signup";
                  }}
                  className="text-primary font-semibold hover:underline"
                >
                  Sign up free
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => {
                    setMode("login");
                    useAuthStore.getState().authDialogMode = "login";
                  }}
                  className="text-primary font-semibold hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>

        {/* Footer benefits */}
        <div className="px-6 py-4 bg-muted/50 border-t">
          <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-500" />
              <span>Secure</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Fast</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>Free to use</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
