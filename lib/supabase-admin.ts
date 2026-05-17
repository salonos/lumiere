// Admin Supabase client — uses the service role key which bypasses RLS.
// ONLY use this in server-side code (API routes, server actions).
// NEVER import this in any "use client" file or pass the client to the browser.

import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local — " +
        "find it in your Supabase dashboard under Project Settings → API.",
    );
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
