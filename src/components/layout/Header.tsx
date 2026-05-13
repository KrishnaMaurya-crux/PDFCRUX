"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  ChevronDown,
  Search,
  ArrowRight,
  X,
  Command,
  LogIn,
  LogOut,
  User,
  Mail,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  UserCircle,
  Sun,
  Moon,
  Crown,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { toolCategories, getAllTools, type Tool } from "@/lib/tools";
import { useAppStore } from "@/lib/store";
import { useLanguage } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useTheme } from "next-themes";
import { useState as useSyncState } from "react";
import type { User as SupabaseUser, Session } from "@supabase/supabase-js";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { navigateHome, selectTool, navigateHistory, navigatePricing, authDialogOpen, closeAuthDialog } = useAppStore();
  const { t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useSyncState(false);

  // Avoid hydration mismatch for theme toggle
  useEffect(() => setMounted(true), []);

  // Auth state
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [signOutOpen, setSignOutOpen] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Get user session on mount (only when Supabase is configured)
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Keyboard shortcut: Ctrl/Cmd + K to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [searchOpen]);

  const allTools = useMemo(() => getAllTools(), []);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allTools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q)
    );
  }, [searchQuery, allTools]);

  // Group search results by category
  const groupedResults = useMemo(() => {
    const groups: { category: string; tools: Tool[] }[] = [];
    searchResults.forEach((tool) => {
      const cat = toolCategories.find((c) =>
        c.tools.some((t) => t.id === tool.id)
      );
      const catName = cat?.name || "Other";
      const existing = groups.find((g) => g.category === catName);
      if (existing) {
        existing.tools.push(tool);
      } else {
        groups.push({ category: catName, tools: [tool] });
      }
    });
    return groups;
  }, [searchResults]);

  // Google Sign In
  const handleGoogleSignIn = useCallback(async () => {
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      if (error) {
        setAuthMessage({ type: "error", text: error.message });
      }
    } catch {
      setAuthMessage({ type: "error", text: "Something went wrong. Please try again." });
    } finally {
      setAuthLoading(false);
    }
  }, []);

  // Email Sign Up / Sign In
  const handleEmailAuth = useCallback(async () => {
    if (!formEmail.trim() || !formPassword.trim()) {
      setAuthMessage({ type: "error", text: "Please fill in all fields." });
      return;
    }

    setAuthLoading(true);
    setAuthMessage(null);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formEmail,
          password: formPassword,
          name: formName,
          action: authMode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAuthMessage({ type: "error", text: data.error || "Authentication failed." });
        return;
      }

      if (authMode === "signup") {
        setAuthMessage({
          type: "success",
          text: data.message || "Account created! Please check your email to verify your account.",
        });
      } else {
        setAuthMessage({ type: "success", text: "Welcome back!" });
        setTimeout(() => {
          setAuthOpen(false);
          setAuthMessage(null);
          resetForm();
        }, 800);
      }
    } catch {
      setAuthMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setAuthLoading(false);
    }
  }, [formEmail, formPassword, formName, authMode]);

  // Sign Out
  const handleSignOut = useCallback(async () => {
    setSignOutOpen(false);
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    navigateHome();
  }, [navigateHome]);

  const resetForm = () => {
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setShowPassword(false);
    setAuthMessage(null);
  };

  const openAuth = (mode: "signin" | "signup") => {
    setAuthMode(mode);
    setAuthOpen(true);
    resetForm();
  };

  // Listen for auth dialog trigger from other components (e.g., HeroSection CTA)
  useEffect(() => {
    if (authDialogOpen) {
      openAuth("signin");
      closeAuthDialog();
    }
  }, [authDialogOpen, closeAuthDialog]);

  // Get user display name
  const userDisplayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <button
            onClick={navigateHome}
            className="flex items-center gap-2.5 group flex-shrink-0"
          >
            <Image
              src="/logo.png"
              alt="PdfCrux Logo"
              width={36}
              height={36}
              className="w-9 h-9 rounded-lg group-hover:scale-105 transition-transform"
              priority
            />
            <div className="hidden sm:flex flex-col">
              <span className="text-lg font-bold leading-tight tracking-tight">
                Pdf<span className="text-primary">Crux</span>
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight font-medium">
                Every PDF Tool
              </span>
            </div>
          </button>

          {/* Desktop Nav — scrollable if too many items, right-side always visible */}
          <nav className="hidden lg:flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto no-scrollbar">
            {/* Pricing link */}
            <Button
              variant="ghost"
              className="text-xs font-medium text-muted-foreground hover:text-foreground gap-1.5 px-2 h-9 whitespace-nowrap"
              onClick={navigatePricing}
            >
              <Crown className="w-3.5 h-3.5 text-amber-500" />
              Pricing
            </Button>

            {toolCategories.map((category) => (
              <DropdownMenu key={category.id}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="text-xs font-medium text-muted-foreground hover:text-foreground gap-1 px-2 h-9 whitespace-nowrap"
                  >
                    {category.name}
                    <ChevronDown className="w-3.5 h-3.5 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-64 p-2"
                >
                  <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1">
                    {category.description}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {category.tools.map((tool) => (
                    <DropdownMenuItem
                      key={tool.id}
                      onClick={() => selectTool(tool.id)}
                      className="flex items-center gap-3 px-2 py-2 cursor-pointer rounded-lg"
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${tool.bgColor}`}
                      >
                        <tool.icon className={`w-4 h-4 ${tool.color}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{tool.name}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {tool.description}
                        </div>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
          </nav>

          {/* Right side: Search + Auth + Mobile — NEVER shrink, always visible */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Theme Toggle — always visible */}
            {mounted && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label="Toggle theme"
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4 text-amber-400" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            )}

            {/* Search Trigger — show on xl+ desktop, icon-only on lg */}
            <Button
              variant="outline"
              size="sm"
              className="hidden xl:inline-flex items-center gap-2 text-muted-foreground h-9 px-3 w-48 justify-start font-normal"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="w-3.5 h-3.5" />
              <span className="text-xs flex-1 text-left">Search tools...</span>
              <kbd className="pointer-events-none hidden xl:inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                <Command className="w-2.5 h-2.5" />K
              </kbd>
            </Button>

            {/* Search Icon — lg to xl screens */}
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex xl:hidden"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="w-4 h-4" />
            </Button>

            {/* Mobile Search Icon */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="w-5 h-5" />
            </Button>

            {/* Auth: Logged-in = avatar dropdown | Logged-out = Sign In — ALWAYS visible on sm+ */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="inline-flex items-center gap-2 h-9 px-3 border-primary/20 hover:border-primary/40"
                  >
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">
                        {userDisplayName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-xs font-medium max-w-[100px] truncate">
                      {userDisplayName}
                    </span>
                    <ChevronDown className="w-3 h-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 p-2">
                  <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1 font-normal">
                    {user.email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={navigateHistory}
                    className="flex items-center gap-2.5 px-2 py-2 cursor-pointer rounded-lg"
                  >
                    <Clock className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium">My History</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex items-center gap-2.5 px-2 py-2 cursor-pointer rounded-lg opacity-50"
                    disabled
                  >
                    <UserCircle className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium">Profile</span>
                    <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Soon</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setSignOutOpen(true)}
                    className="flex items-center gap-2.5 px-2 py-2 cursor-pointer rounded-lg text-red-600 focus:text-red-600"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-sm font-medium">Sign Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                size="sm"
                className="inline-flex items-center gap-1.5 shadow-lg shadow-primary/20"
                onClick={() => openAuth("signin")}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold hidden sm:inline">Sign In</span>
              </Button>
            )}

            {/* Mobile Sheet */}
            <Sheet>
              <SheetTrigger asChild className="lg:hidden">
                <Button variant="ghost" size="icon">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 p-0 overflow-y-auto">
                <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                <div className="p-6">
                  <div className="flex items-center gap-2.5 mb-6">
                    <Image src="/logo.png" alt="PdfCrux" width={32} height={32} className="w-8 h-8 rounded-lg" />
                    <span className="text-lg font-bold">
                      Pdf<span className="text-primary">Crux</span>
                    </span>
                  </div>

                  {/* Mobile user info */}
                  {user && (
                    <div className="mb-4 p-3 rounded-lg bg-muted/50 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-bold text-primary">
                          {userDisplayName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{userDisplayName}</div>
                        <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                      </div>
                    </div>
                  )}

                  {/* Mobile user menu items */}
                  {user && (
                    <div className="mb-4 space-y-1">
                      <button
                        onClick={navigateHistory}
                        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left text-sm"
                      >
                        <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        My History
                      </button>
                      <button
                        onClick={() => setSignOutOpen(true)}
                        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left text-sm text-red-600"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </div>
                  )}

                  {/* Mobile Theme Toggle */}
                  {mounted && (
                    <button
                      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left text-sm mb-4"
                    >
                      {theme === "dark" ? (
                        <Sun className="w-4 h-4 text-amber-400" />
                      ) : (
                        <Moon className="w-4 h-4" />
                      )}
                      {theme === "dark" ? "Light Mode" : "Dark Mode"}
                    </button>
                  )}

                  {/* Mobile search */}
                  <div className="relative mb-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search tools..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  {/* Mobile search results */}
                  <AnimatePresence>
                    {searchQuery.trim() && searchResults.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mb-6 space-y-1 max-h-48 overflow-y-auto"
                      >
                        {searchResults.map((tool) => (
                          <button
                            key={tool.id}
                            onClick={() => {
                              selectTool(tool.id);
                              setSearchQuery("");
                            }}
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-accent text-left text-sm"
                          >
                            <tool.icon className={`w-4 h-4 ${tool.color}`} />
                            {tool.name}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="space-y-5">
                    {toolCategories.map((category) => (
                      <div key={category.id}>
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                          {category.name}
                        </h3>
                        <div className="space-y-0.5">
                          {category.tools.map((tool) => (
                            <button
                              key={tool.id}
                              onClick={() => selectTool(tool.id)}
                              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left"
                            >
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${tool.bgColor}`}
                              >
                                <tool.icon
                                  className={`w-3.5 h-3.5 ${tool.color}`}
                                />
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium">
                                  {tool.name}
                                </div>
                                <div className="text-[11px] text-muted-foreground line-clamp-1">
                                  {tool.description}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Mobile Auth Button */}
                  {!user && (
                    <div className="mt-6">
                      <Button className="w-full gap-2" onClick={() => openAuth("signin")}>
                        <LogIn className="w-4 h-4" />
                        Sign In
                      </Button>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      {/* Auth Dialog - Premium Styled */}
      <Dialog open={authOpen} onOpenChange={(open) => { setAuthOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden border-0 shadow-2xl">
          {/* Top gradient band */}
          <div className="relative h-28 bg-gradient-to-br from-primary via-red-600 to-primary overflow-hidden">
            {/* Decorative circles */}
            <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full" />
            <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-white/5 rounded-full" />
            <div className="absolute top-4 right-12 w-16 h-16 bg-white/5 rounded-full" />

            {/* Logo centered */}
            <div className="relative flex flex-col items-center justify-center h-full">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                className="mb-2"
              >
                <Image src="/logo.png" alt="PdfCrux" width={48} height={48} className="w-12 h-12 rounded-xl shadow-lg" />
              </motion.div>
              <span className="text-white/90 text-sm font-medium">PdfCrux</span>
            </div>
          </div>

          {/* Content card overlapping gradient */}
          <div className="px-6 pb-6 -mt-5">
            <div className="bg-card rounded-2xl border shadow-sm p-5 space-y-5">
              <DialogHeader className="text-center space-y-1.5">
                <DialogTitle className="text-xl font-bold">
                  {authMode === "signin" ? "Welcome Back" : "Create Account"}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  {authMode === "signin"
                    ? "Sign in to access your PdfCrux account"
                    : "Join millions of professionals using PdfCrux"}
                </DialogDescription>
              </DialogHeader>

              {/* Google Sign In */}
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="w-full flex items-center justify-center gap-3 h-12 rounded-xl border-2 border-muted hover:border-primary/30 hover:bg-accent/30 transition-all text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleGoogleSignIn}
                disabled={authLoading}
              >
                {authLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                )}
                Continue with Google
              </motion.button>

              {/* Divider */}
              <div className="relative flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider whitespace-nowrap">
                  or use email
                </span>
                <Separator className="flex-1" />
              </div>

              {/* Email Form */}
              <div className="space-y-3">
                {authMode === "signup" && (
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Full name"
                      className="h-12 pl-10 rounded-xl border-muted text-sm"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                    />
                  </div>
                )}
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="Email address"
                    className="h-12 pl-10 rounded-xl border-muted text-sm"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                  />
                </div>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    className="h-12 pr-10 rounded-xl border-muted text-sm"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleEmailAuth(); }}
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
              </div>

              {/* Submit */}
              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                <Button
                  className="w-full h-12 text-sm font-bold rounded-xl shadow-lg shadow-primary/25"
                  onClick={handleEmailAuth}
                  disabled={authLoading}
                >
                  {authLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {authMode === "signin" ? "Sign In" : "Create Account"}
                </Button>
              </motion.div>

              {/* Auth Message */}
              <AnimatePresence>
                {authMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -5, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: -5, height: 0 }}
                    className={`flex items-center gap-2.5 p-3.5 rounded-xl text-sm ${
                      authMessage.type === "success"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                        : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800"
                    }`}
                  >
                    {authMessage.type === "success" ? (
                      <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    )}
                    <span className="text-xs font-medium">{authMessage.text}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Toggle Mode */}
              <p className="text-center text-sm text-muted-foreground">
                {authMode === "signin" ? "Don\u0027t have an account?" : "Already have an account?"}{" "}
                <button
                  className="text-primary font-bold hover:underline"
                  onClick={() => {
                    setAuthMode(authMode === "signin" ? "signup" : "signin");
                    setAuthMessage(null);
                  }}
                >
                  {authMode === "signin" ? "Sign Up" : "Sign In"}
                </button>
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sign Out Confirmation Dialog */}
      <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign Out</DialogTitle>
            <DialogDescription>
              Are you sure you want to sign out? You&apos;ll need to sign in again to access your history and saved data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSignOutOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleSignOut} className="gap-2">
              <LogOut className="w-4 h-4" />
              Yes, Sign Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Search Dialog */}
      <AnimatePresence>
        {searchOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery("");
              }}
            />
            {/* Search Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15 }}
              className="fixed top-[15%] left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-lg"
            >
              <div className="rounded-2xl border bg-card shadow-2xl overflow-hidden">
                {/* Search Input */}
                <div className="flex items-center gap-3 px-4 py-3 border-b">
                  <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search for a PDF tool..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
                    ESC
                  </kbd>
                </div>

                {/* Results */}
                <div className="max-h-72 overflow-y-auto">
                  {!searchQuery.trim() ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-sm text-muted-foreground">
                        Type to search across all PDF tools
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                        {["Merge", "Compress", "Word", "Sign", "Watermark"].map(
                          (tag) => (
                            <button
                              key={tag}
                              onClick={() => setSearchQuery(tag)}
                              className="text-xs px-2.5 py-1 rounded-full border hover:bg-accent transition-colors"
                            >
                              {tag}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-sm text-muted-foreground">
                        No tools found for &quot;{searchQuery}&quot;
                      </p>
                    </div>
                  ) : (
                    <div className="py-2">
                      {groupedResults.map((group) => (
                        <div key={group.category}>
                          <div className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            {group.category}
                          </div>
                          {group.tools.map((tool) => (
                            <button
                              key={tool.id}
                              onClick={() => {
                                selectTool(tool.id);
                                setSearchOpen(false);
                                setSearchQuery("");
                              }}
                              className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-accent/50 transition-colors text-left group"
                            >
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${tool.bgColor}`}
                              >
                                <tool.icon
                                  className={`w-4 h-4 ${tool.color}`}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium">
                                  {tool.name}
                                </div>
                                <div className="text-xs text-muted-foreground line-clamp-1">
                                  {tool.description}
                                </div>
                              </div>
                              <ArrowRight className="w-4 h-4 text-muted-foreground/40 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t bg-muted/30">
                  <p className="text-[10px] text-muted-foreground text-center">
                    {searchResults.length} tool{searchResults.length !== 1 ? "s" : ""} found
                    {" "}&middot; Press{" "}
                    <kbd className="px-1 py-0.5 rounded bg-muted border text-[10px]">
                      Enter
                    </kbd>{" "}
                    to select{" "}
                    <kbd className="px-1 py-0.5 rounded bg-muted border text-[10px]">
                      Esc
                    </kbd>{" "}
                    to close
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
