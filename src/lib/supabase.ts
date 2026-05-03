import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const PLACEHOLDER_URL = "https://placeholder.supabase.co";
const PLACEHOLDER_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDYzNjEwMTMsImV4cCI6MTk2MTkzNzAxM30.placeholder";

const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient = createClient(
  isConfigured ? supabaseUrl! : PLACEHOLDER_URL,
  isConfigured ? supabaseAnonKey! : PLACEHOLDER_KEY,
  {
    auth: {
      persistSession: isConfigured,
      autoRefreshToken: isConfigured,
      detectSessionInUrl: isConfigured,
    },
  }
);

export const isSupabaseConfigured = isConfigured;
