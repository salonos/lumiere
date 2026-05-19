// Browser-side Supabase client.
// Uses @supabase/ssr so the session lives in cookies and is shared with the
// server-side client in lib/supabase-server.ts. Every query from a
// "use client" component runs as the logged-in user, and RLS scopes data
// to that user's salon.

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient<any, any, any> | null = null;

const getSupabaseClient = (): SupabaseClient<any, any, any> => {
  if (!supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error("Missing Supabase environment variables");
    }

    supabaseClient = createBrowserClient(url, key) as SupabaseClient<any, any, any>;
  }

  return supabaseClient;
};

export const supabase: SupabaseClient<any, any, any> = new Proxy({} as SupabaseClient<any, any, any>, {
  get: (_target, prop) => {
    const client = getSupabaseClient() as any;
    const value = client[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as SupabaseClient<any, any, any>;

export { getSupabaseClient };
