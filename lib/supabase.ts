// Browser-side Supabase client.
// Automatically reads + writes the session cookie set by @supabase/ssr,
// so every query from a "use client" component runs as the logged-in user
// and RLS policies scope data to that user's salon.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient<any, any, any> | null = null;

const getSupabaseClient = (): SupabaseClient<any, any, any> => {
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

export const supabase: SupabaseClient<any, any, any> = new Proxy({} as SupabaseClient<any, any, any>, {
  get: (_target, prop) => {
    const client = getSupabaseClient() as any;
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
}) as SupabaseClient<any, any, any>;

export { getSupabaseClient };
