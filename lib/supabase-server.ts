// Server-side Supabase client for use inside server components, route handlers,
// and server actions. Reads cookies from next/headers so queries run as the
// logged-in user.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createSupabaseServer() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        // Server components can't set cookies — middleware refreshes the session
        // on every request, so these are intentional no-ops here.
        set() {},
        remove() {},
      },
    },
  );
}
