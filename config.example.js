// Docuhotel — runtime config
// Copy this file to `config.js` and fill in your Supabase project credentials.
// `config.js` is gitignored.
window.DOCUHOTEL_CONFIG = {
  // Supabase project URL  — Settings → API → Project URL
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",

  // Supabase anon (public) key — Settings → API → anon / public
  // Safe to ship to the browser; RLS does the security.
  supabaseAnonKey: "eyJhbGciOi...your-anon-key...",

  // Storage bucket name (must match supabase/storage.sql)
  storageBucket: "docuhotel",

  // Optional: set to true to keep the localStorage-only mode (no backend).
  // Useful for offline demos or while you provision Supabase.
  offlineMode: false,
};
