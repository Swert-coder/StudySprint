import { createClient } from '@supabase/supabase-js';

const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Supabase expects the project root (https://<project-ref>.supabase.co), not a
// service endpoint such as /rest/v1 or /auth/v1. Normalize pasted API URLs so
// auth requests are always built from the project root.
const normalizeSupabaseUrl = (url) => {
  if (!url) return '';
  try {
    const parsed = new URL(url.trim());
    parsed.pathname = parsed.pathname.replace(/\/(?:auth|rest|storage|functions)\/v1\/?$/i, '/') || '/';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.trim().replace(/\/$/, '');
  }
};

const supabaseUrl = normalizeSupabaseUrl(configuredSupabaseUrl);

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
