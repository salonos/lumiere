// Browser-side Supabase client.
// Automatically reads + writes the session cookie set by @supabase/ssr,
// so every query from a "use client" component runs as the logged-in user
// and RLS policies scope data to that user's salon.

import { createClient } from '@supabase/supabase-js';

let supabaseClient: ReturnType<typeof createClient> | null = null;

const getSupabaseClient = () => {
  if (!supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error('Missing Supabase environment variables');
    }

    supabaseClient = createClient(url, key);
  }

  return supabaseClient;
};

export const supabase = new Proxy({}, {
  get: (target, prop) => {
    return (getSupabaseClient() as any)[prop];
  },
}) as ReturnType<typeof createClient>;

export { getSupabaseClient };