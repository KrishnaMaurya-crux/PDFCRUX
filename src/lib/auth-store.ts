import { create } from "zustand";
import { supabase } from "./supabase";
import type { User, Session } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthDialogOpen: boolean;
  authDialogMode: "login" | "signup";
  pendingAction: (() => void) | null;

  initialize: () => Promise<void>;
  setAuthDialogOpen: (open: boolean, mode?: "login" | "signup", pendingAction?: () => void) => void;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<{ error: string | null }>;
  loginWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  executePendingAction: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: true,
  isAuthDialogOpen: false,
  authDialogMode: "login",
  pendingAction: null,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        set({
          user: session.user,
          session,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          user: session?.user ?? null,
          session,
          isLoading: false,
        });
      });
    } catch {
      set({ isLoading: false });
    }
  },

  setAuthDialogOpen: (open, mode = "login", pendingAction = null) => {
    set({
      isAuthDialogOpen: open,
      authDialogMode: mode,
      pendingAction: pendingAction,
    });
  },

  signUpWithEmail: async (email, password, name) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
        },
      });

      if (error) {
        return { error: getErrorMessage(error.message) };
      }

      const { data: { session: newSession } } = await supabase.auth.getSession();
      if (newSession) {
        set({
          user: newSession.user,
          session: newSession,
          isAuthDialogOpen: false,
        });
        setTimeout(() => get().executePendingAction(), 100);
      } else {
        set({ isAuthDialogOpen: false });
      }

      return { error: null };
    } catch {
      return { error: "Something went wrong. Please try again." };
    }
  },

  loginWithEmail: async (email, password) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: getErrorMessage(error.message) };
      }

      const { data: { session: newSession } } = await supabase.auth.getSession();
      set({
        user: newSession?.user ?? null,
        session: newSession,
        isAuthDialogOpen: false,
      });

      setTimeout(() => get().executePendingAction(), 100);

      return { error: null };
    } catch {
      return { error: "Something went wrong. Please try again." };
    }
  },

  loginWithGoogle: async () => {
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${siteUrl}/api/auth/callback`,
        },
      });

      if (error) {
        console.error("Google OAuth error:", error);
      }
    } catch (err) {
      console.error("Google OAuth error:", err);
    }
  },

  logout: async () => {
    try {
      await supabase.auth.signOut();
      set({ user: null, session: null });
    } catch {
      // Silent fail
    }
  },

  executePendingAction: () => {
    const { pendingAction } = get();
    if (pendingAction) {
      pendingAction();
      set({ pendingAction: null });
    }
  },
}));

function getErrorMessage(message: string): string {
  if (message.includes("Invalid login")) return "Invalid email or password";
  if (message.includes("Email not confirmed")) return "Please verify your email first";
  if (message.includes("User already registered")) return "An account with this email already exists";
  if (message.includes("Password should be")) return "Password must be at least 6 characters";
  if (message.includes("Invalid email")) return "Please enter a valid email address";
  if (message.includes("Too many requests")) return "Too many attempts. Please try again later";
  if (message.includes("Network")) return "Network error. Please check your connection";
  return message;
}
