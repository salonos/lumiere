// Browser-side Supabase client.
// Automatically reads + writes the session cookie set by @supabase/ssr,
// so every query from a "use client" component runs as the logged-in user
// and RLS policies scope data to that user's salon.

import { createBrowserClient } from "@supabase/ssr";

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
