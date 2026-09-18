import { createClient } from "@supabase/supabase-js";

// These come from your Supabase project settings (Project Settings → API).
// The anon key is safe to expose in the browser — Row-Level Security is what
// actually protects your data. See the README for setup.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Helpful message during local setup if the .env file is missing.
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill it in.");
}

export const supabase = createClient(url, anonKey);
